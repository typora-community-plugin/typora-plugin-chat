import { get, writable } from 'svelte/store'
import { settings, settingsManager } from '@/config/settings'
import type { ApiProvider } from '@/config/types'
import { format, t } from '@/i18n'


export interface ModelRefreshResult {
  models: string[]
  message: string
  ok: boolean
}

/**
 * Shared model options source.
 *
 * Both the settings tab datalist and the chat input bar dropdown read from
 * `availableModels`, so they always show exactly the same model list.
 */
export const availableModels = writable<string[]>([])

/** Human-readable status/error message for the last model refresh. */
export const modelRefreshMessage = writable('')

/** Whether a model list refresh is currently in progress. */
export const modelRefreshLoading = writable(false)

export function filterModels(rawList: unknown[], provider: ApiProvider): string[] {
  return rawList
    .map((m): string | null => {
      if (typeof m === 'string') return m
      if (m && typeof m === 'object') {
        const item = m as { id?: unknown; name?: unknown }
        const value = typeof item.id === 'string' ? item.id : typeof item.name === 'string' ? item.name : ''
        return value || null
      }
      return null
    })
    .filter((id): id is string => Boolean(id))
    .filter(id => {
      if (provider !== 'openai') return true
      return /(chat|gpt|o1|o3|codex)/i.test(id)
        && !/(realtime|audio|transcri|search|embedding|moderation)/i.test(id)
    })
}

/**
 * Fetches the current provider's `/models` endpoint and updates
 * `availableModels`. There is no fallback list: if the request fails the
 * shared list is cleared and the error is surfaced through
 * `modelRefreshMessage`.
 */
export async function refreshModels(): Promise<ModelRefreshResult> {
  if (get(modelRefreshLoading)) {
    return {
      models: get(availableModels),
      message: get(modelRefreshMessage),
      ok: false,
    }
  }

  const current = settingsManager.get()
  const provider = current.provider
  const baseUrl = (current.baseUrl || '').replace(/\/+$/, '')
  const endpoint = `${baseUrl}/models`

  modelRefreshLoading.set(true)
  modelRefreshMessage.set(t.models.loading)

  const headers: Record<string, string> = {}
  if (provider === 'anthropic') {
    headers['x-api-key'] = current.apiKey
    headers['anthropic-version'] = '2023-06-01'
  } else if (current.apiKey) {
    headers['Authorization'] = `Bearer ${current.apiKey}`
  }

  try {
    const response = await fetch(endpoint, { headers })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const data: unknown = await response.json()
    const rawList: unknown[] = Array.isArray(data)
      ? data
      : ((data as { data?: unknown[] }).data ?? [])
    const filtered = filterModels(rawList, provider).slice(0, 100)

    availableModels.set(filtered)
    const message = format(t.models.loaded, { count: filtered.length })
    modelRefreshMessage.set(message)
    return { models: filtered, message, ok: true }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    const status = format(t.models.failed, { message })

    availableModels.set([])
    modelRefreshMessage.set(status)
    return { models: [], message: status, ok: false }
  } finally {
    modelRefreshLoading.set(false)
  }
}

// Keep the shared list aligned with the active provider. There is no fallback
// list, so a provider switch clears the options until the user refreshes.
let lastProvider: ApiProvider | null = null
settings.subscribe(($settings) => {
  if (lastProvider !== $settings.provider) {
    lastProvider = $settings.provider
    availableModels.set([])
    modelRefreshMessage.set('')
    modelRefreshLoading.set(false)
  }
})
