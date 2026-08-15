import { derived } from 'svelte/store'
import { settings, settingsManager } from '../config/settings'
import type { PluginSettings } from '../config/types'


/**
 * Config state store — thin Svelte-friendly facade over SettingsManager.
 */
export const configStore = {
  settings,
  manager: settingsManager,
}

export const currentModel = derived(settings, ($settings) => $settings.model)
export const currentProvider = derived(settings, ($settings) => $settings.provider)

export function updateConfig(patch: Partial<PluginSettings>) {
  settingsManager.save(patch)
}
