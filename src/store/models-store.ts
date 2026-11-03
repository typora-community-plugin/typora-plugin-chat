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
 * `/models` endpoint list of the provider currently shown in the settings tab,
 * refreshed on demand. The chat sidebar's model select does NOT read from here
 * — it lists the configured per-provider "Model parameters" grouped by
 * provider (see `collectSelectableModelGroups`).
 */
export const availableModels = writable<string[]>([])

/**
 * Provider whose fetched models `availableModels` currently holds. Tracked so
 * switching providers in the settings tab never leaks one provider's list into
 * another provider's panel.
 */
export const modelsProvider = writable<ApiProvider | null>(null)

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

/**
 * Providers whose `/models` request is in flight. Kept per provider so a
 * refresh that is still running for a provider the user navigated away from
 * cannot block or overwrite the freshly focused provider's list.
 */
const inFlight = new Set<ApiProvider>()

/**
 * Point the shared model list at `provider`, clearing whatever another
 * provider left behind. Called by the settings tab whenever a provider panel is
 * rendered. No-op when the same provider is already focused.
 */
export function focusModels(provider: ApiProvider): void {
  if (get(modelsProvider) === provider) return
  modelsProvider.set(provider)
  availableModels.set([])
  const loading = inFlight.has(provider)
  modelRefreshLoading.set(loading)
  if (loading) {
    modelRefreshMessage.set(modelsText('loading', 'Loading models...'))
    return
  }
  modelRefreshMessage.set(isProviderEnabled(settingsManager.get().providers[provider]) ? '' : disabledMessage())
}

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
 * Fetches a provider's `/models` endpoint (the focused one by default) and
 * updates `availableModels`. There is no fallback list: if the request fails
 * the shared list is cleared and the error is surfaced through
 * `modelRefreshMessage`. Results for a provider that is no longer focused (the
 * user switched panels mid-request) are discarded instead of leaking into the
 * new provider's dropdown.
 */
export async function refreshModels(provider?: ApiProvider): Promise<ModelRefreshResult> {
  const current = settingsManager.get()
  const target = provider ?? get(modelsProvider) ?? current.provider

  // Tie the exposed list to the provider being refreshed.
  focusModels(target)

  if (inFlight.has(target)) {
    return {
      models: get(availableModels),
      message: get(modelRefreshMessage),
      ok: false,
    }
  }

  const isVisible = () => get(modelsProvider) === target
  const stillEnabled = () => isProviderEnabled(settingsManager.get().providers[target])

  // A disabled provider never exposes its models.
  if (!isProviderEnabled(current.providers[target])) {
    availableModels.set([])
    modelRefreshMessage.set(disabledMessage())
    return { models: [], message: disabledMessage(), ok: false }
  }

  inFlight.add(target)
  modelRefreshLoading.set(true)
  modelRefreshMessage.set(modelsText('loading', 'Loading models...'))

  try {
    const filtered = await fetchProviderModels(target)
    const message = format(modelsText('loaded', 'Loaded {count} models'), { count: filtered.length })
    if (isVisible() && stillEnabled()) {
      availableModels.set(filtered)
      modelRefreshMessage.set(message)
    }
    return { models: filtered, message, ok: true }
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e)
    const status = format(modelsText('failed', 'Failed to fetch models: {message}'), { message: error })
    if (isVisible() && stillEnabled()) {
      availableModels.set([])
      modelRefreshMessage.set(status)
    }
    return { models: [], message: status, ok: false }
  } finally {
    inFlight.delete(target)
    if (isVisible()) modelRefreshLoading.set(false)
  }
}

// Keep the shared list aligned with the focused provider. Changes to the active
// provider only matter while no settings panel is focused (e.g. tests or
// startup); once focused, only disabling that provider clears its list — a
// disabled provider keeps its options empty at all times.
let lastProvider: ApiProvider | null = null
settings.subscribe(($settings) => {
  const providerChanged = lastProvider !== $settings.provider
  lastProvider = $settings.provider

  const focused = get(modelsProvider)
  if (focused) {
    if (isProviderEnabled($settings.providers[focused])) return
    availableModels.set([])
    modelRefreshMessage.set(disabledMessage())
    modelRefreshLoading.set(false)
    return
  }

  if (!providerChanged && isProviderEnabled($settings.providers[$settings.provider])) return
  availableModels.set([])
  modelRefreshMessage.set(isProviderEnabled($settings.providers[$settings.provider]) ? '' : disabledMessage())
  modelRefreshLoading.set(false)
})
