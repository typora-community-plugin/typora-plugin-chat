import { describe, expect, it } from 'vitest'
import { collectProviderIds, isBuiltinProvider } from '../../src/config/providers'
import { mergeStoredSettings } from '../../src/config/settings'
import type { ApiProvider } from '../../src/config/types'


describe('isBuiltinProvider', () => {
  it('recognizes the three built-in ids', () => {
    expect(isBuiltinProvider('anthropic')).toBe(true)
    expect(isBuiltinProvider('openai')).toBe(true)
    expect(isBuiltinProvider('ollama')).toBe(true)
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
    expect(ids).toEqual(['anthropic', 'openai', 'ollama', 'alpha', 'zebra'])
  })

  it('handles an empty map and ignores non-string keys', () => {
    expect(collectProviderIds({})).toEqual(['anthropic', 'openai', 'ollama'])
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
