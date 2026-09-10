import { describe, expect, it } from 'vitest'
import { collectModelIds, collectSelectableModels, migrateContextWindows } from '../../src/config/models'
import { resolveContextWindow } from '../../src/agent/context-size'
import { mergeStoredSettings } from '../../src/config/settings'
import type { ProviderConfig } from '../../src/config/types'


describe('migrateContextWindows', () => {
  it('converts positive entries into structured ModelConfigs', () => {
    expect(migrateContextWindows({ 'gpt-4o': 128000, 'claude-sonnet-5': 200000 })).toEqual({
      'gpt-4o': { contextWindow: 128000 },
      'claude-sonnet-5': { contextWindow: 200000 },
    })
  })

  it('drops zero / negative / non-finite values', () => {
    expect(migrateContextWindows({ a: 0, b: -5, c: Number.NaN, d: 8192 })).toEqual({
      d: { contextWindow: 8192 },
    })
  })

  it('empty or missing map yields an empty object', () => {
    expect(migrateContextWindows({})).toEqual({})
    expect(migrateContextWindows(undefined)).toEqual({})
    expect(migrateContextWindows(null as unknown as Record<string, number>)).toEqual({})
  })
})

describe('collectModelIds', () => {
  it('puts the active model first without sorting it', () => {
    const ids = collectModelIds('b-model', { 'a-model': {}, 'z-model': {}, 'b-model': {} })
    expect(ids[0]).toBe('b-model')
    expect(ids.slice(1)).toEqual(['a-model', 'z-model'])
  })

  it('de-duplicates ids', () => {
    expect(collectModelIds('m', { m: {}, a: {}, a: {} })).toEqual(['m', 'a'])
  })

  it('sorts configured ids when no active model is given', () => {
    expect(collectModelIds('', { zebra: {}, alpha: {}, mid: {} })).toEqual(['alpha', 'mid', 'zebra'])
    expect(collectModelIds(undefined, { zebra: {}, alpha: {} })).toEqual(['alpha', 'zebra'])
  })

  it('returns an empty array when there is nothing configured', () => {
    expect(collectModelIds('', {})).toEqual([])
    expect(collectModelIds(undefined, undefined)).toEqual([])
    expect(collectModelIds('', undefined)).toEqual([])
  })
})

describe('collectSelectableModels', () => {
  function makeSettings(overrides: Partial<PluginSettings> = {}, providersOverride?: Record<string, unknown>) {
    const settings: PluginSettings = {
      provider: 'ollama',
      maxIterations: 20,
      providers: {
        anthropic: { enabled: true, model: 'claude-sonnet-5', baseUrl: '', models: {} },
        openai: { enabled: true, model: 'gpt-5.6-luna', baseUrl: '', models: {} },
        ollama: { enabled: true, model: 'qwen3.6-35b-a3b', baseUrl: '', models: {} },
      },
      ...overrides,
    }
    if (providersOverride) settings.providers = providersOverride as PluginSettings['providers']
    return settings
  }

  it('collects the active model of every enabled provider, sorted', () => {
    const ids = collectSelectableModels(makeSettings())
    expect(ids).toEqual(['claude-sonnet-5', 'gpt-5.6-luna', 'qwen3.6-35b-a3b'])
  })

  it('includes configured per-model entries from the model parameters section', () => {
    const ids = collectSelectableModels(makeSettings({}, {
      anthropic: { enabled: true, model: 'claude-sonnet-5', baseUrl: '', models: { 'claude-opus-4': {}, 'gpt-x': {} } },
      openai: { enabled: true, model: 'gpt-5.6-luna', baseUrl: '', models: {} },
      ollama: { enabled: true, model: 'qwen3.6-35b-a3b', baseUrl: '', models: {} },
    }))
    expect(ids).toEqual(['claude-opus-4', 'claude-sonnet-5', 'gpt-5.6-luna', 'gpt-x', 'qwen3.6-35b-a3b'])
  })

  it('de-duplicates ids shared by multiple providers', () => {
    const ids = collectSelectableModels(makeSettings({}, {
      anthropic: { enabled: true, model: 'shared-model', baseUrl: '', models: {} },
      openai: { enabled: true, model: 'shared-model', baseUrl: '', models: {} },
      ollama: { enabled: true, model: 'local-1', baseUrl: '', models: {} },
    }))
    expect(ids).toEqual(['local-1', 'shared-model'])
  })

  it('excludes models of disabled providers', () => {
    const ids = collectSelectableModels(makeSettings({}, {
      anthropic: { enabled: false, model: 'claude-sonnet-5', baseUrl: '', models: { 'claude-opus-4': {} } },
      openai: { enabled: true, model: 'gpt-5.6-luna', baseUrl: '', models: {} },
      ollama: { enabled: true, model: 'qwen3.6-35b-a3b', baseUrl: '', models: {} },
    }))
    expect(ids).toEqual(['gpt-5.6-luna', 'qwen3.6-35b-a3b'])
  })

  it('keeps the active provider model selectable even without a per-model entry', () => {
    const ids = collectSelectableModels(makeSettings({ provider: 'openai' }))
    expect(ids).toContain('gpt-5.6-luna')
  })

  it('drops an empty active-provider model instead of adding ""', () => {
    const ids = collectSelectableModels(makeSettings({}, {
      anthropic: { enabled: true, model: '', baseUrl: '', models: {} },
      openai: { enabled: true, model: 'gpt-5.6-luna', baseUrl: '', models: {} },
      ollama: { enabled: true, model: 'qwen3.6-35b-a3b', baseUrl: '', models: {} },
    }))
    expect(ids).toEqual(['gpt-5.6-luna', 'qwen3.6-35b-a3b'])
  })

  it('returns an empty list when every provider is disabled or unconfigured', () => {
    const ids = collectSelectableModels(makeSettings({}, {
      anthropic: { enabled: false, model: '', baseUrl: '', models: {} },
      openai: { enabled: false, model: '', baseUrl: '', models: {} },
      ollama: { enabled: false, model: '', baseUrl: '', models: {} },
    }))
    expect(ids).toEqual([])
  })

  it('includes configured custom providers', () => {
    const ids = collectSelectableModels(makeSettings({ provider: 'my-api' }, {
      anthropic: { enabled: true, model: 'claude-sonnet-5', baseUrl: '', models: {} },
      openai: { enabled: false, model: 'gpt-5.6-luna', baseUrl: '', models: {} },
      ollama: { enabled: true, model: 'qwen3.6-35b-a3b', baseUrl: '', models: {} },
      'my-api': { enabled: true, model: 'custom-model', baseUrl: '', models: { 'custom-extra': {} } },
    }))
    expect(ids).toEqual(['claude-sonnet-5', 'custom-extra', 'custom-model', 'qwen3.6-35b-a3b'])
  })
})

describe('resolveContextWindow per-model priority', () => {
  it('prefers models[model] over the provider-level contextWindow', () => {
    const config: ProviderConfig = {
      model: 'gpt-4o',
      baseUrl: '',
      contextWindow: 90000,
      models: { 'gpt-4o': { contextWindow: 123456 } },
    }
    expect(resolveContextWindow('gpt-4o', config)).toBe(123456)
  })

  it('falls back to the provider-level contextWindow', () => {
    const config: ProviderConfig = {
      model: 'unknown-local',
      baseUrl: '',
      contextWindow: 64000,
      models: {},
    }
    expect(resolveContextWindow('unknown-local', config)).toBe(64000)
  })

  it('falls back to model-name hints before the default', () => {
    const config: ProviderConfig = { model: 'claude-sonnet-5', baseUrl: '', models: {} }
    expect(resolveContextWindow('claude-sonnet-5', config)).toBe(1000000)
  })

  it('ignores a non-positive per-model override and falls through', () => {
    const config: ProviderConfig = {
      model: 'gpt-4o',
      baseUrl: '',
      contextWindow: 8000,
      models: { 'gpt-4o': { contextWindow: 0 } },
    }
    expect(resolveContextWindow('gpt-4o', config)).toBe(8000)
  })

  it('handles config being undefined', () => {
    expect(resolveContextWindow('gpt-4o', undefined)).toBe(128000)
  })
})

describe('mergeStoredSettings: legacy contextWindows → models', () => {
  it('migrates a per-provider contextWindows map into models', () => {
    const raw = {
      provider: 'openai' as const,
      providers: {
        openai: { contextWindows: { 'gpt-4o': 128000, 'gpt-4-turbo': 0 } },
      },
    }
    const merged = mergeStoredSettings(raw)
    expect(merged.providers.openai.models).toEqual({ 'gpt-4o': { contextWindow: 128000 } })
    // Legacy field stripped from the merged result.
    expect((merged.providers.openai as unknown as Record<string, unknown>).contextWindows).toBeUndefined()
  })

  it('backfills the legacy top-level flat contextWindows to the active provider', () => {
    const raw = {
      provider: 'anthropic' as const,
      contextWindows: { 'claude-sonnet-5': 200000 },
    }
    const merged = mergeStoredSettings(raw)
    expect(merged.providers.anthropic.models).toEqual({ 'claude-sonnet-5': { contextWindow: 200000 } })
  })

  it('lets a per-provider contextWindows win over the top-level flat map', () => {
    const raw = {
      provider: 'openai' as const,
      contextWindows: { 'gpt-4o': 111 },
      providers: {
        openai: { contextWindows: { 'gpt-4o': 222 } },
      },
    }
    const merged = mergeStoredSettings(raw)
    expect(merged.providers.openai.models).toEqual({ 'gpt-4o': { contextWindow: 222 } })
  })

  it('keeps an explicit models map untouched (no migration over it)', () => {
    const raw = {
      provider: 'openai' as const,
      providers: {
        openai: {
          models: { 'gpt-4o': { contextWindow: 333 } },
          contextWindows: { 'gpt-4o': 444 },
        },
      },
    }
    const merged = mergeStoredSettings(raw)
    expect(merged.providers.openai.models).toEqual({ 'gpt-4o': { contextWindow: 333 } })
  })
})
