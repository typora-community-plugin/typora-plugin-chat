import { app, fs } from '@typora-community-plugin/core'

/** Vault-relative path of the project instructions file (AGENTS.md convention). */
export const AGENTS_MD_PATH = 'AGENTS.md'

/** Cache TTL: re-read at most once a minute so edits are picked up without a plugin restart. */
const CACHE_TTL_MS = 60_000
/** Files larger than this are truncated instead of injected in full. */
const MAX_AGENTS_MD_CHARS = 32_000

interface CacheEntry {
  at: number
  content: string
}

let cache: CacheEntry | null = null
let inFlight: Promise<string> | null = null

/**
 * Read the vault-root AGENTS.md (project instructions for coding agents).
 * Missing or unreadable files yield an empty string so callers can treat
 * "no AGENTS.md" exactly like today's behavior. Results are cached briefly
 * to keep per-turn cost at zero I/O in steady state.
 */
export async function loadAgentsMd(): Promise<string> {
  const now = Date.now()
  if (cache && now - cache.at < CACHE_TTL_MS) return cache.content

  if (!inFlight) {
    inFlight = read().then(content => {
      cache = { at: Date.now(), content }
      return content
    }).finally(() => { inFlight = null })
  }
  return inFlight
}

async function read(): Promise<string> {
  const root = app.vault.path
  if (!root) return ''
  try {
    let exists: boolean
    try {
      exists = await fs.exists(root + '/' + AGENTS_MD_PATH)
    } catch {
      return ''
    }
    if (!exists) return ''
    const text = (await fs.readText(root + '/' + AGENTS_MD_PATH)).trim()
    if (!text) return ''
    return text.length > MAX_AGENTS_MD_CHARS ? text.slice(0, MAX_AGENTS_MD_CHARS) : text
  } catch {
    return ''
  }
}

/** Append project instructions as a trailing system-prompt section. */
export function appendAgentsMd(prompt: string, agentsMd = ''): string {
  const trimmed = agentsMd.trim()
  return trimmed ? `${prompt}\n\n## Project instructions (AGENTS.md)\n${trimmed}` : prompt
}

/** Reset the cache (tests). */
export function resetAgentsMdCache(): void {
  cache = null
  inFlight = null
}
