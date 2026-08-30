import { writable } from 'svelte/store'
import { app, fs } from '@typora-community-plugin/core'
import type { ApiProvider, PluginSettings, ProviderConfig } from './types'
import { migrateContextWindows } from './models'
import { BUILTIN_PROVIDERS, isBuiltinProvider } from './providers'


export const DEFAULT_SETTINGS: PluginSettings = {
  provider: 'ollama',
  maxIterations: 20,
  mode: 'workspace-write',
  forbiddenPaths: '',
  providers: {
    anthropic: {
      model: 'claude-sonnet-4-20250514',
      baseUrl: 'https://api.anthropic.com',
      models: {},
    },
    openai: {
      model: 'gpt-4o-mini',
      baseUrl: 'https://api.openai.com/v1',
      openaiApiMode: 'responses',
      models: {},
    },
    ollama: {
      model: 'qwen3.6-35b-a3b',
      baseUrl: 'http://localhost:11431/v1',
      contextWindow: 128000,
      models: {},
    },
  },
}

const SETTINGS_KEY = 'typora-plugin-chat.settings'
const API_KEY_KEY = 'typora-plugin-chat.apikey'
const API_KEY_FILE = 'typora-plugin-chat.apikey'
const SALT = 'typora-plugin-chat@v1'

/** Defaults for a newly added custom provider (before its own fields are set). */
const CUSTOM_DEFAULT: ProviderConfig = { model: '', baseUrl: '', models: {} }

/** All provider ids that must be merged: built-ins + stored custom ids + the active provider. */
function allProviderIds(raw?: Partial<PluginSettings>): string[] {
  const stored = Object.keys((raw?.providers ?? {}) as Record<string, unknown>)
  const active = raw?.provider
  const extra = typeof active === 'string' && active ? [active] : []
  return [...new Set([...BUILTIN_PROVIDERS, ...stored, ...extra])]
}

/** Merge one provider's stored config over the defaults so every field is present. */
function mergeProviderConfig(
  defaultConfig: ProviderConfig,
  raw?: Partial<ProviderConfig> | null,
): ProviderConfig {
  if (!raw || typeof raw !== 'object') return { ...defaultConfig }
  const merged: ProviderConfig = { ...defaultConfig }
  // Iterate the union of keys so a field absent from defaults but present in `raw`
  // (e.g. `contextWindow` on openai) is still honored.
  const keys = Array.from(new Set([
    ...Object.keys(defaultConfig),
    ...Object.keys(raw as Record<string, unknown>),
  ])) as Array<keyof ProviderConfig>
  for (const key of keys) {
    const value = raw[key]
    if (value !== undefined && value !== null) {
      ;(merged as unknown as Record<string, unknown>)[key as string] = value
    } else if (key === 'apiKey') {
      delete merged.apiKey
    }
  }
  return merged
}

/** Merge stored settings over the defaults: global fields + per-provider configs. */
export function mergeStoredSettings(raw: Partial<PluginSettings>): PluginSettings {
  const result: PluginSettings = {
    provider: DEFAULT_SETTINGS.provider,
    maxIterations: DEFAULT_SETTINGS.maxIterations,
    mode: DEFAULT_SETTINGS.mode,
    forbiddenPaths: '',
    providers: { ...DEFAULT_SETTINGS.providers },
  }
  if (!raw || typeof raw !== 'object') return result

  for (const key of ['provider', 'maxIterations', 'mode', 'forbiddenPaths'] as const) {
    const value = raw[key]
    if (value !== undefined && value !== null) {
      ;(result as unknown as Record<string, unknown>)[key] = value
    }
  }

  // Legacy flat fields: backfill the config of the active provider.
  const legacy = raw as Partial<PluginSettings> & {
    apiKey?: string
    model?: string
    baseUrl?: string
    openaiApiMode?: 'responses' | 'chat'
    contextWindow?: number
    contextWindows?: Record<string, number>
  }

  for (const provider of allProviderIds(raw)) {
    let stored: (Partial<ProviderConfig> & { contextWindows?: Record<string, number> }) | undefined
    if (raw.providers && typeof raw.providers === 'object') {
      stored = (raw.providers as Record<string, typeof stored>)[provider] ?? undefined
    }

    // Legacy flat fields backfill only the active provider's config; other
    // providers keep their defaults.  When a per-provider entry is present it
    // takes precedence over the flat values field-by-field.
    if (provider === legacy.provider) {
      const backfill: Partial<ProviderConfig> & { contextWindows?: Record<string, number> } = {}
      if (legacy.model !== undefined) backfill.model = legacy.model
      if (legacy.baseUrl !== undefined) backfill.baseUrl = legacy.baseUrl
      if (legacy.openaiApiMode !== undefined) backfill.openaiApiMode = legacy.openaiApiMode
      if (legacy.contextWindow !== undefined && legacy.contextWindow !== null) {
        backfill.contextWindow = legacy.contextWindow
      }
      if (legacy.contextWindows !== undefined) backfill.contextWindows = legacy.contextWindows
      stored = stored ? { ...backfill, ...stored } : backfill
    }

    // Double-path migration of the legacy `contextWindows` map into the
    // structured `models` form (only when no `models` is present yet), then
    // strip the legacy field so the key-union merge cannot carry it into the
    // new shape. A fresh object is spread to avoid mutating the caller's raw.
    if (stored) {
      const { contextWindows, ...rest } = stored
      stored = contextWindows !== undefined && !rest.models
        ? { ...rest, models: migrateContextWindows(contextWindows) }
        : { ...rest }
    }

    const base = DEFAULT_SETTINGS.providers[provider] ?? CUSTOM_DEFAULT
    result.providers[provider] = mergeProviderConfig(base, stored)
  }

  return result
}

function readStoredSettings(): PluginSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (raw) return mergeStoredSettings(JSON.parse(raw))
  } catch {
    /* corrupted storage falls back to defaults */
  }
  return structuredClone(DEFAULT_SETTINGS)
}

/** Lightweight obfuscation for API keys so they are never persisted as plain text. */
function obfuscate(plain: string): string {
  try {
    const salted = `${SALT}:${plain}`
    const bytes = new TextEncoder().encode(salted)
    const xor = bytes.map((byte, i) => byte ^ (0x5a + (i % 13)))
    let binary = ''
    xor.forEach(byte => { binary += String.fromCharCode(byte) })
    return btoa(binary)
  } catch {
    return ''
  }
}

function deobfuscate(encoded: string): string {
  try {
    const binary = atob(encoded)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i) ^ (0x5a + (i % 13))
    const salted = new TextDecoder().decode(bytes)
    return salted.startsWith(`${SALT}:`) ? salted.slice(SALT.length + 1) : ''
  } catch {
    return ''
  }
}

function parseApiKeyMap(deobfuscated: string): Partial<Record<ApiProvider, string>> | null {
  if (!deobfuscated) return null
  try {
    const parsed = JSON.parse(deobfuscated) as unknown
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const result: Partial<Record<ApiProvider, string>> = {}
      for (const [provider, value] of Object.entries(parsed as Record<string, unknown>)) {
        if (typeof value === 'string') result[provider] = value
      }
      return result
    }
  } catch {
    /* not JSON → legacy single key */
  }
  return null
}

function apiKeyFilePath(): string {
  const dir = app.vault.dataDir
  return `${dir.replace(/[\\/]+$/, '')}/${API_KEY_FILE}`
}

/** Read the per-provider API-key map, merging file + localStorage sources. */
async function readApiKeyMap(): Promise<Partial<Record<ApiProvider, string>>> {
  const result: Partial<Record<ApiProvider, string>> = {}

  try {
    const encoded = await fs.readText(apiKeyFilePath())
    const deobfuscated = deobfuscate(encoded.trim())
    const fileMap = parseApiKeyMap(deobfuscated)
    if (fileMap) {
      Object.assign(result, fileMap)
    } else if (deobfuscated) {
      // Legacy format: single key → attach to the active provider.
      result[settingsManager.get().provider] = deobfuscated
    }
  } catch {
    /* no file */
  }

  try {
    const encoded = localStorage.getItem(API_KEY_KEY)
    if (encoded) {
      const localMap = parseApiKeyMap(deobfuscate(encoded))
      if (localMap) {
        for (const [provider, value] of Object.entries(localMap)) {
          if (value && !result[provider]) result[provider] = value
        }
      } else if (deobfuscate(encoded)) {
        // Legacy single key in localStorage → attach to the active provider.
        if (!result[settingsManager.get().provider]) {
          result[settingsManager.get().provider] = deobfuscate(encoded)
        }
      }
    }
  } catch {
    /* no localStorage entry */
  }

  return result
}

/** Persist the per-provider API-key map (only non-empty entries). */
function writeApiKeyMap(map: Partial<Record<ApiProvider, string>>): void {
  const clean = Object.fromEntries(
    Object.entries(map).filter(([, value]) => value),
  ) as Record<string, unknown>
  if (!Object.keys(clean).length) return
  const encoded = obfuscate(JSON.stringify(clean))

  fs.access(apiKeyFilePath())
    .catch(() => fs.mkdir(app.vault.dataDir))
    .then(() => fs.writeText(apiKeyFilePath(), encoded))
    .catch(() => {/* fall back to localStorage below */ })

  try {
    if (encoded) localStorage.setItem(API_KEY_KEY, encoded)
  } catch {
    /* storage unavailable */
  }
}

const initialSettings = readStoredSettings()

export const settings = writable<PluginSettings>(initialSettings)

// Kick off async API-key hydration as soon as the module loads.
void readApiKeyMap().then(map => {
  if (!Object.keys(map).length) return
  settings.update(current => ({
    ...current,
    providers: Object.fromEntries(
      Object.keys(current.providers).map(p => [p, map[p] ? { ...current.providers[p], apiKey: map[p] } : current.providers[p]]),
    ) as Record<ApiProvider, ProviderConfig>,
  }))
})

export const settingsManager = {
  get(): PluginSettings {
    let current = initialSettings
    settings.subscribe(value => { current = value })()
    return current
  },

  async save(next: Partial<PluginSettings>): Promise<void> {
    const current = this.get()
    // A `providers` patch is authoritative: it replaces the whole map, so a
    // removed custom provider actually disappears (all callers pass the full
    // map built from `current.providers`).
    const merged: PluginSettings = { ...current, ...next }
    if (next.providers) merged.providers = { ...next.providers }
    settings.set(merged)
    try {
      const persisted: Partial<PluginSettings> = {
        provider: merged.provider,
        maxIterations: merged.maxIterations,
        mode: merged.mode,
        forbiddenPaths: merged.forbiddenPaths,
        providers: Object.fromEntries(
          Object.entries(merged.providers).map(([p, cfg]) => [p, { ...cfg }]),
        ) as Record<ApiProvider, ProviderConfig>,
      }
      // Strip empty apiKeys before persisting (they live in the key vault).
      for (const cfg of Object.values(persisted.providers!)) {
        if (!cfg.apiKey) delete cfg.apiKey
      }
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(persisted))

      // Write-back: merge with the on-disk map and only persist changed keys so a
      // save before async hydration finishes cannot wipe other providers' keys.
      const persistedMap: Partial<Record<ApiProvider, string>> = {}
      for (const [p, cfg] of Object.entries(merged.providers)) {
        if (cfg.apiKey) persistedMap[p] = cfg.apiKey
      }
      const existing = await readApiKeyMap()
      writeApiKeyMap({ ...existing, ...persistedMap })
    } catch {
      /* storage full or unavailable */
    }
  },
}
