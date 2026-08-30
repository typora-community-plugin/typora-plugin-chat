import { SettingTab, SettingItem } from '@typora-community-plugin/core'
import type { App, Plugin } from '@typora-community-plugin/core'
import { DEFAULT_SETTINGS, settings, settingsManager } from '@/config/settings'
import { availableModels, modelRefreshMessage, refreshModels } from '@/store/models-store'
import { globalSkillsDir, vaultSkillsDir } from '@/agent/skills/paths'
import { rescanSkills } from '@/agent/skills/store'
import type { ApiProvider, ProviderConfig } from '@/config/types'
import { t } from '@/i18n'


function getProviders(): Array<{ value: ApiProvider; label: string }> {
  return [
    { value: 'anthropic', label: t.settings.providers.anthropic },
    { value: 'openai', label: t.settings.providers.openai },
    { value: 'ollama', label: t.settings.providers.ollama },
    { value: 'custom', label: t.settings.providers.custom },
  ]
}

const BASE_URL_HINTS: Record<ApiProvider, string> = {
  anthropic: DEFAULT_SETTINGS.providers.anthropic.baseUrl,
  openai: DEFAULT_SETTINGS.providers.openai.baseUrl,
  ollama: DEFAULT_SETTINGS.providers.ollama.baseUrl,
  custom: '',
}

const MODEL_HINTS: Record<ApiProvider, string> = {
  anthropic: DEFAULT_SETTINGS.providers.anthropic.model,
  openai: DEFAULT_SETTINGS.providers.openai.model,
  ollama: DEFAULT_SETTINGS.providers.ollama.model,
  custom: '',
}


export class ChatSettingTab extends SettingTab {
  private sidebarLayout: { setItems(items: string[]): void } | null = null
  private lastSidebarItems: string[] | null = null
  private sidebarUnsub: (() => void) | null = null
  private providerPanelEl: HTMLElement | null = null
  private providerUnsubs: Array<() => void> = []

  constructor(
    private app: App,
    private plugin: Plugin,
  ) {
    super()
    this.render()
  }

  get name(): string {
    return t.settings.title
  }

  onunload() {
    this.sidebarUnsub?.()
    this.sidebarUnsub = null
    this.providerUnsubs.forEach(u => u())
    this.providerUnsubs = []
  }

  private render() {
    this.addSettingTitle(t.settings.title)

    // Provider sidebar + per-provider config panel.
    const active = settingsManager.get().provider
    const labels = getProviders().map(p => p.label)
    this.lastSidebarItems = [...labels]

    this.addSetting((setting) => {
      this.sidebarLayout = setting.addSidebarLayout(
        { items: [...labels], initialActive: labels.includes(active) ? active : labels[0] },
        ({ item, panelEl }) => {
          const provider = getProviders().find(p => p.label === item)?.value ?? active
          void settingsManager.save({ provider })
          this.renderProviderPanel(provider, panelEl)
        },
      )
    })

    // Keep the sidebar labels in sync with i18n changes.
    this.sidebarUnsub = settings.subscribe(() => {
      const nextLabels = getProviders().map(p => p.label)
      if (JSON.stringify(nextLabels) === JSON.stringify(this.lastSidebarItems)) return
      this.lastSidebarItems = [...nextLabels]
      this.sidebarLayout?.setItems([...nextLabels])
    })

    // Global fields below the provider block.
    this.addSettingTitle(t.settings.sectionGeneral)
    this.addSetting((setting) => {
      setting.addName(t.settings.forbiddenPaths)
      setting.addDescription(t.settings.forbiddenPathsDesc)
      setting.addTextArea((textarea) => {
        textarea.rows = 3
        textarea.placeholder = t.settings.forbiddenPathsPlaceholder
        textarea.value = settingsManager.get().forbiddenPaths ?? ''
        textarea.onchange = () => {
          void settingsManager.save({ forbiddenPaths: textarea.value })
        }
      })
    })

    this.addSetting((setting) => {
      setting.addName(t.settings.maxIterations)
      setting.addDescription(t.settings.maxIterationsDesc)
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

    this.addSetting((setting) => {
      setting.addName(t.settings.skills)
      setting.addDescription(t.settings.skillsDesc)

      const vaultDir = vaultSkillsDir()
      const globalDir = globalSkillsDir()
      const dirsText = [vaultDir, globalDir]
        .filter(Boolean)
        .map((dir) => dir as string)
        .join('\n')

      setting.addDescription((el) => {
        el.textContent = dirsText || '—'
        el.style.whiteSpace = 'pre-line'
        el.style.fontFamily = 'var(--code-font-family, monospace)'
        el.style.fontSize = '12px'
      })

      let statusEl: HTMLElement | null = null
      setting.addDescription((el) => { statusEl = el })

      setting.addButton((button) => {
        button.textContent = t.settings.rescanSkills
        button.onclick = () => {
          void rescanSkills().then(() => {
            if (statusEl) statusEl.textContent = ''
          }).catch(() => {
            if (statusEl) statusEl.textContent = '—'
          })
        }
      })
    })
  }

  private saveProvider(provider: ApiProvider, patch: Partial<ProviderConfig>) {
    const current = settingsManager.get()
    const config = { ...current.providers[provider], ...patch }
    void settingsManager.save({ providers: { ...current.providers, [provider]: config } })
  }

  private renderProviderPanel(provider: ApiProvider, panelEl: HTMLElement) {
    this.providerUnsubs.forEach(u => u())
    this.providerUnsubs = []
    this.providerPanelEl = panelEl
    panelEl.replaceChildren()
    this.buildProviderBlock(provider)
  }

  private buildProviderBlock(provider: ApiProvider) {
    const config = settingsManager.get().providers[provider]

    // Base URL.
    const baseUrlItem = new SettingItem()
    baseUrlItem.addName(t.settings.baseUrl)
    baseUrlItem.addDescription(t.settings.baseUrlDesc)
    baseUrlItem.addText((input) => {
      input.placeholder = BASE_URL_HINTS[provider] || t.settings.baseUrlPlaceholder
      input.value = config.baseUrl ?? ''
      input.onchange = () => {
        this.saveProvider(provider, { baseUrl: input.value.trim() })
      }
    })
    this.providerPanelEl?.append(baseUrlItem.containerEl)

    // API Key.
    const apiKeyItem = new SettingItem()
    apiKeyItem.addName(t.settings.apiKey)
    apiKeyItem.addDescription(t.settings.apiKeyDesc)
    apiKeyItem.addInput('password', (input) => {
      input.placeholder = t.settings.apiKeyPlaceholder
      input.value = config.apiKey ?? ''
      input.onchange = () => {
        this.saveProvider(provider, { apiKey: input.value.trim() || undefined })
      }
    })
    this.providerPanelEl?.append(apiKeyItem.containerEl)

    // Model (with datalist + refresh button).
    const modelItem = new SettingItem()
    modelItem.addName(t.settings.model)
    modelItem.addDescription(t.settings.modelDesc)

    const listId = 'typora-plugin-chat-model-list'
    let statusEl: HTMLElement | null = null
    modelItem.addDescription((el) => { statusEl = el })

    modelItem.addText((input) => {
      input.placeholder = MODEL_HINTS[provider] || t.settings.modelDesc
      input.value = config.model ?? ''
      input.setAttribute('list', listId)
      input.onchange = () => {
        this.saveProvider(provider, { model: input.value.trim() })
      }
    })

    const datalist = document.createElement('datalist')
    datalist.id = listId
    modelItem.controls.append(datalist)

    const renderOptions = (models: string[]) => {
      datalist.innerHTML = ''
      for (const id of models) {
        const option = document.createElement('option')
        option.value = id
        datalist.append(option)
      }
    }

    this.providerUnsubs.push(availableModels.subscribe(renderOptions))
    this.providerUnsubs.push(modelRefreshMessage.subscribe((message) => {
      if (statusEl) statusEl.textContent = message
    }))

    modelItem.addButton((button) => {
      button.textContent = t.settings.refreshModels
      button.onclick = () => {
        void refreshModels()
      }
    })
    this.providerPanelEl?.append(modelItem.containerEl)

    // OpenAI API Mode (only for `openai` provider).
    if (provider === 'openai') {
      const modeItem = new SettingItem()
      modeItem.addName(t.settings.openaiApiMode)
      modeItem.addDescription(t.settings.openaiApiModeDesc)
      modeItem.addSelect((select) => {
        select.append(new Option(t.settings.openaiApiModeResponses, 'responses'))
        select.append(new Option(t.settings.openaiApiModeChat, 'chat'))
        select.value = config.openaiApiMode ?? 'responses'
        select.onchange = () => {
          this.saveProvider(provider, { openaiApiMode: select.value as ProviderConfig['openaiApiMode'] })
        }
      })
      this.providerPanelEl?.append(modeItem.containerEl)
    }

    // Context window.
    const ctxItem = new SettingItem()
    ctxItem.addName(t.settings.contextWindow)
    ctxItem.addDescription(t.settings.contextWindowDesc)
    ctxItem.addInput('number', (input) => {
      input.min = '0'
      input.placeholder = t.settings.contextWindowPlaceholder
      input.value = config.contextWindow ? String(config.contextWindow) : ''
      input.onchange = () => {
        const value = input.value.trim()
        if (!value) {
          this.saveProvider(provider, { contextWindow: undefined })
          return
        }
        const contextWindow = Number(value)
        if (Number.isFinite(contextWindow) && contextWindow > 0) {
          this.saveProvider(provider, { contextWindow })
        }
      }
    })
    this.providerPanelEl?.append(ctxItem.containerEl)

    // Per-model context windows.
    const ctxMapItem = new SettingItem()
    ctxMapItem.addName(t.settings.contextWindows)
    ctxMapItem.addDescription(t.settings.contextWindowsDesc)
    ctxMapItem.addTextArea((textarea) => {
      textarea.rows = 5
      textarea.placeholder = t.settings.contextWindowsPlaceholder
      const overrides = config.contextWindows ?? {}
      textarea.value = Object.entries(overrides)
        .filter(([, value]) => value > 0)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([model, value]) => `${model}: ${value}`)
        .join('\n')
      textarea.onchange = () => {
        const next: Record<string, number> = {}
        for (const rawLine of textarea.value.split('\n')) {
          const line = rawLine.trim()
          if (!line) continue
          const sep = line.search(/[:=]/)
          if (sep <= 0) continue
          const model = line.slice(0, sep).trim()
          const value = Number(line.slice(sep + 1).trim())
          if (model && Number.isFinite(value) && value > 0) next[model] = value
        }
        this.saveProvider(provider, { contextWindows: next })
      }
    })
    this.providerPanelEl?.append(ctxMapItem.containerEl)
  }
}
