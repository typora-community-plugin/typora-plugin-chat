import type { SubBrowserResult, ToolDefinition, ToolResult, ToolSummary } from '@/config/types'
import { SubBrowserManager } from '@/browser/subbrowser-manager'
import { getSubBrowserState, setSubBrowserState } from '@/store/subbrowser-store'
import { executeWebFetch, normalizeFetchUrl } from './web-fetch'

const DEFAULT_MAX_CHARS = 30_000
const DEFAULT_TIMEOUT_MS = 15_000
const MAX_MAX_CHARS = 200_000

/**
 * `subbrowser` — interactive iframe browser.
 *
 * Unlike `web_fetch` (static text fetch), this tool renders the page in a
 * panel-embedded iframe so dynamic content and layout are visible to the user,
 * then extracts title/URL/body/selector-scoped text from readable (same-origin)
 * pages. Cross-origin pages that cannot be read return an explicit hint; the
 * model may fall back to `web_fetch`.
 */
export const subbrowserSchema: ToolDefinition = {
  name: 'subbrowser',
  description:
    'Open a web page in the built-in mini browser (iframe) and extract data from it. Actions: "open" loads a URL (requires url); "extract" reads title/body/selector-scoped text of the open page; "status" reports current state; "close" removes the page. Pages that block embedding or are cross-origin unreadable return an error — use web_fetch as fallback.',
  parameters: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['open', 'extract', 'status', 'close'], description: 'The subbrowser action to perform.' },
      url: { type: 'string', description: 'http:// or https:// URL (required for "open").' },
      selector: { type: 'string', description: 'CSS selector to scope extraction ("extract"); omit for whole body text.' },
      max_chars: { type: 'number', description: `Maximum characters returned by "extract" (default ${DEFAULT_MAX_CHARS}).` },
      timeout_ms: { type: 'number', description: `Load/extract timeout in ms (default ${DEFAULT_TIMEOUT_MS}).` },
    },
    required: ['action'],
  },
}

export const summarizeSubBrowser: ToolSummary = (input, result) => {
  const action = typeof input.action === 'string' ? input.action : '(no action)'
  if (result?.isError) return `${action} — failed`
  if (typeof input.url === 'string' && input.url) return `${action} ${input.url}`
  return action
}

/**
 * `open` fallback when no panel is mounted: fetch the page as text via
 * web_fetch so the agent still receives usable content, and mark the store
 * state so the UI can surface a mini-browser bar (with an error) once it mounts.
 */
async function openWithoutPanel(url: string): Promise<ToolResult> {
  const fetched = await executeWebFetch({ url })
  if (!fetched.isError) {
    // Parse title from first heading in fetched content
    const titleMatch = fetched.content.match(/^#\s+(.+)$/m)
    const fallbackTitle = titleMatch ? titleMatch[1] : undefined
    setSubBrowserState('loaded', { url, fallbackContent: fetched.content, fallbackTitle })
    return {
      content: `The live mini-browser is not available in this context (panel pending); page fetched as text instead. You can use "extract" to get the cached content.\n\n${fetched.content}`,
    }
  }
  setSubBrowserState('error', { url, error: fetched.content.split('\n')[0] })
  return {
    content: `subbrowser open failed and web_fetch could not retrieve ${url} either:\n\n${fetched.content}\n\nHint: the host may block cross-origin requests (CORS) or Typora's web security settings may restrict it.`,
    isError: true,
  }
}

/** Validate a subbrowser URL; reuses web_fetch normalization semantics. */
export function normalizeSubBrowserUrl(raw: unknown): { url: string | null; error?: string } {
  const result = normalizeFetchUrl(raw)
  // Rebrand the failure prefix so tool errors are attributed to subbrowser,
  // while keeping web-fetch's exact validation behavior (including the
  // https:// auto-prefix for bare hostnames).
  return result.url ? result : { url: null, error: `subbrowser failed: ${result.error ?? 'invalid url'}` }
}

function readMaxChars(input: Record<string, unknown>): number {
  const value = input.max_chars
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_MAX_CHARS
  return Math.min(Math.max(1, Math.floor(value)), MAX_MAX_CHARS)
}

function readTimeoutMs(input: Record<string, unknown>): number {
  const value = input.timeout_ms
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_TIMEOUT_MS
  return Math.min(Math.max(500, Math.floor(value)), 60_000)
}

function formatResult(r: SubBrowserResult): ToolResult {
  const lines: string[] = []
  if (r.title) lines.push(`# ${r.title}`)
  if (r.finalUrl && r.finalUrl !== r.url) lines.push(`final URL: ${r.finalUrl}`)
  if (typeof r.content === 'string' && r.content.length) lines.push(r.content)
  const body = lines.join('\n\n')
  return { content: body || `subbrowser: no readable content (${r.status})` }
}

/**
 * Execute a subbrowser action against the shared SubBrowserManager.
 * Every failure path returns an error ToolResult; this function never throws.
 */
export async function executeSubBrowser(input: Record<string, unknown>): Promise<ToolResult> {
  const action = input.action
  if (typeof action !== 'string' || !['open', 'extract', 'status', 'close'].includes(action)) {
    return { content: `subbrowser failed: invalid or missing "action" (${String(action)})`, isError: true }
  }

  // "open" validates its url first so input errors are reported even when no
  // UI panel is attached; the other actions need a live manager.
  if (action === 'open') {
    const { url, error } = normalizeSubBrowserUrl(input.url)
    if (!url) return { content: `subbrowser failed: ${error}`, isError: true }
    const manager = getSubBrowserManager()
    if (!manager) {
      // No panel is mounted yet (the UI only renders it while the agent runs).
      // Keep the call useful instead of hard-failing: fetch the page text via
      // web_fetch and report that the live preview is unavailable. The store
      // keeps its "loading" state, so the panel mounts as soon as App re-renders.
      setSubBrowserState('loading', { url })
      return await openWithoutPanel(url)
    }
    const result = await manager.open(url, readTimeoutMs(input))
    if (result.status === 'error') {
      // A blocked embed is not fatal — suggest the static fallback.
      return { content: `${result.error ?? 'open failed'}\n\nHint: try web_fetch for ${url}.`, isError: true }
    }
    const meta = [result.title ? `# ${result.title}` : '', result.finalUrl && result.finalUrl !== url ? `final URL: ${result.finalUrl}` : '']
      .filter(Boolean)
      .join('\n')
    return { content: `Page opened in sub-browser.${meta ? `\n\n${meta}` : ''}\nExtract text with action "extract".` }
  }

  const manager = getSubBrowserManager()
  if (!manager) {
    // The panel mounts as soon as the store leaves "idle"; an open call without
    // a panel sets it to "loading", so these actions normally see live state.
    const ui = getSubBrowserState()
    const stateLine = `state: ${ui.state}` + (ui.url ? ` · url: ${ui.url}` : '')
    switch (action) {
      case 'status':
        return { content: `${stateLine}${ui.fallbackContent ? ' · content available from fallback fetch' : ' · no page loaded yet — call open first'}` }
      case 'extract':
        if (ui.fallbackContent) {
          const maxChars = readMaxChars(input)
          let content = ui.fallbackContent
          if (content.length > maxChars) {
            content = content.slice(0, maxChars) + '\n\n...(truncated)'
          }
          return { content: `${ui.fallbackTitle ? `# ${ui.fallbackTitle}\n\n` : ''}${content}` }
        }
        return { content: `subbrowser has no live panel in this context (${ui.state}); call "open" with a url first.`, isError: true }
      case 'close':
        setSubBrowserState('idle')
        return { content: 'Sub-browser closed (fallback mode).' }
      default:
        return { content: `subbrowser has no live panel in this context (${ui.state}); call "open" with a url first.`, isError: true }
    }
  }

  switch (action) {
    case 'extract': {
      const result = await manager.extract(
        typeof input.selector === 'string' && input.selector.trim() ? input.selector.trim() : undefined,
        readMaxChars(input),
      )
      if (result.isError || !result.content) {
        return { content: `subbrowser extract failed: ${result.error ?? 'no readable content'}\n\nHint: the page may be cross-origin unreadable — try web_fetch.`, isError: true }
      }
      return formatResult(result)
    }

    case 'status': {
      const result = manager.status()
      if (result.isError && !result.url) return { content: `subbrowser status: ${result.error ?? 'no page open'}`, isError: true }
      const parts = [`state: ${result.status}`]
      if (result.url) parts.push(`url: ${result.url}`)
      if (result.title) parts.push(`title: ${result.title}`)
      return { content: parts.join(' · ') }
    }

    case 'close': {
      const result = manager.close()
      return { content: `Sub-browser closed${result.url ? ` (${result.url})` : ''}.` }
    }

    default:
      return { content: `subbrowser failed: unknown action ${String(action)}`, isError: true }
  }
}

// ---------------------------------------------------------------------------
// Shared manager instance (created when a UI container is attached)
// ---------------------------------------------------------------------------

let sharedManager: SubBrowserManager | null = null

/** Attach the panel iframe to a DOM container; returns the shared manager. */
export function attachSubBrowser(container: HTMLElement): SubBrowserManager {
  if (!sharedManager) {
    sharedManager = new SubBrowserManager({ container })
  }
  return sharedManager
}

/** Detach the shared manager (panel unmount / agent stop). */
export function detachSubBrowser(): void {
  sharedManager?.dispose()
  sharedManager = null
  setSubBrowserState('idle')
}

/** Test-only: force-reset the shared manager so a fresh one is created on next attach. */
export function _resetSubBrowserForTest(): void {
  sharedManager?.dispose()
  sharedManager = null
  setSubBrowserState('idle')
}

function getSubBrowserManager(): SubBrowserManager | null {
  return sharedManager
}
