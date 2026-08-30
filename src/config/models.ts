import type { ModelConfig } from './types'

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
