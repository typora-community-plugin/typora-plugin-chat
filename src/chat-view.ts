import { app, WorkspaceView } from '@typora-community-plugin/core'
import { mount, unmount } from 'svelte'
import App from './ui/App.svelte'
import { chatStore } from './store/chat-store'
import { settingsManager } from './config/settings'
import { abortAgentLoop, executeAgentLoop, resetAgentHistory } from './agent/loop'
import { getSelection } from './adapter/editor'
import type { PluginSettings } from './config/types'


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
    this.containerEl.classList.add('typ-chat-view')
    this.svelteComponent = mount(App, {
      target: this.containerEl,
      props: {
        app,
        onSend: (text: string) => this.handleSend(text),
        onStop: () => abortAgentLoop(),
        onClear: () => {
          resetAgentHistory()
          chatStore.clearMessages()
        },
        onSaveSettings: (next: PluginSettings) => settingsManager.save(next),
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
  }

  async handleSend(text: string) {
    const selection = chatStore.getSelection()
    let userMessage = text
    if (selection) {
      const origin = selection.filePath ?? 'the active document'
      userMessage =
        `[Selection scope: Work only within this selection from ${origin}.]\n` +
        `Selected text:\n> ${selection.text}\n\nUser message: ${text}`
    }

    chatStore.addUserMessage(text, selection)
    chatStore.setInputEnabled(false)

    try {
      await executeAgentLoop(
        userMessage,
        {
          onText: (t) => chatStore.addAssistantMessage(t),
          onToolCall: (name, input) => chatStore.addToolCall(name, input),
          onToolResult: (id, _name, result) => chatStore.updateToolResult(id, result, result.isError),
          onError: (msg) => chatStore.addError(msg),
          onAskUser: (question) => {
            chatStore.setInputEnabled(true)
            return chatStore.showAskUser(question)
          },
          onThinkingChange: (isThinking) => {
            if (isThinking) chatStore.showThinking()
            else chatStore.hideThinking()
          },
        },
        settingsManager.get().maxIterations,
      )
    } finally {
      chatStore.setInputEnabled(true)
      chatStore.hideThinking()
    }
  }
}
