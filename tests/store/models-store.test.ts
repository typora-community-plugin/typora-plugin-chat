import { describe, expect, it } from 'vitest'
import { get } from 'svelte/store'
import { availableModels, modelRefreshMessage, refreshModels } from '../../src/store/models-store'
import { settingsManager } from '../../src/config/settings'
import { initI18n } from '../../src/i18n'

function getList(): string[] {
  return get(availableModels)
}

describe('models-store: disabled active provider', () => {
  it('does not crash when the module subscription fires before i18n is initialized', async () => {
    // Simulates plugin startup: a persisted disabled active provider means the
    // settings subscription (running at models-store import time) already took
    // the disabled branch with `t.models` undefined. Importing after that
    // state must not throw — see disabledMessage() fallback.
    await settingsManager.save({
      provider: 'openai',
      providers: { ...settingsManager.get().providers, openai: { ...settingsManager.get().providers.openai, enabled: false } },
    })

    expect(() => refreshModels).toBeDefined() // module graph fully evaluated without throwing
    const result = await refreshModels()
    expect(result.ok).toBe(false)
    expect(result.models).toEqual([])
    expect(typeof result.message).toBe('string')
    expect(getList()).toEqual([])
  })

  it('shows the localized disabled message once i18n is initialized', async () => {
    initI18n('/vault/.typora/plugins/typora-community-plugin.chat')
    await settingsManager.save({
      provider: 'openai',
      providers: { ...settingsManager.get().providers, openai: { ...settingsManager.get().providers.openai, enabled: false } },
    })

    const result = await refreshModels()
    expect(result.ok).toBe(false)
    expect(get(modelRefreshMessage)).toContain('disabled')
  })

  it('clears the shared list when a provider is disabled after being active', async () => {
    initI18n('/vault/.typora/plugins/typora-community-plugin.chat')
    const providers = settingsManager.get().providers
    await settingsManager.save({ provider: 'openai', providers })

    // Simulate fetched models for the now-active provider.
    availableModels.set(['gpt-4o', 'gpt-4o-mini'])

    await settingsManager.save({
      providers: { ...settingsManager.get().providers, openai: { ...settingsManager.get().providers.openai, enabled: false } },
    })

    expect(getList()).toEqual([])
  })
})
