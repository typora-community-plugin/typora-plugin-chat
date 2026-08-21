import type { ToolDefinition, ToolResult, ToolSummary } from '@/config/types'
import { htmlToText } from '@/utils/html-to-text'


const DEFAULT_MAX_CHARS = 30_000
const MAX_BODY_BYTES = 5 * 1024 * 1024
const TRUNCATION_NOTICE_LEN = 64 // headroom so "… (truncated — …)" fits inside max_chars

export const webFetchSchema: ToolDefinition = {
  name: 'web_fetch',
  description:
    "Fetch a public http/https URL and return its content as readable text (HTML is converted to plain text). Use it to read web pages, cite online sources, or verify links. The result is truncated at max_chars.",
  parameters: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'The http:// or https:// URL to fetch.' },
      max_chars: {
        type: 'number',
        description: `Maximum number of characters to return (default ${DEFAULT_MAX_CHARS}).`,
      },
    },
    required: ['url'],
  },
}

export const summarizeWebFetch: ToolSummary = (input, result) => {
  const url = input.url
  const target = typeof url === 'string' && url ? url : '(no url)'
  if (!result || typeof result.content !== 'string' || !result.content.length) return target
  if (result.isError) return `${target} — failed`
  const chars = result.content.length
  return `${target} (${chars.toLocaleString()} chars${result.content.includes('(truncated)') ? ', truncated' : ''})`
}

/** Normalize user input into a valid http(s) URL; returns null when unusable. */
export function normalizeFetchUrl(raw: unknown): { url: string | null; error?: string } {
  if (typeof raw !== 'string' || !raw.trim()) return { url: null, error: 'url is required and must be a non-empty string' }
  let candidate = raw.trim()
  // Auto-prefix bare hostnames (e.g. "example.com/docs") with https://; never rewrite scheme-relative or other protocols.
  if (!/^[a-z][a-z0-9+.-]*:/i.test(candidate)) candidate = `https://${candidate}`
  let parsed: URL
  try {
    parsed = new URL(candidate)
  } catch {
    return { url: null, error: `invalid URL: ${raw.trim()}` }
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { url: null, error: `unsupported protocol "${parsed.protocol}" — only http:// and https:// are allowed` }
  }
  return { url: parsed.toString() }
}

function readMaxChars(input: Record<string, unknown>): number {
  const value = input.max_chars
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_MAX_CHARS
  return Math.min(Math.max(1, Math.floor(value)), 200_000)
}

function truncateContent(text: string, maxChars: number): { content: string; truncated: boolean } {
  const budget = Math.max(1, maxChars - TRUNCATION_NOTICE_LEN)
  if (text.length <= budget) return { content: text, truncated: false }
  return {
    content: `${text.slice(0, budget)}\n… (truncated — show ${budget.toLocaleString()} of ${text.length.toLocaleString()} chars)`,
    truncated: true,
  }
}

/**
 * Fetch a URL and return readable text. Every failure path returns an error
 * ToolResult; this function never throws.
 */
export async function executeWebFetch(input: Record<string, unknown>): Promise<ToolResult> {
  const { url, error } = normalizeFetchUrl(input.url)
  if (!url) return { content: `web_fetch failed: ${error}`, isError: true }

  const maxChars = readMaxChars(input)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15_000)
  let response: Response
  try {
    response = await fetch(url, { signal: controller.signal, redirect: 'follow' })
  } catch (error) {
    clearTimeout(timer)
    if ((error as Error)?.name === 'AbortError') {
      return { content: `web_fetch failed: request to ${url} timed out after 15s`, isError: true }
    }
    const detail = (error as Error)?.message || String(error)
    // Browser fetches reject with opaque errors for cross-origin hosts without CORS headers.
    if (/fetch|network|load/i.test(detail)) {
      return {
        content: `web_fetch failed: could not load ${url} (${detail}). If this is a public page, the host may block cross-origin requests (CORS) or Typora's web security settings may restrict it.`,
        isError: true,
      }
    }
    return { content: `web_fetch failed: ${detail}`, isError: true }
  } finally {
    clearTimeout(timer)
  }

  if (!response.ok) {
    const body = await safeReadBody(response)
    return {
      content: `web_fetch failed: HTTP ${response.status} for ${url}${body ? `\n\n${truncateContent(body, Math.min(maxChars, 2000)).content}` : ''}`,
      isError: true,
    }
  }

  const contentType = (response.headers.get('content-type') ?? '').toLowerCase()
  let raw: string
  try {
    if (!contentType || contentType.includes('text/') || contentType.includes('json') || contentType.includes('xml')) {
      raw = await response.text()
    } else {
      // Binary payloads (images, archives…) are useless as text.
      return { content: `web_fetch failed: ${url} returned a binary payload (${contentType}); only text-based responses can be fetched`, isError: true }
    }
  } catch (error) {
    return { content: `web_fetch failed reading response body: ${(error as Error)?.message || error}`, isError: true }
  }

  if (new Blob([raw]).size > MAX_BODY_BYTES) {
    return { content: `web_fetch failed: response from ${url} exceeds the 5 MB size limit`, isError: true }
  }

  let extracted: string
  const looksLikeHtml = contentType.includes('html') || /^\s*(<!doctype html|<html)/i.test(raw)
  if (looksLikeHtml) {
    const parsed = htmlToText(raw)
    extracted = [parsed.title ? `# ${parsed.title}` : '', parsed.text].filter(Boolean).join('\n\n')
  } else {
    // Plain text / JSON: return as-is.
    extracted = raw.trim()
  }

  if (!extracted) {
    return { content: `web_fetch returned an empty page for ${url}`, isError: true }
  }

  const { content } = truncateContent(extracted, maxChars)
  return { content }
}

async function safeReadBody(response: Response): Promise<string> {
  try {
    const text = await response.text()
    return text.length > 4000 ? `${text.slice(0, 4000)}…` : text
  } catch {
    return ''
  }
}
