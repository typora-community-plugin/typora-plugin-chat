import { get, writable } from 'svelte/store'
import type { ChatMessage, SelectionScope, ToolResult } from '../config/types'


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
    text: '*(Earlier conversation was compressed to keep the context window manageable.)*',
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
export const inputPlaceholder = writable<string>('输入消息...')

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

  addAssistantMessage(content: string) {
    const msg: ChatMessage = { id: createId(), type: 'assistant', text: content, timestamp: Date.now() }
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
    inputPlaceholder.set('输入消息...')
    try {
      localStorage.removeItem(HISTORY_KEY)
    } catch {
      /* ignore */
    }
  },

  showAskUser(question: string): Promise<string> {
    askUserQuestion.set(question)
    inputPlaceholder.set('Type your answer...')
    return new Promise(resolve => {
      askUserResolver = resolve
    })
  },

  answerAskUser(answer: string) {
    const resolve = askUserResolver
    askUserResolver = null
    askUserQuestion.set(null)
    inputPlaceholder.set('输入消息...')
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

  clearSelection() {
    selection.set(null)
  },
}
