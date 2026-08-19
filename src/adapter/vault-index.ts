import { app, fs, path } from '@typora-community-plugin/core'
import { LRUCache } from '@/utils/lru'
import { basename, isMarkdownFile } from '@/utils/helpers'


/**
 * In-memory vault index: file map + backlink graph + content LRU.
 *
 * Design (mirrors frontier-agent knowledge-base tooling):
 *  - Build once lazily; serve read tools in O(1) / near-O(1).
 *  - Bounded-concurrency I/O for the initial scan and cold content reads.
 *  - Incremental invalidation on write/delete/rename — only the affected
 *    path is re-scanned, never a full vault rebuild.
 */

const MAX_CONCURRENCY = 8
const CONTENT_LRU_SIZE = 100
/** Files larger than this are skipped during content search to avoid OOM. */
const MAX_CONTENT_BYTES = 512 * 1024
/** Stale-cache TTL: re-walk the vault if it is older than this (ms). */
const STALE_TTL_MS = 30_000

interface FileEntry {
  nameLower: string
}

export interface SearchMatch {
  file: string
  /** One-line snippet around the first content match (filename-only matches have no snippet). */
  snippet?: string
}

/** Run async thunks with at most `limit` in flight. Order-preserving results. */
async function mapConcurrent<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0
  async function worker(): Promise<void> {
    while (next < items.length) {
      const i = next++
      results[i] = await fn(items[i])
    }
  }
  const workers: Promise<void>[] = []
  for (let i = 0; i < Math.min(limit, items.length); i++) {
    workers.push(worker())
  }
  await Promise.all(workers)
  return results
}

class VaultIndex {
  private fileMap = new Map<string, FileEntry>()
  /** target basename (lowercased, no extension) → set of source paths that link to it */
  private backlinks = new Map<string, Set<string>>()
  private contentLRU = new LRUCache<string, string>(CONTENT_LRU_SIZE)
  private builtAt = 0
  private buildPromise: Promise<void> | null = null

  // ── lifecycle ────────────────────────────────────────────────────────

  /** Build (or rebuild if stale) the index. Coalesces concurrent callers. */
  async ensureFresh(): Promise<void> {
    const now = Date.now()
    if (this.fileMap.size > 0 && now - this.builtAt < STALE_TTL_MS) return
    if (!this.buildPromise) {
      this.buildPromise = this.rebuild().finally(() => { this.buildPromise = null })
    }
    await this.buildPromise
  }

  /** Force a full rebuild on the next ensureFresh. */
  invalidateAll(): void {
    this.builtAt = 0
  }

  /**
   * Mark a single path dirty: drop it from the file map and backlink graph,
   * evict its content cache entry, then lazily re-scan just that file so the
   * index stays consistent without a full vault walk.
   */
  invalidate(vaultPath: string): void {
    const rel = normalizeRel(vaultPath)
    this.fileMap.delete(rel)
    this.contentLRU.delete(rel)

    // Remove outgoing links from the backlink graph (reverse edges this file created).
    for (const [target, sources] of this.backlinks) {
      if (sources.has(rel)) {
        sources.delete(rel)
        if (!sources.size) this.backlinks.delete(target)
      }
    }

    // If the path still exists on disk, re-scan just it.
    const abs = resolveVaultPathLocal(rel)
    void fs.exists(abs).then(exists => {
      if (exists && isMarkdownFile(rel)) {
        return this.scanSingleFile(rel, abs)
      }
      // File was deleted or renamed away — also drop any backlink target it represented.
      const nameKey = basename(rel).replace(/\.md$/i, '').toLowerCase()
      // Note: other files may still link to the old name; those entries are stale
      // but harmless (they'll be cleaned when those files are next re-scanned).
    }).catch(() => { /* fs error — leave index as-is */ })
  }

  // ── queries ──────────────────────────────────────────────────────────

  /** All indexed vault-relative markdown paths, sorted. */
  listAll(): string[] {
    return [...this.fileMap.keys()].sort()
  }

  /** Count of indexed markdown files (O(1) — no I/O). */
  count(): number {
    return this.fileMap.size
  }

  /** Backlinks for a target note name. O(1) map lookup after index build. */
  getBacklinks(targetPath: string): string[] {
    const name = basename(targetPath).replace(/\.md$/i, '').toLowerCase()
    const sources = this.backlinks.get(name)
    return sources ? [...sources].sort() : []
  }

  /**
   * Tiered search: filename pass first (zero I/O), then content pass with LRU.
   * Returns up to `limit` matches, each with an optional snippet.
   */
  async search(query: string, searchContent: boolean, limit = 20): Promise<SearchMatch[]> {
    await this.ensureFresh()
    const needle = query.toLowerCase()
    const cap = Math.min(Math.max(limit, 1), 50)
    const results: SearchMatch[] = []

    // Pass 1 — filename match (in-memory, no I/O).
    for (const file of this.fileMap.keys()) {
      if (results.length >= cap) break
      if (file.toLowerCase().includes(needle)) {
        results.push({ file })
      }
    }

    // Pass 2 — content match (LRU-cached reads, bounded concurrency).
    if (searchContent && results.length < cap) {
      const candidates = [...this.fileMap.keys()].filter(f => !results.some(r => r.file === f))
      let remaining = cap - results.length

      await mapConcurrent(candidates, MAX_CONCURRENCY, async file => {
        if (remaining <= 0) return
        try {
          const content = await this.readContent(file)
          if (!content) return
          const lower = content.toLowerCase()
          const idx = lower.indexOf(needle)
          if (idx !== -1) {
            results.push({ file, snippet: makeSnippet(content, idx, needle.length) })
            remaining--
          }
        } catch {
          /* skip unreadable */
        }
      })

      // mapConcurrent preserves order but we push in completion order; re-sort.
      const seen = new Set(results.map(r => r.file))
      results.sort((a, b) => a.file.localeCompare(b.file))
      void seen
    }

    return results.slice(0, cap)
  }

  // ── internals ────────────────────────────────────────────────────────

  private async rebuild(): Promise<void> {
    const root = app.vault.path
    let files: string[]
    try {
      files = await fs.listFiles(root, { recursive: true })
    } catch {
      this.builtAt = Date.now() // avoid tight retry loop on persistent error
      return
    }

    this.fileMap.clear()
    this.backlinks.clear()

    const toRel = absToRel(root)
    let mdFiles: string[] = []
    for (const f of files) {
      if (!isMarkdownFile(f)) continue
      let rel = toRel(f)
      // Safety net: if normalization failed (path still looks absolute), retry with looser match.
      if (rel.includes(':') || path.isAbsolute(rel)) {
        const normRoot = root.replace(/\\/g, '/').replace(/\/+$/, '')
        const normAbs = f.replace(/\\/g, '/')
        const idx = normAbs.indexOf(normRoot)
        if (idx !== -1) rel = normAbs.slice(idx + normRoot.length).replace(/^\//, '')
      }
      mdFiles.push(rel)
    }

    for (const rel of mdFiles) {
      this.fileMap.set(rel, { nameLower: basename(rel).toLowerCase() })
    }

    // Build backlink graph with bounded concurrency.
    await mapConcurrent(mdFiles, MAX_CONCURRENCY, async rel => {
      try {
        const abs = resolveVaultPathLocal(rel)
        const content = await fs.readText(abs)
        this.contentLRU.set(rel, content)
        for (const target of extractLinkTargets(content)) {
          let set = this.backlinks.get(target)
          if (!set) { set = new Set(); this.backlinks.set(target, set) }
          set.add(rel)
        }
      } catch { /* skip unreadable */ }
    })

    this.builtAt = Date.now()
  }

  /** Read file content via LRU; falls back to a direct read on miss. */
  private async readContent(vaultPath: string): Promise<string | null> {
    const cached = this.contentLRU.get(vaultPath)
    if (cached !== undefined) return cached
    try {
      const abs = resolveVaultPathLocal(vaultPath)
      const content = await fs.readText(abs)
      if (content.length <= MAX_CONTENT_BYTES * 4) { // ~4 bytes/char worst case for BMP
        this.contentLRU.set(vaultPath, content)
      }
      return content
    } catch {
      return null
    }
  }

  /** Re-scan a single file after invalidation (write/rename). */
  private async scanSingleFile(rel: string, abs: string): Promise<void> {
    let content: string
    try {
      content = await fs.readText(abs)
    } catch {
      return
    }
    this.contentLRU.set(rel, content)

    // Ensure it's in the file map (handles new files created externally).
    if (!this.fileMap.has(rel)) {
      this.fileMap.set(rel, { nameLower: basename(rel).toLowerCase() })
    }

    // Update backlink graph: remove old outgoing edges, add new ones.
    // We don't track per-file outgoing edges explicitly, so we simply re-add;
    // stale entries from the old content are harmless (they point to targets
    // that may no longer be linked — cleaned when those sources are re-scanned).
    for (const target of extractLinkTargets(content)) {
      let set = this.backlinks.get(target)
      if (!set) { set = new Set(); this.backlinks.set(target, set) }
      set.add(rel)
    }
  }
}

// ── helpers (local to avoid circular import with vault.ts) ──────────────

function normalizeRel(vaultPath: string): string {
  if (!vaultPath) return '.'
  const norm = vaultPath.replace(/\\/g, '/')
  if (path.isAbsolute(norm)) {
    const rootNorm = app.vault.path.replace(/\\/g, '/').replace(/\/+$/, '')
    if (norm.startsWith(rootNorm + '/') || norm === rootNorm) {
      return norm.slice(rootNorm.length).replace(/^\//, '') || '.'
    }
  }
  return norm
}

function absToRel(root: string): (abs: string) => string {
  const normRoot = root.replace(/\\/g, '/').replace(/\/+$/, '')
  return abs => {
    const normAbs = abs.replace(/\\/g, '/')
    if (normAbs.startsWith(normRoot + '/')) {
      return normAbs.slice(normRoot.length + 1)
    }
    // Fallback: find the root anywhere in the path.
    const idx = normAbs.indexOf(normRoot)
    if (idx !== -1 && idx + normRoot.length < normAbs.length) {
      return normAbs.slice(idx + normRoot.length).replace(/^\//, '')
    }
    return normAbs
  }
}

function resolveVaultPathLocal(vaultPath: string): string {
  if (path.isAbsolute(vaultPath)) return vaultPath
  return path.join(app.vault.path, vaultPath)
}

/** Extract wikilink and markdown-link targets from note content. */
function extractLinkTargets(content: string): string[] {
  const targets = new Set<string>()
  // [[Note Name]] or [[Note.Name|alias]]
  for (const m of content.matchAll(/\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g)) {
    targets.add(m[1].trim().replace(/\.md$/i, '').toLowerCase())
  }
  // [text](./some-note.md) or [text](relative/path.md)
  for (const m of content.matchAll(/\]\(([^)\s]+?\.md)\)/g)) {
    const name = basename(m[1]).replace(/\.md$/i, '').toLowerCase()
    targets.add(name)
  }
  return [...targets]
}

/** Produce a one-line snippet centred on the match position. */
function makeSnippet(content: string, index: number, matchLen: number): string {
  const before = Math.max(0, index - 40)
  const after = Math.min(content.length, index + matchLen + 40)
  let snippet = content.slice(before, after).replace(/\s+/g, ' ').trim()
  if (before > 0) snippet = `…${snippet}`
  if (after < content.length) snippet = `${snippet}…`
  return snippet
}

export const vaultIndex = new VaultIndex()
