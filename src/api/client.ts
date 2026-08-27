import type {
  ApiMessage,
  PluginSettings,
  ToolDefinition,
  UnifiedResponse,
} from '@/config/types'
import { backoffDelay, sleep } from '@/utils/helpers'
import { sendAnthropic } from './anthropic-adapter'
import { sendOpenAI } from './openai-adapter'
import { sendOllama } from './ollama-adapter'


const MAX_429_RETRIES = 2

function dispatch(
  settings: PluginSettings,
  messages: ApiMessage[],
  tools: ToolDefinition[],
  signal?: AbortSignal,
): Promise<UnifiedResponse> {
  switch (settings.provider) {
    case 'anthropic':
      return sendAnthropic(settings, messages, tools, signal)
    case 'openai':
      return sendOpenAI(settings, messages, tools, signal)
    case 'ollama':
    case 'custom':
    default:
      return sendOllama(settings, messages, tools, signal)
  }
}

function is429Error(error: unknown): error is Error & { status?: number; retryAfter?: string } {
  if (!(error instanceof Error)) return false
  const status = (error as Error & { status?: number }).status
  return status === 429
}

/**
 * Unified API entry point.
 *
 * - Routes by `settings.provider` to the matching adapter.
 * - Retries HTTP 429 with exponential backoff (Retry-After aware, max 30s).
 * - Uses `fetch` + `Request` API which are safe inside the Typora host.
 */
export async function sendMessage(
  settings: PluginSettings,
  messages: ApiMessage[],
  tools: ToolDefinition[] = [],
  signal?: AbortSignal,
): Promise<UnifiedResponse> {
  let lastError: unknown = null

  for (let attempt = 0; attempt <= MAX_429_RETRIES; attempt++) {
    if (signal?.aborted) throw new Error('Aborted')
    try {
      if (process.env.IS_DEV) {
        console.log('[chat] messages:', messages.map(m => ({ role: m.role, content: typeof m.content === 'string' ? m.content : Array.isArray(m.content) ? m.content.map(c => c.type === 'text' ? `{type:text, text:${String(c.text).slice(0, 200)}}` : `{type:${c.type}}`) : '' })))
      }
      return await dispatch(settings, messages, tools, signal)
    } catch (error) {
      lastError = error
      const status = (error as Error & { status?: number }).status
      if (status !== 429 || attempt >= MAX_429_RETRIES) throw error
      const retryAfter = (error as Error & { retryAfter?: string }).retryAfter
      await sleep(backoffDelay(attempt, retryAfter))
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError))
}

/** Create a Request object for Typora-safe fetch calls. */
export function createRequest(url: string, init: RequestInit = {}): Request {
  return new Request(url, init)
}
