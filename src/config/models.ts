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

/** One provider's share of the chat model select. */
export interface SelectableModelGroup {
  /** Provider id the models belong to (selecting one may switch the active provider). */
  provider: string
  /** Model ids for this provider, sorted with `localeCompare`. */
  models: string[]
}

/**
 * Build the provider-grouped model list shown in the chat sidebar's model select.
 *
 * One group per enabled provider (the active provider first), each holding that
 * provider's own models from its "Model parameters" section plus its current
 * model — never de-duplicated across providers, since a shared id is only
 * ambiguous once grouped by provider. Disabled or unconfigured providers are
 * omitted entirely; groups with no models are dropped too.
 */
export function collectSelectableModelGroups(settings: PluginSettings): SelectableModelGroup[] {
  const enabledIds = collectProviderIds(settings.providers)
    .filter(id => isProviderEnabled(settings.providers[id]))
  // The active provider (when enabled) comes first so its group leads the list.
  const ordered = [settings.provider, ...enabledIds]
    .filter((id, index, arr) => arr.indexOf(id) === index)
  const groups: SelectableModelGroup[] = []
  for (const providerId of ordered) {
    if (!providerId || !settings.providers[providerId]) continue
    // `ordered` may lead with the active id even when it is disabled; skip it.
    if (!isProviderEnabled(settings.providers[providerId])) continue
    const config = settings.providers[providerId]
    const models = [...new Set(collectModelIds(config.model, config.models))].sort((a, b) => a.localeCompare(b))
    if (models.length) groups.push({ provider: providerId, models })
  }
  return groups
}
