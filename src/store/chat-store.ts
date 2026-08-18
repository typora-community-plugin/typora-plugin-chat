import { get, writable } from 'svelte/store'
import type { AssistantMeta, ChatMessage, SelectionScope, ToolResult } from '@/config/types'
import { t } from '@/i18n'


const HISTORY_KEY = 'typora-plugin-chat.history'
const MAX_MESSAGES = 50
const KEEP_MESSAGES = 40

function createId(): string {
  try {
    return crypto.randomUUID()
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  }
}

function trimMessages(msgs: ChatMessage[]): ChatMessage[] {
  if (msgs.length <= MAX_MESSAGES) return msgs
  const kept = msgs.slice(msgs.length - KEEP_MESSAGES)
  const summary: ChatMessage = {
    id: createId(),
    type: 'assistant',
    text: t.chat.compressedHistory,
    timestamp: Date.now(),
  }
  return [summary, ...kept]
}

function loadHistory(): ChatMessage[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter(m => m && m.type) : []
  } catch {
    return []
  }
}

export const messages = writable<ChatMessage[]>(loadHistory())
export const thinking = writable<boolean>(false)
export const inputEnabled = writable<boolean>(true)
export const selection = writable<SelectionScope | null>(null)
export const askUserQuestion = writable<string | null>(null)
export const inputPlaceholder = writable<string>('')

let askUserResolver: ((answer: string) => void) | null = null

function persist() {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(trimMessages(get(messages))))
  } catch {
    /* storage full or unavailable */
  }
}

export const chatStore = {
  messages,
  thinking,
  inputEnabled,
  selection,
  askUserQuestion,
  inputPlaceholder,

  addUserMessage(text: string, selectionScope?: SelectionScope | null) {
    const msg: ChatMessage = { id: createId(), type: 'user', text, timestamp: Date.now() }
    messages.update(msgs => trimMessages([...msgs, msg]))
    if (selectionScope) selection.set(null)
    persist()
  },

  addAssistantMessage(content: string, meta?: AssistantMeta): string {
    const msg: ChatMessage = {
      id: createId(),
      type: 'assistant',
      text: content,
      timestamp: Date.now(),
      ...(meta ? { meta } : {}),
    }
    messages.update(msgs => trimMessages([...msgs, msg]))
    persist()
    return msg.id
  },

  /** Attach completion metadata to assistant messages after a reply finishes. */
  setAssistantMeta(ids: string[], meta: AssistantMeta) {
    if (!ids.length) return
    const idSet = new Set(ids)
    messages.update(msgs => msgs.map(m => idSet.has(m.id) ? { ...m, meta } : m))
    persist()
  },

  /** Reasoning / chain-of-thought text shown as a collapsible block. */
  addThinkingMessage(content: string) {
    const msg: ChatMessage = { id: createId(), type: 'thinking', text: content, timestamp: Date.now() }
    messages.update(msgs => trimMessages([...msgs, msg]))
    persist()
  },

  addToolCall(name: string, input: Record<string, unknown>): string {
    const id = createId()
    const msg: ChatMessage = { id, type: 'tool_call', toolName: name, toolInput: input, timestamp: Date.now() }
    messages.update(msgs => trimMessages([...msgs, msg]))
    persist()
    return id
  },

  updateToolResult(id: string, result: ToolResult, isError = false) {
    messages.update(msgs => msgs.map(m => {
      if (m.id !== id) return m
      const updated: ChatMessage = {
        ...m,
        type: 'tool_result',
        toolResult: { content: result.content, isError: isError || result.isError },
      }
      return updated
    }))
    persist()
  },

  showThinking() {
    thinking.set(true)
  },

  hideThinking() {
    thinking.set(false)
  },

  addError(text: string) {
    const msg: ChatMessage = { id: createId(), type: 'error', text, isError: true, timestamp: Date.now() }
    messages.update(msgs => trimMessages([...msgs, msg]))
    persist()
  },

  clearMessages() {
    messages.set([])
    askUserQuestion.set(null)
    askUserResolver = null
    inputPlaceholder.set(t.chat.inputPlaceholder)
    try {
      localStorage.removeItem(HISTORY_KEY)
    } catch {
      /* ignore */
    }
  },

  showAskUser(question: string): Promise<string> {
    askUserQuestion.set(question)
    inputPlaceholder.set(t.chat.typeYourAnswer)
    return new Promise(resolve => {
      askUserResolver = resolve
    })
  },

  answerAskUser(answer: string) {
    const resolve = askUserResolver
    askUserResolver = null
    askUserQuestion.set(null)
    inputPlaceholder.set(t.chat.inputPlaceholder)
    if (resolve) resolve(answer)
  },

  setInputEnabled(enabled: boolean) {
    inputEnabled.set(enabled)
  },

  setSelection(sel: SelectionScope | null) {
    selection.set(sel)
  },

  getSelection(): SelectionScope | null {
    return get(selection)
  },

  getMessages(): ChatMessage[] {
    return get(messages)
  },

  /** Replace the whole transcript, e.g. when switching chat sessions. */
  replaceMessages(msgs: ChatMessage[]) {
    messages.set(Array.isArray(msgs) ? msgs : [])
    askUserQuestion.set(null)
    askUserResolver = null
    inputPlaceholder.set(t.chat.inputPlaceholder)
    persist()
  },

  /**
   * Drop the last user turn from the transcript (the user message plus every
   * assistant / tool_call / tool_result / thinking / error message after it).
   * Returns the removed user message's text, or null when there is no user
   * message to drop. Used by `/undo` so the rolled-back turn disappears from
   * the UI and its prompt can be refilled into the input box.
   */
  popLastUserTurn(): string | null {
    const msgs = get(messages)
    let i = -1
    for (let k = msgs.length - 1; k >= 0; k--) {
      if (msgs[k]!.type === 'user') { i = k; break }
    }
    if (i < 0) return null
    const userMsg = msgs[i]!
    messages.set(msgs.slice(0, i))
    persist()
    return typeof userMsg.text === 'string' && userMsg.text ? userMsg.text : null
  },

  /**
   * Drop the last user turn and return BOTH the removed messages (for redo)
   * and the user text. Used by `/undo` to capture what was removed so `/redo`
   * can re-insert it into the transcript.
   */
  popLastUserTurnWithMessages(): { userText: string | null; removedMessages: ChatMessage[] } {
    const msgs = get(messages)
    let i = -1
    for (let k = msgs.length - 1; k >= 0; k--) {
      if (msgs[k]!.type === 'user') { i = k; break }
    }
    if (i < 0) return { userText: null, removedMessages: [] }
    const userMsg = msgs[i]!
    const removedMessages = msgs.slice(i)
    messages.set(msgs.slice(0, i))
    persist()
    return {
      userText: typeof userMsg.text === 'string' && userMsg.text ? userMsg.text : null,
      removedMessages,
    }
  },

  /** Re-append previously removed chat messages (used by /redo). */
  appendMessages(msgs: ChatMessage[]): void {
    if (!msgs.length) return
    const current = get(messages)
    messages.set([...current, ...msgs])
    persist()
  },

  clearSelection() {
    selection.set(null)
  },
}
