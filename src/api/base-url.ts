/**
 * Base URL normalization for OpenAI-compatible providers.
 *
 * Users may paste a bare host (`https://api.deepseek.com`) or a full API root
 * (`https://api.z.ai/api/paas/v4`). Only a bare host gets `/v1` appended; a
 * URL that already carries a version segment (`/v1`, `/v4`, `/v1beta`, …) is
 * used as-is. Previously `/v1` was appended to anything not ending in `/v1`,
 * which broke Z.ai (`…/v4/v1`) and Google (`…/v1beta/v1`).
 */
export function normalizeOpenAIBaseUrl(baseUrl: string | undefined, fallback = 'https://api.openai.com'): string {
  let url = (baseUrl || fallback).trim().replace(/\/+$/, '')

  // Gemini's OpenAI-compatible API lives under /v1beta/openai.
  if (/^https?:\/\/generativelanguage\.googleapis\.com/i.test(url) && !/\/openai$/i.test(url)) {
    url = url.replace(/(\/v1beta|\/v1)?$/i, '/v1beta/openai')
    return url
  }

  let path = ''
  try { path = new URL(url).pathname } catch { path = url }
  if (/\/v\d+[a-z0-9]*(\/|$)/i.test(path)) return url
  return `${url}/v1`
}

/** Anthropic API root (`…/v1`). */
export function normalizeAnthropicBaseUrl(baseUrl: string | undefined): string {
  const trimmed = (baseUrl || 'https://api.anthropic.com').trim().replace(/\/+$/, '')
  return /\/v1$/i.test(trimmed) ? trimmed : `${trimmed}/v1`
}

/**
 * Typora runs plugins in a browser context, so requests are subject to CORS.
 * Anthropic only answers browser preflights when this header is present.
 */
export const ANTHROPIC_BROWSER_HEADERS = { 'anthropic-dangerous-direct-browser-access': 'true' } as const
