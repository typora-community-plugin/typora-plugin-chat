/**
 * Generic utility helpers shared across the plugin.
 */


export function truncate(text: string, max = 2000): string {
  if (!text || text.length <= max) return text || ''
  return `${text.slice(0, max)}…`
}

/**
 * Extract chain-of-thought text from an OpenAI-compatible chat message.
 * Covers the shapes used by reasoning models:
 * - `reasoning_content` (string) — DeepSeek, Qwen, GLM, Kimi…
 * - `reasoning` (string) — some OpenAI-compatible endpoints
 * - `reasoning` (array of `{ type, text }`) — OpenAI o-series chat completions
 */
export function extractReasoningContent(message: Record<string, unknown>): string {
  const parts: string[] = []

  const reasoningContent = message.reasoning_content
  if (typeof reasoningContent === 'string' && reasoningContent.trim()) {
    parts.push(reasoningContent.trim())
  }

  const reasoning = message.reasoning
  if (typeof reasoning === 'string') {
    if (reasoning.trim()) parts.push(reasoning.trim())
  } else if (Array.isArray(reasoning)) {
    for (const item of reasoning) {
      if (!item || typeof item !== 'object') continue
      const text = (item as Record<string, unknown>).text
      if (typeof text === 'string' && text.trim()) parts.push(text.trim())
    }
  }

  return parts.join('\n\n')
}

export function truncateMiddle(text: string, max = 80): string {
  if (!text || text.length <= max) return text || ''
  const half = Math.floor((max - 1) / 2)
  return `${text.slice(0, half)}…${text.slice(text.length - half)}`
}

export function createId(): string {
  try {
    return crypto.randomUUID()
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export function httpError(status: number, message: string, headers?: Headers): Error {
  const error = new Error(message) as Error & { status?: number; retryAfter?: string }
  error.status = status
  if (headers) {
    const retryAfter = headers.get('retry-after')
    if (retryAfter) error.retryAfter = retryAfter
  }
  return error
}

/** Exponential backoff for HTTP 429, capped at 30s. */
export function backoffDelay(retryCount: number, retryAfterHeader?: string | null): number {
  if (retryAfterHeader) {
    const seconds = Number(retryAfterHeader)
    if (Number.isFinite(seconds) && seconds > 0) return Math.min(seconds * 1000, 30_000)
  }
  return Math.min(1000 * 2 ** retryCount, 30_000)
}

export function isMarkdownFile(filePath: string): boolean {
  return /\.md$/i.test(filePath)
}

export function basename(filePath: string): string {
  const parts = filePath.split(/[\\/]/)
  return parts[parts.length - 1] || filePath
}

export function dirname(filePath: string): string {
  const parts = filePath.split(/[\\/]/)
  parts.pop()
  return parts.join('/') || '.'
}

/** Very small YAML frontmatter parser for get/set_properties tools. */
export function parseFrontmatter(markdown: string): Record<string, unknown> | null {
  if (!markdown.startsWith('---\n')) return null
  const end = markdown.indexOf('\n---', 4)
  if (end === -1) return null
  const yaml = markdown.slice(4, end)
  const result: Record<string, unknown> = {}
  for (const line of yaml.split('\n')) {
    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/)
    if (!match) continue
    const [, key, raw] = match
    result[key] = parseYamlScalar(raw)
  }
  return result
}

function parseYamlScalar(raw: string): unknown {
  if (raw === '') return ''
  if (raw === 'true') return true
  if (raw === 'false') return false
  if (/^-?\d+(\.\d+)?$/.test(raw)) return Number(raw)
  if (raw.startsWith('[') && raw.endsWith(']')) {
    return raw.slice(1, -1).split(',').map(s => s.trim().replace(/^["']|["']$/g, ''))
  }
  return raw.replace(/^["']|["']$/g, '')
}

export function stringifyYamlScalar(value: unknown): string {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return `[${value.map(v => String(v)).join(', ')}]`
  return String(value)
}
