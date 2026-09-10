import './chat-view.scss'
import { WorkspaceView } from '@typora-community-plugin/core'
import { mount, unmount } from 'svelte'
import App from './ui/App.svelte'
import { chatStore } from './store/chat-store'
import { refreshContextUsage, setApiInputTokens } from './store/context-usage-store'
import { settingsManager } from './config/settings'
import { isProviderEnabled } from './config/providers'
import { t } from './i18n'
import { abortAgentLoop, executeAgentLoop } from './agent/loop'
import { getAgentHistory, resetAgentHistory } from './agent/history'
import { getActiveSession, saveActiveSession, updateSessionTitle } from './store/session-store'
import { undoStore } from './store/undo-store'
import type { AssistantMeta, ToolResult } from './config/types'
import { getActiveConfig } from './config/types'


/**
 * Svelte 5's DOM client caches `Node.prototype.firstChild/nextSibling`
 * descriptors on first mount. A few Typora renderer variants expose a
 * `Node` constructor whose prototype lacks these own accessor properties,
 * which makes `mount()` throw `Cannot read properties of undefined ('get')`.
 * Define the descriptors if they are missing before the first mount.
 */
function ensureSvelteDomShims() {
  const w = window as unknown as Record<string, unknown>
  if (!w.Node && w.Element) w.Node = w.Element
  const nodeCtor = w.Node as { prototype?: object } | undefined
  const proto = nodeCtor?.prototype as { childNodes?: unknown; parentNode?: unknown } | undefined
  if (!proto) return

  if (!Object.getOwnPropertyDescriptor(proto, 'firstChild')) {
    Object.defineProperty(proto, 'firstChild', {
      configurable: true,
      get(this: { childNodes?: ArrayLike<ChildNode> | null }) {
        return this.childNodes?.[0] ?? null
      },
    })
  }

  if (!Object.getOwnPropertyDescriptor(proto, 'nextSibling')) {
    Object.defineProperty(proto, 'nextSibling', {
      configurable: true,
      get(this: { parentNode?: { childNodes: ArrayLike<ChildNode> } | null }) {
        const siblings = this.parentNode?.childNodes
        if (!siblings) return null
        const index = Array.prototype.indexOf.call(siblings, this)
        return index >= 0 && index < siblings.length - 1 ? siblings[index + 1] : null
      },
    })
  }
}

export class ChatView extends WorkspaceView {

  static type = 'typora-plugin.chat'

  /** WorkspaceView does not create its own element; the subclass must. */
  containerEl = document.createElement('div')

  private svelteComponent: Record<string, unknown> | null = null

  onOpen() {
    ensureSvelteDomShims()
    this.setIcon('typ-icon typ-robot')
    this.containerEl.classList.add('typ-chat-view')
    this.svelteComponent = mount(App, {
      target: this.containerEl,
      props: {
        onSend: (text: string) => this.handleSend(text),
        onStop: () => abortAgentLoop(),
        runTurn: (options: { displayText: string; expandedMessage: string | null }) =>
          this.runTurn(options),
      },
    }) as unknown as Record<string, unknown>
  }

  onClose() {
    if (this.svelteComponent) {
      unmount(this.svelteComponent as Parameters<typeof unmount>[0])
      this.svelteComponent = null
    }
  }

  clearConversation() {
    resetAgentHistory()
    chatStore.clearMessages()
    chatStore.clearSelection()
    undoStore.clear()
    undoStore.clearRedo()
    void refreshContextUsage({ refreshStatic: true })
    const current = getActiveSession()
    if (current) {
      saveActiveSession([], [])
    }
  }

  /**
   * Public entry point for a normal user message. The transcript shows the raw
   * text; any skill expansion happens inside runTurn without touching what is
   * displayed to the user.
   */
  async handleSend(text: string) {
    await this.runTurn({ displayText: text, expandedMessage: null })
  }

  private async runTurn(options: { displayText: string; expandedMessage: string | null }) {
    // A disabled provider's models must never be used. The settings UI already
    // prevents selecting one as the active provider, but this is the last line
    // of defense (e.g. all providers disabled at once).
    const current = settingsManager.get()
    if (!isProviderEnabled(current.providers[current.provider])) {
      chatStore.addError(t.chat.activeProviderDisabled)
      return
    }

    const selection = chatStore.getSelection()
    let userMessage = options.expandedMessage ?? options.displayText
    if (selection) {
      const origin = selection.filePath ?? 'the active document'
      userMessage =
        `[Selection scope: Work only within this selection from ${origin}.]\n` +
        `Selected text:\n> ${selection.text}\n\nUser message: ${userMessage}`
    }

    chatStore.addUserMessage(options.displayText, selection)
    const active = getActiveSession()
    if (active && chatStore.getMessages().length === 1) {
      const title = options.displayText.replace(/\s+/g, ' ').trim().slice(0, 30)
      if (title) updateSessionTitle(active.id, title)
    }
    chatStore.setInputEnabled(false)

    const startedAt = performance.now()
    const assistantIds: string[] = []

    try {
      const result = await executeAgentLoop(
        userMessage,
        {
          onText: (t) => {
            assistantIds.push(chatStore.addAssistantMessage(t))
          },
          onThinking: (t) => chatStore.addThinkingMessage(t),
          onToolCall: (name, input) => chatStore.addToolCall(name, input),
          onToolResult: (id, _name, toolResult) => chatStore.updateToolResult(id, toolResult, toolResult.isError),
          onError: (msg) => chatStore.addError(msg),
          onAskUser: (questions) => {
            chatStore.setInputEnabled(true)
            return chatStore.showAskUser(questions)
          },
          onThinkingChange: (isThinking) => {
            if (isThinking) chatStore.showThinking()
            else chatStore.hideThinking()
          },
          onUsage: (usage) => setApiInputTokens(usage.inputTokens),
        },
        settingsManager.get().maxIterations,
      )

      if (assistantIds.length) {
        const durationMs = performance.now() - startedAt
        const meta: AssistantMeta = {
          model: result.model ?? getActiveConfig(settingsManager.get()).model,
          durationMs: Math.round(durationMs),
          ...(result.aborted ? { aborted: true } : {}),
        }

        if (!result.aborted) {
          const generationMs = result.apiDurationMs && result.apiDurationMs > 0 ? result.apiDurationMs : durationMs
          const outputTokens = result.usage?.outputTokens ?? 0
          const chars = result.text.length
          const seconds = Math.max(generationMs, 1) / 1000
          meta.outputTokens = outputTokens
          meta.chars = chars

          if (outputTokens > 0) {
            meta.speed = outputTokens / seconds
            meta.speedUnit = 'tokens'
          } else if (chars > 0) {
            meta.speed = chars / seconds
            meta.speedUnit = 'chars'
          }
        }

        chatStore.setAssistantMeta(assistantIds, meta)
      }
    } finally {
      chatStore.setInputEnabled(true)
      chatStore.hideThinking()
      void refreshContextUsage({ refreshStatic: true })
      const current = getActiveSession()
      if (current) {
        saveActiveSession(chatStore.getMessages(), getAgentHistory())
      }
    }
  }
}
