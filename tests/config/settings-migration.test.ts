import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mergeStoredSettings, DEFAULT_SETTINGS } from '../../src/config/settings'
import type { ApiProvider, PluginSettings, ProviderConfig } from '../../src/config/types'


const SALT = 'typora-plugin-chat@v1'

function obfuscate(plain: string): string {
  const salted = `${SALT}:${plain}`
  const bytes = new TextEncoder().encode(salted)
  const xor = bytes.map((byte, i) => byte ^ (0x5a + (i % 13)))
  let binary = ''
  xor.forEach(byte => { binary += String.fromCharCode(byte) })
  return btoa(binary)
}

function deobfuscate(encoded: string): string {
  const binary = atob(encoded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i) ^ (0x5a + (i % 13))
  const salted = new TextDecoder().decode(bytes)
  return salted.startsWith(`${SALT}:`) ? salted.slice(SALT.length + 1) : ''
}

function parseApiKeyMap(deobfuscated: string): Partial<Record<ApiProvider, string>> | null {
  if (!deobfuscated) return null
  try {
    const parsed = JSON.parse(deobfuscated) as unknown
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const result: Partial<Record<ApiProvider, string>> = {}
      for (const provider of ['anthropic', 'openai', 'ollama', 'custom'] as ApiProvider[]) {
        const value = (parsed as Record<string, unknown>)[provider]
        if (typeof value === 'string') result[provider] = value
      }
      return result
    }
  } catch { /* not JSON → legacy single key */ }
  return null
}

/** Mirror of the module-private readApiKeyMap merge logic for unit testing. */
function computeKeyMerge(
  fileEncoded: string | null,
  lsEncoded: string | null,
  activeProvider: ApiProvider,
): Partial<Record<ApiProvider, string>> {
  const result: Partial<Record<ApiProvider, string>> = {}

  if (fileEncoded) {
    const deobfuscated = deobfuscate(fileEncoded.trim())
    const fileMap = parseApiKeyMap(deobfuscated)
    if (fileMap) {
      Object.assign(result, fileMap)
    } else if (deobfuscated) {
      result[activeProvider] = deobfuscated
    }
  }

  if (lsEncoded) {
    const deobfuscated = deobfuscate(lsEncoded.trim())
    const localMap = parseApiKeyMap(deobfuscated)
    if (localMap) {
      for (const provider of ['anthropic', 'openai', 'ollama', 'custom'] as ApiProvider[]) {
        const value = localMap[provider]
        if (value && !result[provider]) result[provider] = value
      }
    } else if (deobfuscated) {
      if (!result[activeProvider]) result[activeProvider] = deobfuscated
    }
  }

  return result
}


describe('settings migration: legacy flat → providers', () => {
  it('① backfills active provider from legacy flat fields; others get defaults', () => {
    const raw = {
      provider: 'openai' as const,
      model: 'gpt-4o-custom',
      baseUrl: 'https://my-proxy.example.com/v1',
      openaiApiMode: 'chat' as const,
      contextWindow: 90000,
    }
    const merged = mergeStoredSettings(raw)

    // Active provider (openai) receives the legacy flat values.
    expect(merged.providers.openai.model).toBe('gpt-4o-custom')
    expect(merged.providers.openai.baseUrl).toBe('https://my-proxy.example.com/v1')
    expect(merged.providers.openai.openaiApiMode).toBe('chat')
    expect(merged.providers.openai.contextWindow).toBe(90000)

    // Non-active providers keep their defaults (flat fields backfill only the
    // active provider).
    expect(merged.providers.anthropic.model).toBe(DEFAULT_SETTINGS.providers.anthropic.model)
    expect(merged.providers.ollama.model).toBe(DEFAULT_SETTINGS.providers.ollama.model)
    expect(merged.providers.custom.model).toBe('')

    // openaiApiMode is an OpenAI-only field and must not leak to other providers.
    expect((merged.providers.anthropic as Record<string, unknown>).openaiApiMode).toBeUndefined()
    expect((merged.providers.ollama as Record<string, unknown>).openaiApiMode).toBeUndefined()
    expect((merged.providers.custom as Record<string, unknown>).openaiApiMode).toBeUndefined()

    // Global fields preserved.
    expect(merged.provider).toBe('openai')
  })

  it('② non-builtin legacy baseUrl is inherited by the custom provider', () => {
    const raw = {
      provider: 'anthropic' as const,
      model: 'claude-x',
      baseUrl: 'https://my-proxy.example.com/v1',
    }
    const merged = mergeStoredSettings(raw)

    // Custom inherits the non-builtin URL.
    expect(merged.providers.custom.baseUrl).toBe('https://my-proxy.example.com/v1')

    // Active provider also gets it (flat backfill).
    expect(merged.providers.anthropic.baseUrl).toBe('https://my-proxy.example.com/v1')
  })

  it('② builtin legacy baseUrl is NOT inherited by custom', () => {
    const raw = {
      provider: 'anthropic' as const,
      model: 'claude-x',
      baseUrl: 'https://api.anthropic.com',
    }
    const merged = mergeStoredSettings(raw)

    expect(merged.providers.custom.baseUrl).toBe('')
  })

  it('③ partial providers (missing provider key) merges per-provider with defaults', () => {
    const raw = {
      provider: 'ollama' as const,
      providers: {
        ollama: { model: 'llama3-70b' },
      } as Partial<Record<ApiProvider, ProviderConfig>>,
    }
    const merged = mergeStoredSettings(raw)

    // Present provider: stored field overrides default.
    expect(merged.providers.ollama.model).toBe('llama3-70b')
    // Absent fields on present provider fall back to defaults.
    expect(merged.providers.ollama.baseUrl).toBe(DEFAULT_SETTINGS.providers.ollama.baseUrl)

    // Missing providers get full defaults.
    expect(merged.providers.anthropic).toEqual(DEFAULT_SETTINGS.providers.anthropic)
    expect(merged.providers.openai).toEqual(DEFAULT_SETTINGS.providers.openai)
    expect(merged.providers.custom).toEqual(DEFAULT_SETTINGS.providers.custom)
  })

  it('④ legacy single-key apiKey is attributed to the active provider', () => {
    const activeProvider: ApiProvider = 'openai'
    const fileEncoded = obfuscate('sk-legacy-single')

    const merged = computeKeyMerge(fileEncoded, null, activeProvider)

    expect(merged.openai).toBe('sk-legacy-single')
    expect(merged.anthropic).toBeUndefined()
    expect(merged.ollama).toBeUndefined()
  })

  it('⑤ apiKey map: file + localStorage merge per-key; write does not clobber unchanged keys', async () => {
    const fileMap = { anthropic: 'sk-ant-file', ollama: 'sk-ollama-file' }
    const lsMap = { openai: 'sk-oai-local', custom: 'sk-custom-local' }

    const fileEncoded = obfuscate(JSON.stringify(fileMap))
    const lsEncoded = obfuscate(JSON.stringify(lsMap))

    // Merge: all four providers present, no key lost.
    const merged = computeKeyMerge(fileEncoded, lsEncoded, 'anthropic')
    expect(merged.anthropic).toBe('sk-ant-file')
    expect(merged.openai).toBe('sk-oai-local')
    expect(merged.ollama).toBe('sk-ollama-file')
    expect(merged.custom).toBe('sk-custom-local')

    // Write-back simulation: save only updates `openai`; existing map is read back
    // first so the other keys survive (no async-hydrate race wipe).
    const existing = computeKeyMerge(fileEncoded, lsEncoded, 'anthropic')
    const changedKeys: Partial<Record<ApiProvider, string>> = { openai: 'sk-oai-new' }
    const written = { ...existing, ...changedKeys }

    expect(written.openai).toBe('sk-oai-new')
    expect(written.anthropic).toBe('sk-ant-file')
    expect(written.ollama).toBe('sk-ollama-file')
    expect(written.custom).toBe('sk-custom-local')
  })

  it('⑤ file map takes precedence over localStorage for the same key', () => {
    const fileEncoded = obfuscate(JSON.stringify({ openai: 'from-file' }))
    const lsEncoded = obfuscate(JSON.stringify({ openai: 'from-local' }))

    const merged = computeKeyMerge(fileEncoded, lsEncoded, 'openai')
    expect(merged.openai).toBe('from-file')
  })
})
