import { writable } from 'svelte/store'
import { app, fs } from '@typora-community-plugin/core'
import type { PluginSettings } from './types'


export const DEFAULT_SETTINGS: PluginSettings = {
  provider: 'ollama',
  apiKey: '',
  model: 'qwen3.6-35b-a3b',
  maxIterations: 20,
  baseUrl: 'http://192.168.137.1:11431/v1',
  openaiApiMode: 'responses',
}

const SETTINGS_KEY = 'typora-plugin-chat.settings'
const API_KEY_KEY = 'typora-plugin-chat.apikey'
const API_KEY_FILE = 'typora-plugin-chat.apikey'
const SALT = 'typora-plugin-chat@v1'

/**
 * Lightweight obfuscation for the API key so it is never persisted as
 * plain text. Typora does not expose the OS keychain, so the obfuscated
 * key is written as a vault-config binary/text file (primary) with a
 * localStorage fallback.
 */
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

function apiKeyFilePath(): string {
  const dir = app.vault.configDir || app.vault.dataDir || app.vault.path
  return `${dir.replace(/[\\/]+$/, '')}/${API_KEY_FILE}`
}

async function readApiKeyFromFile(): Promise<string> {
  try {
    const encoded = await fs.readText(apiKeyFilePath())
    return deobfuscate(encoded.trim())
  } catch {
    return ''
  }
}

async function writeApiKeyToFile(apiKey: string): Promise<void> {
  try {
    await fs.writeText(apiKeyFilePath(), obfuscate(apiKey))
  } catch {
    /* fall back to localStorage below */
  }
}

async function readStoredApiKey(): Promise<string> {
  const fileKey = await readApiKeyFromFile()
  if (fileKey) return fileKey
  try {
    const encoded = localStorage.getItem(API_KEY_KEY)
    return encoded ? deobfuscate(encoded) : ''
  } catch {
    return ''
  }
}

function readStoredSettings(): PluginSettings {
  const settings = { ...DEFAULT_SETTINGS }
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (raw) Object.assign(settings, JSON.parse(raw))
  } catch {
    /* corrupted storage falls back to defaults */
  }
  return settings
}

const initialSettings = readStoredSettings()

export const settings = writable<PluginSettings>(initialSettings)

// Kick off async API key hydration as soon as the module loads.
void readStoredApiKey().then(apiKey => {
  if (apiKey) settings.update(current => ({ ...current, apiKey }))
})

export const settingsManager = {
  get(): PluginSettings {
    let current = initialSettings
    settings.subscribe(value => { current = value })()
    return current
  },

  async save(next: Partial<PluginSettings>): Promise<void> {
    const current = this.get()
    const merged = { ...current, ...next }
    settings.set(merged)
    try {
      const { apiKey, ...rest } = merged
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(rest))
      if (apiKey) {
        await writeApiKeyToFile(apiKey)
        localStorage.setItem(API_KEY_KEY, obfuscate(apiKey))
      } else {
        localStorage.removeItem(API_KEY_KEY)
      }
    } catch {
      /* storage full or unavailable */
    }
  },

  getApiKey(): string {
    return this.get().apiKey
  },

  setApiKey(apiKey: string) {
    void this.save({ ...this.get(), apiKey })
  },
}
