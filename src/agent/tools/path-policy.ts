/**
 * Forbidden-path policy for the agent's vault file tools.
 *
 * The user can configure simple glob patterns (one per line) in plugin
 * settings; anything matching is invisible to `list_files` / `search_vault`
 * and blocked by `read_file`, `create_file`, `delete_file`, `rename_file`,
 * as well as every read/write helper in `@/adapter/vault`.
 */

import { settingsManager } from '@/config/settings'

/** Always-forbidden patterns, applied on top of whatever the user configures. */
export const BUILTIN_FORBIDDEN_GLOBS = [
  '.git',
  '**/.git',
  'node_modules',
  '**/node_modules',
  '*.apikey',
] as const

interface CompiledGlob {
  /**
   * Anchored regex over the directory part of a vault-relative path
   * (the leading `seg1/seg2/...` without trailing slash; '' for root files).
   * Null means "no directory constraint" — matches at any depth.
   */
  dir: RegExp | null
  /**
   * Anchored regex over one name segment, or null when the pattern is
   * directory-only (e.g. `drafts/**`), in which case matching `dir` suffices.
   */
  leaf: RegExp | null
}

/** Convert one glob segment to an anchored regex over a single path level. */
function segmentToRegExp(segment: string): RegExp {
  if (segment === '**' || segment === '*') return new RegExp('.*', 'i')
  let out = ''
  for (let i = 0; i < segment.length; i++) {
    const ch = segment[i]
    if (ch === '*') out += '.*'
    else if (ch === '?') out += '.'
    else out += ch.replace(/[.+^${}()|[\]\\]/g, '\\$&')
  }
  return new RegExp(`^${out}$`, 'i')
}

/** Unanchored regex source for one glob segment. */
function segmentToSource(segment: string): string {
  let out = ''
  for (let i = 0; i < segment.length; i++) {
    const ch = segment[i]
    if (ch === '*') out += '.*'
    else if (ch === '?') out += '.'
    else out += ch.replace(/[.+^${}()|[\]\\]/g, '\\$&')
  }
  return out
}

function compile(pattern: string): CompiledGlob | null {
  const norm = pattern.trim().replace(/\\/g, '/')
  if (!norm) return null
  let p = norm.replace(/^\.\//, '').replace(/\/+$/, '')
  if (p === '**' || !p) return null

  const segments = p.split('/')
  // A leading `**/` means "at any depth" → drop it and match the rest anywhere.
  if (segments[0] === '**') {
    segments.shift()
    if (!segments.length) return null
  }

  let dir: RegExp | null = null
  let leaf: RegExp | null

  if (segments.length > 1) {
    const lastSegment = segments[segments.length - 1]
    // Each non-`**` segment matches exactly one path level; `**` matches zero
    // or more whole levels. The directory regex is anchored at the start of
    // the relative path and must consume a trailing `/`.
    const dirSource = segments
      .slice(0, -1)
      .map(seg => (seg === '**' ? '(?:[^/]+/)??' : `${segmentToSource(seg)}/`))
      .join('')
    dir = new RegExp(`^${dirSource}`, 'i')

    if (lastSegment === '**' || lastSegment === '*') {
      // e.g. `drafts/**` → directory-only: everything under `drafts/`.
      leaf = null
    } else {
      leaf = segmentToRegExp(lastSegment)
    }
  } else {
    // Single-segment pattern (e.g. `.git`, `node_modules`, `*.apikey`):
    // matches a path segment with this name at any depth — either the file's
    // own name or one of its ancestor directory names.
    leaf = segmentToRegExp(segments[0])
    dir = null
  }

  return { dir, leaf }
}

/** Check a vault-relative (forward-slash) path against one compiled pattern. */
function matchesCompiled(compiled: CompiledGlob, relPath: string): boolean {
  if (!relPath) return false
  const segments = relPath.split('/')

  // Directory part without trailing slash; '' for a root-level file.
  const dirPart = segments.slice(0, -1).join('/')

  if (compiled.dir === null) {
    // No directory constraint: the single name must match any segment —
    // an ancestor directory or the final file/directory name itself.
    return segments.some(seg => compiled.leaf!.test(seg))
  }

  const dirOk = compiled.dir.test(dirPart + '/') || (dirPart === '' && relPath.endsWith('/'))
  if (!dirOk) return false

  // Directory-only pattern: matching the directory is enough.
  if (compiled.leaf === null) return true

  const leafName = segments[segments.length - 1]
  return compiled.leaf.test(leafName)
}

let cachedPatterns: CompiledGlob[] | null = null
let cachedRawKey: string | null = null

/** Compile the current policy (builtin globs + user setting), caching by raw text. */
export function getCompiledForbiddenGlobs(): CompiledGlob[] {
  const raw = settingsManager.get().forbiddenPaths ?? ''
  if (cachedPatterns && raw === cachedRawKey) return cachedPatterns
  const all: string[] = [...BUILTIN_FORBIDDEN_GLOBS, ...raw.split('\n')]
  const compiled = all
    .map(compile)
    .filter((c): c is CompiledGlob => c !== null)
  cachedRawKey = raw
  cachedPatterns = compiled
  return compiled
}

/** Whether a vault-relative path is forbidden by the current policy. */
export function isPathForbidden(vaultRelativePath: string): boolean {
  const norm = (vaultRelativePath || '').replace(/\\/g, '/').replace(/^\.\//, '')
  if (!norm) return false
  for (const compiled of getCompiledForbiddenGlobs()) {
    if (matchesCompiled(compiled, norm)) return true
  }
  return false
}

/** Human-readable description of the active policy, for error messages and prompts. */
export function forbiddenPathsDescription(): string {
  const raw = settingsManager.get().forbiddenPaths ?? ''
  const userGlobs = raw.split('\n').map(g => g.trim()).filter(Boolean)
  return [...BUILTIN_FORBIDDEN_GLOBS, ...userGlobs].join(', ')
}

/** Standard error payload for a blocked path. */
export function forbiddenPathError(toolName: string, vaultRelativePath: string): { content: string; isError: true } {
  const norm = (vaultRelativePath || '').replace(/\\/g, '/')
  return {
    content: `${toolName} failed: "${norm}" is a forbidden path (${forbiddenPathsDescription()}). It cannot be listed, read or modified.`,
    isError: true,
  }
}
