import type { ModelConfig, PluginSettings } from './types'
import { collectProviderIds, isProviderEnabled } from './providers'

/**
 * Pure model-list helpers (no DOM / settings side effects) so they are easy to
 * unit test in isolation.
 */

/** Migrate a legacy flat `model-id: contextWindow` map into the structured `ModelConfig` form. */
export function migrateContextWindows(map?: Record<string, number>): Record<string, ModelConfig> {
  if (!map || typeof map !== 'object') return {}
  const result: Record<string, ModelConfig> = {}
  for (const [model, value] of Object.entries(map)) {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0 && model) {
      result[model] = { contextWindow: value }
    }
  }
  return result
}

/**
 * Build the model-id list shown in the per-model parameters sidebar.
 *
 * The active model always comes first (it does not participate in sorting);
 * the remaining configured ids are de-duplicated and sorted with
 * `localeCompare`. When `model` is empty only the sorted configured ids are
 * returned.
 */
export function collectModelIds(model: string | undefined, models?: Record<string, ModelConfig>): string[] {
  const configured = Object.keys(models ?? {})
  const active = typeof model === 'string' && model.trim() ? model.trim() : ''
  if (!active) return [...new Set(configured)].sort((a, b) => a.localeCompare(b))
  const rest = [...new Set(configured.filter(id => id !== active))].sort((a, b) => a.localeCompare(b))
  return [active, ...rest]
}

/**
 * Build the model-id list shown in the chat sidebar's model select.
 *
 * Collects every model listed in the "Model parameters" section of all enabled
 * providers (the active provider first), de-duplicated and sorted with
 * `localeCompare`. The active provider's current model is always included —
 * even when it has no per-model entry yet — so it stays selectable. Disabled
 * providers contribute nothing.
 */
export function collectSelectableModels(settings: PluginSettings): string[] {
  const enabledIds = collectProviderIds(settings.providers)
    .filter(id => isProviderEnabled(settings.providers[id]))
  // The active provider (when enabled) comes first so its models lead the list.
  const ordered = [settings.provider, ...enabledIds]
    .filter((id, index, arr) => arr.indexOf(id) === index)
  const ids: string[] = []
  for (const providerId of ordered) {
    if (!providerId || !settings.providers[providerId]) continue
    const config = settings.providers[providerId]
    for (const id of collectModelIds(config.model, config.models)) {
      if (!ids.includes(id)) ids.push(id)
    }
  }
  return ids.sort((a, b) => a.localeCompare(b))
}
