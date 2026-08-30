import { SettingTab, SettingItem } from '@typora-community-plugin/core'
import type { App, Plugin } from '@typora-community-plugin/core'
import { get } from 'svelte/store'
import { DEFAULT_SETTINGS, settings, settingsManager } from '@/config/settings'
import { availableModels, modelRefreshMessage, refreshModels } from '@/store/models-store'
import { globalSkillsDir, vaultSkillsDir } from '@/agent/skills/paths'
import { rescanSkills } from '@/agent/skills/store'
import { collectModelIds } from '@/config/models'
import type { ApiProvider, ModelConfig, ProviderConfig } from '@/config/types'
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

/** Sentinel sidebar item that opens the "add a model" panel. */
const ADD = '+'


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

    // Provider title.
    const titleItem = new SettingItem()
    titleItem.addTitle(`${t.settings.providerConfig} · ${t.settings.providers[provider]}`)
    this.providerPanelEl?.append(titleItem.containerEl)

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

    // Context window (provider-level fallback for models without a per-model config).
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

    // Model parameters block: refresh status + nested per-model sidebar.
    const modelParamsItem = new SettingItem()
    modelParamsItem.addName(t.settings.modelParameters)
    modelParamsItem.addDescription(t.settings.modelParametersDesc)

    let statusEl: HTMLElement | null = null
    modelParamsItem.addDescription((el) => { statusEl = el })

    // The add-model panel's model-id dropdown lives inside the sidebar; keep a
    // shared reference so a refresh (which happens there) can repopulate it.
    const modelSelectRef: { el: HTMLSelectElement | null } = { el: null }

    const renderOptions = (models: string[]) => {
      if (!modelSelectRef.el) return
      const previous = modelSelectRef.el.value
      modelSelectRef.el.replaceChildren()
      const placeholder = new Option(t.settings.modelIdPlaceholder, '')
      placeholder.disabled = true
      placeholder.selected = true
      modelSelectRef.el.append(placeholder)
      for (const id of models) modelSelectRef.el.append(new Option(id, id))
      modelSelectRef.el.value = previous
    }

    this.providerUnsubs.push(availableModels.subscribe(renderOptions))
    this.providerUnsubs.push(modelRefreshMessage.subscribe((message) => {
      if (statusEl) statusEl.textContent = message
    }))

    const ids = collectModelIds(config.model, config.models)
    const initial = config.model && ids[0] === config.model ? config.model : (ids[0] ?? ADD)

    let layout: { setItems(items: string[]): void } | null = null
    layout = modelParamsItem.addSidebarLayout(
      { items: [...ids, ADD], initialActive: initial },
      ({ item, panelEl: modelPanelEl }) => {
        if (item === ADD) {
          this.renderAddModelPanel(provider, modelPanelEl, modelSelectRef, (id, models) => {
            if (!layout) return
            // Two-step setItems: the first list has no ADD so the active
            // sentinel falls out and core re-selects the new model; the second
            // restores ADD. Both render the same model panel (no visible flicker).
            layout.setItems([id, ...collectModelIds(config.model, models).filter(m => m !== id)])
            layout.setItems([...collectModelIds(config.model, models), ADD])
          })
        } else {
          modelSelectRef.el = null
          this.renderModelPanel(provider, item, modelPanelEl, (models) => {
            if (!layout) return
            layout.setItems([...collectModelIds(config.model, models), ADD])
          })
        }
      },
    )

    this.providerPanelEl?.append(modelParamsItem.containerEl)
  }

  private renderModelPanel(
    provider: ApiProvider,
    item: string,
    panelEl: HTMLElement,
    onListChanged: (models: Record<string, ModelConfig>) => void,
  ) {
    // Re-read fresh config on every render: select/setItems rebuild the panel.
    const config = settingsManager.get().providers[provider]
    const modelConfig = config.models?.[item]

    const nameItem = new SettingItem()
    nameItem.addName(item)
    if (item === config.model) nameItem.addBadge(t.settings.currentModel)
    panelEl.append(nameItem.containerEl)

    // Per-model context window; empty clears the entry.
    const ctxItem = new SettingItem()
    ctxItem.addName(t.settings.contextWindow)
    ctxItem.addDescription(t.settings.contextWindowDesc)
    ctxItem.addInput('number', (input) => {
      input.min = '0'
      input.placeholder = t.settings.contextWindowPlaceholder
      input.value = modelConfig?.contextWindow ? String(modelConfig.contextWindow) : ''
      input.onchange = () => {
        const value = input.value.trim()
        // Re-read the latest config: this panel may hold a render-time snapshot
        // and a prior save in the same panel must not be clobbered.
        const latest = settingsManager.get().providers[provider]
        const models = { ...(latest.models ?? {}) }
        if (!value) {
          delete models[item]
        } else {
          const contextWindow = Number(value)
          if (!(Number.isFinite(contextWindow) && contextWindow > 0)) return
          models[item] = { ...(models[item] ?? {}), contextWindow }
        }
        this.saveProvider(provider, { models })
      }
    })
    panelEl.append(ctxItem.containerEl)

    // Remove button — only when a stored per-model config exists. Removing the
    // active model's entry keeps it listed (unconfigured) because the sidebar
    // always includes the active model.
    if (modelConfig) {
      const removeItem = new SettingItem()
      removeItem.addButton((button) => {
        button.textContent = t.settings.removeModel
        button.onclick = () => {
          const latest = settingsManager.get().providers[provider]
          const models = { ...(latest.models ?? {}) }
          delete models[item]
          this.saveProvider(provider, { models })
          onListChanged(models)
        }
      })
      panelEl.append(removeItem.containerEl)
    }
  }

  private renderAddModelPanel(
    provider: ApiProvider,
    panelEl: HTMLElement,
    selectRef: { el: HTMLSelectElement | null },
    onAdded: (id: string, models: Record<string, ModelConfig>) => void,
  ) {
    let input: HTMLSelectElement | null = null

    const idItem = new SettingItem()
    idItem.addName(t.settings.modelId)
    idItem.addSelect((select) => {
      input = select
      selectRef.el = select
      const placeholder = new Option(t.settings.modelIdPlaceholder, '')
      placeholder.disabled = true
      placeholder.selected = true
      select.append(placeholder)
      for (const id of get(availableModels)) select.append(new Option(id, id))
    })
    idItem.addButton((button) => {
      button.textContent = t.settings.refreshModels
      button.onclick = () => {
        void refreshModels()
      }
    })
    panelEl.append(idItem.containerEl)

    let ctxInput: HTMLInputElement | null = null
    const ctxItem = new SettingItem()
    ctxItem.addName(t.settings.contextWindow)
    ctxItem.addDescription(t.settings.contextWindowDesc)
    ctxItem.addInput('number', (el) => {
      ctxInput = el
      el.min = '0'
      el.placeholder = t.settings.contextWindowPlaceholder
      el.value = ''
    })
    panelEl.append(ctxItem.containerEl)

    const addItem = new SettingItem()
    addItem.addButton((button) => {
      button.textContent = t.settings.addModel
      button.onclick = () => {
        const id = input?.value.trim() ?? ''
        if (!id) return
        const latest = settingsManager.get().providers[provider]
        if (id === latest.model) return
        const models = { ...(latest.models ?? {}) }
        if (models[id]) return
        const rawCtx = ctxInput?.value.trim() ?? ''
        const contextWindow = rawCtx ? Number(rawCtx) : 0
        models[id] = Number.isFinite(contextWindow) && contextWindow > 0 ? { contextWindow } : {}
        this.saveProvider(provider, { models })
        onAdded(id, models)
      }
    })
    panelEl.append(addItem.containerEl)
  }
}
