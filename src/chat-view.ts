import { WorkspaceView } from '@typora-community-plugin/core'
import { mount, unmount } from 'svelte'
import App from './ui/App.svelte'
import { chatStore } from './store/chat-store'
import { refreshContextUsage, setApiInputTokens } from './store/context-usage-store'
import { settingsManager } from './config/settings'
import { abortAgentLoop, executeAgentLoop } from './agent/loop'
import { getAgentHistory, resetAgentHistory, setAgentHistory } from './agent/history'
import { createSession, getActiveSession, saveActiveSession, updateSessionTitle } from './store/session-store'
import { undoStore } from './store/undo-store'
import { fs } from '@typora-community-plugin/core'
import { getSelection } from './adapter/editor'
import { getSkill } from './agent/skills/index'
import { stripFrontmatter } from './agent/skills/frontmatter'
import type { AssistantMeta, ToolResult } from './config/types'


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
        onSend: (text: string) => this.handleSend(text),
        onStop: () => abortAgentLoop(),
        onNew: (rest: string) => {
          // Save the current conversation, then start a fresh session so the
          // previous transcript remains available through the /sessions picker.
          const current = getActiveSession()
          if (current && (chatStore.getMessages().length > 0 || getAgentHistory().length > 0)) {
            saveActiveSession(chatStore.getMessages(), getAgentHistory())
          }
          // /undo and /redo are session-scoped: dropping both stacks here
          // guarantees a new session cannot reach across boundaries.
          undoStore.clear()
          undoStore.clearRedo()
          createSession()
          chatStore.replaceMessages([])
          chatStore.clearSelection()
          setAgentHistory([])
          void refreshContextUsage({ refreshStatic: true })
          const seed = rest.trim()
          if (seed) {
            void this.handleSend(seed)
          }
        },
        onSkillInvoke: (name: string, rest: string) => void this.handleSkillInvoke(name, rest),
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

  /**
   * Entry point for an explicit `/skill:<name>` invocation. The transcript
   * shows the original command line; internally the skill body is inlined as
   * an instruction prefix so the model follows it for this turn regardless of
   * whether it would have called use_skill on its own.
   */
  async handleSkillInvoke(skillName: string, rest: string) {
    const displayText = `/skill:${skillName}${rest ? ` ${rest}` : ''}`

    let skill
    try {
      skill = await getSkill(skillName)
    } catch {
      /* fall through to error below */
    }
    if (!skill) {
      chatStore.addUserMessage(displayText, null)
      const callId = chatStore.addToolCall('use_skill', { name: skillName })
      chatStore.updateToolResult(callId, { content: `Unknown skill "${skillName}".`, isError: true }, true)
      return
    }

    let body = ''
    try {
      const text = await fs.readText(skill.path)
      body = stripFrontmatter(text).trim()
    } catch (error: any) {
      chatStore.addUserMessage(displayText, null)
      chatStore.addError(`Failed to read skill "${skillName}": ${error.message || error}`)
      return
    }

    const expandedMessage =
      `Follow the instructions of the skill "${skill.name}" for this turn. ` +
      `Auxiliary files live under ${skill.dir}; read them if referenced.\n\n` +
      `${body}\n\n` +
      (rest.trim() ? `User request: ${rest.trim()}` : 'Apply the skill to the current context.')

    await this.runTurn({ displayText, expandedMessage })
  }

  private async runTurn(options: { displayText: string; expandedMessage: string | null }) {
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
          onAskUser: (question) => {
            chatStore.setInputEnabled(true)
            return chatStore.showAskUser(question)
          },
          onThinkingChange: (isThinking) => {
            if (isThinking) chatStore.showThinking()
            else chatStore.hideThinking()
          },
          onUsage: (usage) => setApiInputTokens(usage.inputTokens),
        },
        settingsManager.get().maxIterations,
      )

      if (assistantIds.length && !result.aborted) {
        const durationMs = performance.now() - startedAt
        const generationMs = result.apiDurationMs && result.apiDurationMs > 0 ? result.apiDurationMs : durationMs
        const outputTokens = result.usage?.outputTokens ?? 0
        const chars = result.text.length
        const seconds = Math.max(generationMs, 1) / 1000
        const meta: AssistantMeta = {
          model: result.model ?? settingsManager.get().model,
          durationMs: Math.round(durationMs),
          outputTokens,
          chars,
        }

        if (outputTokens > 0) {
          meta.speed = outputTokens / seconds
          meta.speedUnit = 'tokens'
        } else if (chars > 0) {
          meta.speed = chars / seconds
          meta.speedUnit = 'chars'
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
