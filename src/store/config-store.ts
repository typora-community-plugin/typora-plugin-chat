import { derived } from 'svelte/store'
import { settings, settingsManager } from '@/config/settings'
import type { ApiProvider, ProviderConfig } from '@/config/types'


/**
 * Config state store — thin Svelte-friendly facade over SettingsManager.
 */
export const configStore = {
  settings,
  manager: settingsManager,
}

export const currentModel = derived(settings, ($settings) => $settings.providers[$settings.provider].model)
export const currentProvider = derived(settings, ($settings) => $settings.provider)

/** Update a field of the currently active provider's config. */
export function updateActiveConfig(patch: Partial<ProviderConfig>) {
  const current = settingsManager.get()
  const provider: ApiProvider = current.provider
  void settingsManager.save({
    providers: { ...current.providers, [provider]: { ...current.providers[provider], ...patch } },
  })
}
