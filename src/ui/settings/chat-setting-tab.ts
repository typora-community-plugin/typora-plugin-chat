import { SettingTab } from '@typora-community-plugin/core'
import type { App, Plugin } from '@typora-community-plugin/core'
import { settingsManager } from '../../config/settings'
import type { ApiProvider, PluginSettings } from '../../config/types'


const PROVIDERS: Array<{ value: ApiProvider; label: string }> = [
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'ollama', label: 'Ollama / OpenAI-compatible' },
  { value: 'custom', label: 'Custom' },
]

const FALLBACK_MODELS: Record<ApiProvider, string[]> = {
  anthropic: ['claude-sonnet-4-6', 'claude-opus-4-1', 'claude-haiku-4-5'],
  openai: ['gpt-5.3-codex', 'gpt-5.2', 'gpt-4.1-mini'],
  ollama: ['qwen3.6-35b-a3b', 'llama3.1', 'deepseek-r1'],
  custom: ['deepseek-chat', 'deepseek-reasoner'],
}


export class ChatSettingTab extends SettingTab {
  constructor(
    private app: App,
    private plugin: Plugin,
  ) {
    super()
    this.render()
  }

  get name(): string {
    return this.plugin.manifest.name
  }

  private render() {
    this.addSettingTitle('Chat')

    this.addSetting((setting) => {
      setting.addName('Provider')
      setting.addDescription('API provider used by the chat plugin.')
      setting.addSelect((select) => {
        for (const { value, label } of PROVIDERS) {
          select.append(new Option(label, value))
        }
        select.value = settingsManager.get().provider
        select.onchange = () => {
          void settingsManager.save({ provider: select.value as ApiProvider })
        }
      })
    })

    this.addSetting((setting) => {
      setting.addName('OpenAI API mode')
      setting.addDescription('Only used for OpenAI-compatible providers.')
      setting.addSelect((select) => {
        select.append(new Option('Responses API (primary)', 'responses'))
        select.append(new Option('Chat Completions (fallback)', 'chat'))
        select.value = settingsManager.get().openaiApiMode ?? 'responses'
        select.onchange = () => {
          void settingsManager.save({
            openaiApiMode: select.value as PluginSettings['openaiApiMode'],
          })
        }
      })
    })

    this.addSetting((setting) => {
      setting.addName('Base URL')
      setting.addDescription('OpenAI-compatible / Ollama endpoint.')
      setting.addText((input) => {
        input.placeholder = 'https://api.example.com/v1'
        input.value = settingsManager.get().baseUrl
        input.onchange = () => {
          void settingsManager.save({ baseUrl: input.value.trim() })
        }
      })
    })

    this.addSetting((setting) => {
      setting.addName('API Key')
      setting.addDescription('Stored obfuscated in the vault config file / localStorage.')
      setting.addInput('password', (input) => {
        input.placeholder = 'sk-...'
        input.value = settingsManager.get().apiKey
        input.onchange = () => {
          void settingsManager.save({ apiKey: input.value.trim() })
        }
      })
    })

    this.addSetting((setting) => {
      setting.addName('Model')
      setting.addDescription('Model id used for chat completions.')

      const listId = 'typora-plugin-chat-model-list'
      let statusEl: HTMLElement | null = null

      setting.addDescription((el) => {
        statusEl = el
      })

      setting.addText((input) => {
        input.value = settingsManager.get().model
        input.setAttribute('list', listId)
        input.onchange = () => {
          void settingsManager.save({ model: input.value.trim() })
        }
      })

      const datalist = document.createElement('datalist')
      datalist.id = listId
      setting.controls.append(datalist)

      setting.addButton((button) => {
        button.textContent = 'Refresh models'
        button.onclick = () => {
          void this.refreshModels(datalist, statusEl)
        }
      })
    })

    this.addSetting((setting) => {
      setting.addName('Max tool iterations')
      setting.addDescription('Maximum number of tool-call rounds in one agent loop.')
      setting.addInput('number', (input) => {
        input.min = '1'
        input.max = '100'
        input.value = String(settingsManager.get().maxIterations)
        input.onchange = () => {
          const maxIterations = Number(input.value)
          if (Number.isFinite(maxIterations) && maxIterations > 0) {
            void settingsManager.save({ maxIterations })
          }
        }
      })
    })
  }

  private async refreshModels(
    list: HTMLDataListElement,
    statusEl: HTMLElement | null,
  ) {
    const current = settingsManager.get()
    const provider = current.provider
    const baseUrl = (current.baseUrl || '').replace(/\/+$/, '')
    const endpoint = `${baseUrl}/models`

    if (statusEl) statusEl.textContent = 'Loading models...'

    const headers: Record<string, string> = {}
    if (provider === 'anthropic') {
      headers['x-api-key'] = current.apiKey
      headers['anthropic-version'] = '2023-06-01'
    } else if (current.apiKey) {
      headers['Authorization'] = `Bearer ${current.apiKey}`
    }

    try {
      const response = await fetch(endpoint, { headers })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const data: unknown = await response.json()
      const rawList: unknown[] = Array.isArray(data)
        ? data
        : ((data as { data?: unknown[] }).data ?? [])
      const filtered = rawList
        .map((m): string | null => {
          if (typeof m === 'string') return m
          if (m && typeof m === 'object') {
            const item = m as { id?: unknown; name?: unknown }
            const value = typeof item.id === 'string' ? item.id : typeof item.name === 'string' ? item.name : ''
            return value || null
          }
          return null
        })
        .filter((id): id is string => Boolean(id))
        .filter(id => {
          if (provider !== 'openai') return true
          return /(chat|gpt|o1|o3|codex)/i.test(id)
            && !/(realtime|audio|transcri|search|embedding|moderation)/i.test(id)
        })

      list.innerHTML = ''
      for (const id of filtered.slice(0, 100)) {
        const option = document.createElement('option')
        option.value = id
        list.append(option)
      }

      if (statusEl) statusEl.textContent = `Loaded ${Math.min(filtered.length, 100)} models`
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      if (statusEl) statusEl.textContent = `Failed to fetch models: ${message}`

      list.innerHTML = ''
      for (const id of FALLBACK_MODELS[provider] ?? []) {
        const option = document.createElement('option')
        option.value = id
        list.append(option)
      }
    }
  }
}
