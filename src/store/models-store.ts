import { get, writable } from 'svelte/store'
import { settings, settingsManager } from '@/config/settings'
import type { ApiProvider } from '@/config/types'
import { isProviderEnabled } from '@/config/providers'
import { ANTHROPIC_BROWSER_HEADERS, normalizeAnthropicBaseUrl, normalizeOpenAIBaseUrl } from '@/api/base-url'
import { format, t } from '@/i18n'


export interface ModelRefreshResult {
  models: string[]
  message: string
  ok: boolean
}

/**
 * Shared model options source for the settings tab's add-model panel: the raw
 * `/models` endpoint list of the active provider, refreshed on demand. The chat
 * sidebar's model select does NOT read from here — it lists the configured
 * per-provider "Model parameters" grouped by provider (see `collectSelectableModelGroups`).
 */
export const availableModels = writable<string[]>([])

/** Human-readable status/error message for the last model refresh. */
export const modelRefreshMessage = writable('')

/**
 * Message shown while a provider is disabled. The store's subscription fires at
 * module load — possibly before `initI18n()` has run (e.g. on plugin startup),
 * where `t.models` is still undefined. Fall back to the raw key in that case.
 */
function disabledMessage(): string {
  const msg = t?.models?.disabled
  return typeof msg === 'string' && msg ? msg : 'Provider is disabled'
}

/** Localized `t.models[key]`, or `fallback` before i18n is initialized. */
function modelsText(key: 'loading' | 'loaded' | 'failed', fallback: string): string {
  const msg = (t?.models as Record<string, unknown> | undefined)?.[key]
  return typeof msg === 'string' && msg ? msg : fallback
}

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
 * Fetches `provider`'s `/models` endpoint and returns the filtered model ids.
 * Throws on network/HTTP errors and when the provider is disabled. Used by the
 * settings tab for the provider being edited, which is not necessarily the
 * active one.
 */
export async function fetchProviderModels(provider: ApiProvider): Promise<string[]> {
  const current = settingsManager.get()
  const config = current.providers[provider]
  if (!isProviderEnabled(config)) throw new Error(disabledMessage())

  // Use the same base URL rules as the chat adapters so "Refresh models" hits
  // the same API root as chat requests (e.g. Anthropic's /v1, Z.ai's /v4).
  const baseUrl = provider === 'anthropic'
    ? normalizeAnthropicBaseUrl(config?.baseUrl)
    : normalizeOpenAIBaseUrl(config?.baseUrl, provider === 'ollama' ? 'http://localhost:11434' : 'https://api.openai.com')
  const endpoint = `${baseUrl}/models`

  const headers: Record<string, string> = {}
  if (provider === 'anthropic') {
    headers['x-api-key'] = config.apiKey ?? ''
    headers['anthropic-version'] = '2023-06-01'
    Object.assign(headers, ANTHROPIC_BROWSER_HEADERS)
  } else if (config.apiKey) {
    headers['Authorization'] = `Bearer ${config.apiKey}`
  }

  const response = await fetch(endpoint, { headers })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const data: unknown = await response.json()
  const rawList: unknown[] = Array.isArray(data)
    ? data
    : ((data as { data?: unknown[] }).data ?? [])
  return filterModels(rawList, provider).slice(0, 100)
}

/**
 * Fetches a provider's `/models` endpoint (the active one by default) and
 * updates `availableModels`. There is no fallback list: if the request fails
 * the shared list is cleared and the error is surfaced through
 * `modelRefreshMessage`.
 */
export async function refreshModels(provider?: ApiProvider): Promise<ModelRefreshResult> {
  if (get(modelRefreshLoading)) {
    return {
      models: get(availableModels),
      message: get(modelRefreshMessage),
      ok: false,
    }
  }

  const current = settingsManager.get()
  const target = provider ?? current.provider

  // A disabled provider never exposes its models.
  if (!isProviderEnabled(current.providers[target])) {
    availableModels.set([])
    modelRefreshMessage.set(disabledMessage())
    return { models: [], message: disabledMessage(), ok: false }
  }

  modelRefreshLoading.set(true)
  modelRefreshMessage.set(modelsText('loading', 'Loading models...'))

  try {
    const filtered = await fetchProviderModels(target)
    availableModels.set(filtered)
    const message = format(modelsText('loaded', 'Loaded {count} models'), { count: filtered.length })
    modelRefreshMessage.set(message)
    return { models: filtered, message, ok: true }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    const status = format(modelsText('failed', 'Failed to fetch models: {message}'), { message })

    availableModels.set([])
    modelRefreshMessage.set(status)
    return { models: [], message: status, ok: false }
  } finally {
    modelRefreshLoading.set(false)
  }
}

// Keep the shared list aligned with the active provider. There is no fallback
// list, so a provider switch clears the options until the user refreshes. A
// disabled provider keeps its option list empty at all times (even when it
// remains the active one).
let lastProvider: ApiProvider | null = null
settings.subscribe(($settings) => {
  const providerChanged = lastProvider !== $settings.provider
  lastProvider = $settings.provider
  if (!providerChanged && isProviderEnabled($settings.providers[$settings.provider])) return
  availableModels.set([])
  modelRefreshMessage.set(isProviderEnabled($settings.providers[$settings.provider]) ? '' : disabledMessage())
  modelRefreshLoading.set(false)
})
