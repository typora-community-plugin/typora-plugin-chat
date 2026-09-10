import type { BuiltinProvider, ProviderConfig } from './types'

/**
 * Pure provider-list helpers (no DOM / settings side effects) so they are easy
 * to unit test in isolation.
 */

/** Built-in providers always present in the settings map. */
export const BUILTIN_PROVIDERS: readonly BuiltinProvider[] = ['anthropic', 'openai', 'ollama']

/** True when `id` is one of the built-in providers. */
export function isBuiltinProvider(id: string): id is BuiltinProvider {
  return (BUILTIN_PROVIDERS as readonly string[]).includes(id)
}

/** A provider counts as enabled unless its config explicitly opts out. */
export function isProviderEnabled(config?: ProviderConfig | null): boolean {
  return config?.enabled !== false
}

/**
 * Provider ids to show in the sidebar: built-ins (stable order) followed by
 * configured custom provider ids (de-duplicated, sorted with `localeCompare`).
 */
export function collectProviderIds(providerMap: Record<string, unknown>): string[] {
  const customs = Object.keys(providerMap)
    .filter(id => !isBuiltinProvider(id))
    .sort((a, b) => a.localeCompare(b))
  return [...BUILTIN_PROVIDERS, ...customs]
}

/** Like `collectProviderIds` but only keeps providers whose config is enabled. */
export function collectEnabledProviderIds(providerMap: Record<string, unknown>): string[] {
  return collectProviderIds(providerMap).filter(id => isProviderEnabled(providerMap[id] as ProviderConfig | undefined))
}
