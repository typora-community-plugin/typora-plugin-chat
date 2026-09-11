import { describe, expect, it } from 'vitest'
import { BUILTIN_PROVIDERS, collectEnabledProviderIds, collectProviderIds, isBuiltinProvider, isProviderEnabled } from '../../src/config/providers'
import { mergeStoredSettings } from '../../src/config/settings'
import type { ApiProvider } from '../../src/config/types'


describe('isBuiltinProvider', () => {
  it('recognizes every built-in id', () => {
    for (const id of BUILTIN_PROVIDERS) expect(isBuiltinProvider(id)).toBe(true)
  })

  it('treats arbitrary ids (including legacy `custom`) as custom', () => {
    expect(isBuiltinProvider('custom')).toBe(false)
    expect(isBuiltinProvider('my-llm')).toBe(false)
    expect(isBuiltinProvider('')).toBe(false)
  })
})

describe('collectProviderIds', () => {
  it('lists built-ins in stable order followed by sorted customs', () => {
    const ids = collectProviderIds({ zebra: {}, anthropic: {}, alpha: {}, openai: {}, ollama: {} })
    expect(ids).toEqual([...BUILTIN_PROVIDERS, 'alpha', 'zebra'])
  })

  it('handles an empty map and ignores non-string keys', () => {
    expect(collectProviderIds({})).toEqual([...BUILTIN_PROVIDERS])
  })
})

describe('isProviderEnabled', () => {
  it('defaults to enabled when the flag is absent or undefined', () => {
    expect(isProviderEnabled(undefined)).toBe(true)
    expect(isProviderEnabled(null)).toBe(true)
    expect(isProviderEnabled({ model: 'm', baseUrl: '', models: {} })).toBe(true)
    expect(isProviderEnabled({ model: 'm', baseUrl: '', models: {}, enabled: undefined })).toBe(true)
  })

  it('honors explicit true/false values', () => {
    expect(isProviderEnabled({ model: 'm', baseUrl: '', models: {}, enabled: true })).toBe(true)
    expect(isProviderEnabled({ model: 'm', baseUrl: '', models: {}, enabled: false })).toBe(false)
  })
})

describe('collectEnabledProviderIds', () => {
  it('keeps the builtin-then-customs order while dropping disabled entries', () => {
    const ids = collectEnabledProviderIds({
      anthropic: { model: 'a', baseUrl: '', models: {} },
      openai: { model: 'o', baseUrl: '', models: {}, enabled: false },
      ollama: { model: 'l', baseUrl: '', models: {} },
      zebra: { model: 'z', baseUrl: '', models: {} },
      alpha: { model: 'a2', baseUrl: '', models: {}, enabled: false },
    } as Record<string, unknown>)
    expect(ids).toEqual([...BUILTIN_PROVIDERS.filter(id => id !== 'openai'), 'zebra'])
  })

  it('treats a missing config (e.g. legacy map) as enabled and still lists built-ins', () => {
    const ids = collectEnabledProviderIds({})
    expect(ids).toEqual([...BUILTIN_PROVIDERS])
  })
})

describe('mergeStoredSettings: dynamic custom providers', () => {
  it('preserves a stored custom provider and merges its fields over blanks', () => {
    const raw = {
      provider: 'my-llm' as ApiProvider,
      providers: {
        'my-llm': { baseUrl: 'https://my-proxy.example.com/v1', model: 'gpt-4o' },
      },
    }
    const merged = mergeStoredSettings(raw)
    expect(merged.providers['my-llm'].baseUrl).toBe('https://my-proxy.example.com/v1')
    expect(merged.providers['my-llm'].model).toBe('gpt-4o')
    expect(merged.providers['my-llm'].models).toEqual({})
    expect(merged.provider).toBe('my-llm')
  })

  it('preserves an explicit enabled flag on the stored provider', () => {
    const raw = {
      provider: 'ollama' as ApiProvider,
      providers: {
        'my-llm': { baseUrl: 'https://x.example.com/v1', model: 'gpt-4o', enabled: false },
      },
    }
    const merged = mergeStoredSettings(raw)
    expect(merged.providers['my-llm'].enabled).toBe(false)
    // Built-ins that ship disabled by default keep their disabled flag.
    expect(merged.providers.deepseek.enabled).toBe(false)
  })

  it('migrates a custom provider legacy contextWindows into models', () => {
    const raw = {
      provider: 'ollama' as const,
      providers: {
        'my-llm': { contextWindows: { 'gpt-4o': 128000 } },
      },
    }
    const merged = mergeStoredSettings(raw)
    expect(merged.providers['my-llm'].models).toEqual({ 'gpt-4o': { contextWindow: 128000 } })
  })

  it('backfills legacy flat fields onto a stored custom provider', () => {
    const raw = {
      provider: 'custom' as const,
      model: 'local-model',
      baseUrl: 'https://my-proxy.example.com/v1',
      providers: { custom: { apiKey: 'sk-x' } },
    }
    const merged = mergeStoredSettings(raw)
    expect(merged.providers.custom.model).toBe('local-model')
    expect(merged.providers.custom.baseUrl).toBe('https://my-proxy.example.com/v1')
    // Per-provider stored fields take precedence over flat ones.
    expect(merged.providers.custom.apiKey).toBe('sk-x')
  })
})
