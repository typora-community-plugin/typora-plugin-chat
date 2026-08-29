import { SettingTab } from '@typora-community-plugin/core'
import type { App, Plugin } from '@typora-community-plugin/core'
import { settingsManager } from '@/config/settings'
import { availableModels, modelRefreshMessage, refreshModels } from '@/store/models-store'
import { globalSkillsDir, vaultSkillsDir } from '@/agent/skills/paths'
import { rescanSkills } from '@/agent/skills/store'
import type { ApiProvider, PluginSettings } from '@/config/types'
import { t } from '@/i18n'


function getProviders(): Array<{ value: ApiProvider; label: string }> {
  return [
    { value: 'anthropic', label: t.settings.providers.anthropic },
    { value: 'openai', label: t.settings.providers.openai },
    { value: 'ollama', label: t.settings.providers.ollama },
    { value: 'custom', label: t.settings.providers.custom },
  ]
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
    return t.settings.title
  }

  private render() {
    this.addSettingTitle(t.settings.title)

    this.addSetting((setting) => {
      setting.addName(t.settings.provider)
      setting.addDescription(t.settings.providerDesc)
      setting.addSelect((select) => {
        for (const { value, label } of getProviders()) {
          select.append(new Option(label, value))
        }
        select.value = settingsManager.get().provider
        select.onchange = () => {
          void settingsManager.save({ provider: select.value as ApiProvider })
        }
      })
    })

    this.addSetting((setting) => {
      setting.addName(t.settings.openaiApiMode)
      setting.addDescription(t.settings.openaiApiModeDesc)
      setting.addSelect((select) => {
        select.append(new Option(t.settings.openaiApiModeResponses, 'responses'))
        select.append(new Option(t.settings.openaiApiModeChat, 'chat'))
        select.value = settingsManager.get().openaiApiMode ?? 'responses'
        select.onchange = () => {
          void settingsManager.save({
            openaiApiMode: select.value as PluginSettings['openaiApiMode'],
          })
        }
      })
    })

    this.addSetting((setting) => {
      setting.addName(t.settings.baseUrl)
      setting.addDescription(t.settings.baseUrlDesc)
      setting.addText((input) => {
        input.placeholder = t.settings.baseUrlPlaceholder
        input.value = settingsManager.get().baseUrl
        input.onchange = () => {
          void settingsManager.save({ baseUrl: input.value.trim() })
        }
      })
    })

    this.addSetting((setting) => {
      setting.addName(t.settings.apiKey)
      setting.addDescription(t.settings.apiKeyDesc)
      setting.addInput('password', (input) => {
        input.placeholder = t.settings.apiKeyPlaceholder
        input.value = settingsManager.get().apiKey
        input.onchange = () => {
          void settingsManager.save({ apiKey: input.value.trim() })
        }
      })
    })

    this.addSetting((setting) => {
      setting.addName(t.settings.model)
      setting.addDescription(t.settings.modelDesc)

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

      const renderOptions = (models: string[]) => {
        datalist.innerHTML = ''
        for (const id of models) {
          const option = document.createElement('option')
          option.value = id
          datalist.append(option)
        }
      }

      availableModels.subscribe(renderOptions)
      modelRefreshMessage.subscribe((message) => {
        if (statusEl) statusEl.textContent = message
      })

      setting.addButton((button) => {
        button.textContent = t.settings.refreshModels
        button.onclick = () => {
          void refreshModels()
        }
      })
    })

    this.addSetting((setting) => {
      setting.addName(t.settings.contextWindow)
      setting.addDescription(t.settings.contextWindowDesc)
      setting.addInput('number', (input) => {
        input.min = '0'
        input.placeholder = t.settings.contextWindowPlaceholder
        input.value = settingsManager.get().contextWindow ? String(settingsManager.get().contextWindow) : ''
        input.onchange = () => {
          const value = input.value.trim()
          if (!value) {
            void settingsManager.save({ contextWindow: undefined })
            return
          }
          const contextWindow = Number(value)
          if (Number.isFinite(contextWindow) && contextWindow > 0) {
            void settingsManager.save({ contextWindow })
          }
        }
      })
    })

    this.addSetting((setting) => {
      setting.addName(t.settings.contextWindows)
      setting.addDescription(t.settings.contextWindowsDesc)
      setting.addTextArea((textarea) => {
        textarea.rows = 5
        textarea.placeholder = t.settings.contextWindowsPlaceholder
        const overrides = settingsManager.get().contextWindows ?? {}
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
          void settingsManager.save({ contextWindows: next })
        }
      })
    })

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
}
