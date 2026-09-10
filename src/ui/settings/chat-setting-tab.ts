import './provider-sidebar.scss'
import { SettingTab, SettingItem } from '@typora-community-plugin/core'
import type { App, Plugin } from '@typora-community-plugin/core'
import { get } from 'svelte/store'
import { DEFAULT_SETTINGS, settings, settingsManager } from '@/config/settings'
import { availableModels, modelRefreshMessage, refreshModels } from '@/store/models-store'
import { globalSkillsDir, vaultSkillsDir } from '@/agent/skills/paths'
import { rescanSkills } from '@/agent/skills/store'
import { collectModelIds } from '@/config/models'
import { collectEnabledProviderIds, collectProviderIds, isBuiltinProvider, isProviderEnabled } from '@/config/providers'
import type { ApiProvider, BuiltinProvider, ModelConfig, PluginSettings, ProviderConfig } from '@/config/types'
import { t } from '@/i18n'


/** Sentinel sidebar item that opens the "add a provider / model" panel. */
const ADD = '+'

/** Display label for a provider id: localized for built-ins, raw id for customs. */
function providerLabel(value: string): string {
  if (isBuiltinProvider(value)) return t.settings.providers[value as BuiltinProvider]
  return value
}

/** All configured provider ids (+ their labels) to list in the provider sidebar. */
function getProviders(): Array<{ value: string; label: string }> {
  const current = settingsManager.get()
  return collectProviderIds(current.providers).map(id => ({ value: id, label: providerLabel(id) }))
}

/** Full provider sidebar item list (all labels + the ADD sentinel). */
function getSidebarItems(): string[] {
  return [...getProviders().map(p => p.label), ADD]
}

/** First enabled provider in stable order; `undefined` when none are enabled. */
function pickFallbackProvider(settings: PluginSettings): ApiProvider | undefined {
  const ids = collectEnabledProviderIds(settings.providers)
  return settings.provider && isProviderEnabled(settings.providers[settings.provider])
    ? settings.provider
    : (ids[0] as ApiProvider | undefined)
}

/** Placeholder base URL hint for a provider (empty for custom providers). */
function baseUrlHint(provider: string): string {
  if (isBuiltinProvider(provider)) return DEFAULT_SETTINGS.providers[provider].baseUrl
  return ''
}


export class ChatSettingTab extends SettingTab {
  private sidebarLayout: { setItems(items: string[]): void } | null = null
  private lastSidebarItems: string[] | null = null
  private sidebarUnsub: (() => void) | null = null
  private applySidebarDots: (() => void) | null = null
  private sidebarObserver: MutationObserver | null = null
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
    this.applySidebarDots = null
    this.sidebarObserver?.disconnect()
    this.sidebarObserver = null
    this.providerUnsubs.forEach(u => u())
    this.providerUnsubs = []
  }

  private render() {
    this.addSettingTitle(t.settings.sectionProviders)

    // Provider sidebar + per-provider config panel.
    const active = settingsManager.get().provider
    const items = getSidebarItems()
    const activeLabel = getProviders().find(p => p.value === active)?.label
    const initial = activeLabel ?? (items[0] ?? ADD)
    this.lastSidebarItems = [...items]

    this.addSetting((setting) => {
      const layout = setting.addSidebarLayout(
        { items: [...items], initialActive: initial },
        ({ item, panelEl }) => {
          if (item === ADD) {
            this.renderProviderPanel(ADD, panelEl)
            return
          }
          const provider = getProviders().find(p => p.label === item)?.value
          if (!provider) {
            this.renderProviderPanel(ADD, panelEl)
            return
          }
          // Disabled providers are browsable but never become the active one.
          if (isProviderEnabled(settingsManager.get().providers[provider])) {
            void settingsManager.save({ provider })
          }
          this.renderProviderPanel(provider, panelEl)
        },
      )
      this.sidebarLayout = layout

      // Decorate sidebar items with an enabled/disabled state. Core rebuilds
      // the item list on every render (replaceChildren), so a MutationObserver
      // keeps the green dots in sync instead of re-applying them manually.
      const settingEl = setting.containerEl as HTMLElement
      const aside = settingEl.querySelector<HTMLElement>('.typ-setting-sidebar')
      if (!aside) return
      aside.classList.add('typ-provider-sidebar')

      this.applySidebarDots = () => {
        const providers = settingsManager.get().providers
        for (const el of aside.querySelectorAll<HTMLElement>('.typ-nav__item')) {
          const isAdd = el.textContent === ADD
          if (!isAdd) {
            const provider = getProviders().find(p => p.label === el.textContent)?.value
            const enabled = !!provider && isProviderEnabled(providers[provider])
            el.classList.toggle('is-enabled', enabled)
            el.classList.toggle('is-disabled', !enabled)
          } else {
            el.classList.remove('is-enabled', 'is-disabled')
          }
        }
      }
      this.applySidebarDots()

      this.sidebarObserver = new MutationObserver(() => this.applySidebarDots?.())
      this.sidebarObserver.observe(aside, { childList: true })
    })

    // Keep the sidebar items in sync with settings changes (i18n relabel or a
    // custom provider being added/removed). The dots are refreshed by the
    // MutationObserver whenever core re-renders the list.
    this.sidebarUnsub = settings.subscribe(() => {
      const nextItems = getSidebarItems()
      if (JSON.stringify(nextItems) !== JSON.stringify(this.lastSidebarItems)) {
        this.lastSidebarItems = [...nextItems]
        this.sidebarLayout?.setItems([...nextItems])
      } else {
        // The list is unchanged but an enabled flag may have been toggled.
        this.applySidebarDots?.()
      }
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
    // A provider may be created on the fly (ADD panel): fall back to a blank
    // config so the required fields are always present.
    const base = current.providers[provider] ?? { model: '', baseUrl: '', models: {} }
    const config = { ...base, ...patch }
    void settingsManager.save({ providers: { ...current.providers, [provider]: config } })
  }

  private renderProviderPanel(provider: ApiProvider, panelEl: HTMLElement) {
    this.providerUnsubs.forEach(u => u())
    this.providerUnsubs = []
    this.providerPanelEl = panelEl
    panelEl.replaceChildren()
    if (provider === ADD) {
      this.renderAddProviderPanel(panelEl)
      return
    }
    this.buildProviderBlock(provider)
  }

  private buildProviderBlock(provider: ApiProvider) {
    const config = settingsManager.get().providers[provider]

    // Provider title + enable switch — enabled providers get a green dot in the
    // sidebar; disabled ones stay listed but are not selectable as the active
    // provider. Disabling the active provider falls back to the first other
    // enabled one.
    const titleItem = new SettingItem()
    const providerName = providerLabel(provider)
    const statusText = (enabled: boolean) =>
      `${providerName} (${enabled ? t.settings.enabled : t.settings.disabled})`
    titleItem.addTitle(statusText(isProviderEnabled(config)))
    const titleEl = titleItem.containerEl.querySelector('h3.typ-setting-title')
    titleItem.addCheckbox((checkbox) => {
      checkbox.checked = isProviderEnabled(config)
      checkbox.onchange = () => {
        this.saveProvider(provider, { enabled: checkbox.checked })
        if (titleEl) titleEl.textContent = statusText(checkbox.checked)
        const current = settingsManager.get()
        if (!checkbox.checked && current.provider === provider) {
          // saveProvider already synced the flag into `current`, so a disabled
          // active provider is skipped by the fallback lookup.
          const fallback = pickFallbackProvider(current)
          if (fallback) void settingsManager.save({ provider: fallback })
        }
      }
    })
    this.providerPanelEl?.append(titleItem.containerEl)

    // Base URL.
    const baseUrlItem = new SettingItem()
    baseUrlItem.addName(t.settings.baseUrl)
    baseUrlItem.addDescription(t.settings.baseUrlDesc)
    baseUrlItem.addText((input) => {
      input.placeholder = baseUrlHint(provider) || t.settings.baseUrlPlaceholder
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

    // Remove provider — only custom providers are removable. Removing the
    // active provider falls back to the built-in `ollama`.
    if (!isBuiltinProvider(provider)) {
      const removeItem = new SettingItem()
      removeItem.addButton((button) => {
        button.textContent = t.settings.removeProvider
        button.onclick = () => {
          const current = settingsManager.get()
          const providers = { ...current.providers }
          delete providers[provider]
          void settingsManager.save({
            providers,
            ...(current.provider === provider ? { provider: 'ollama' as const } : {}),
          })
        }
      })
      this.providerPanelEl?.append(removeItem.containerEl)
    }
  }

  private renderAddProviderPanel(panelEl: HTMLElement) {
    let idInput: HTMLInputElement | null = null
    let urlInput: HTMLInputElement | null = null

    const idItem = new SettingItem()
    idItem.addName(t.settings.providerId)
    idItem.addDescription(t.settings.providerIdDesc)
    idItem.addText((el) => {
      idInput = el
      el.placeholder = t.settings.providerIdPlaceholder
    })
    panelEl.append(idItem.containerEl)

    const urlItem = new SettingItem()
    urlItem.addName(t.settings.baseUrl)
    urlItem.addDescription(t.settings.baseUrlDesc)
    urlItem.addText((el) => {
      urlInput = el
      el.placeholder = t.settings.baseUrlPlaceholder
    })
    panelEl.append(urlItem.containerEl)

    const addItem = new SettingItem()
    addItem.addButton((button) => {
      button.textContent = t.settings.addProvider
      button.onclick = () => {
        const id = idInput?.value.trim() ?? ''
        if (!id || isBuiltinProvider(id)) return
        const latest = settingsManager.get()
        if (latest.providers[id]) return
        this.saveProvider(id, { baseUrl: (urlInput?.value ?? '').trim() })
        // Two-step setItems: the first list has no ADD so the active sentinel
        // falls out and core re-selects the new provider; the second restores
        // ADD. Both render the same provider panel (no visible flicker). The
        // labels are read AFTER saveProvider (settings.set is synchronous).
        const labels = collectProviderIds(settingsManager.get().providers).map(providerLabel)
        const idLabel = providerLabel(id)
        this.sidebarLayout?.setItems([idLabel, ...labels.filter(l => l !== idLabel)])
        this.sidebarLayout?.setItems([...labels, ADD])
      }
    })
    panelEl.append(addItem.containerEl)
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
    nameItem.addTitle(item)
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
