/**
 * Session persistence for the chat view.
 *
 * Each session stores the UI transcript (`ChatMessage[]`) and the agent API
 * history (`ApiMessage[]`) so switching sessions restores both the visible
 * conversation and the actual context sent to the model.
 */

import { derived, get, writable } from 'svelte/store'
import type { ApiMessage, ChatMessage } from '@/config/types'

export interface ChatSession {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  messages: ChatMessage[]
  history: ApiMessage[]
}

export interface SessionSummary {
  id: string
  title: string
  updatedAt: number
}

const SESSIONS_KEY = 'typora-plugin-chat.sessions'
const LEGACY_HISTORY_KEY = 'typora-plugin-chat.history'

/**
 * Sessions are scoped per vault: each vault has its own localStorage key so a
 * vault can only see the sessions created inside it. Legacy data written by
 * older versions under the unscoped `SESSIONS_KEY` is rekeyed into the current
 * vault on first load (one-time migration). The path is hashed to keep keys
 * short and stable regardless of path length or characters.
 */

/** Deterministic 32-bit FNV-1a hash, rendered as a fixed-width hex string. */
function hashPath(path: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < path.length; i++) {
    h ^= path.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}

function sessionKey(vaultPath: string): string {
  return `${SESSIONS_KEY}:${vaultPath ? hashPath(vaultPath) : 'global'}`
}

let currentVault = ''

function createId(): string {
  try {
    return crypto.randomUUID()
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  }
}

function isChatMessage(value: unknown): value is ChatMessage {
  return !!value && typeof value === 'object' && typeof (value as ChatMessage).type === 'string'
}

function isApiMessage(value: unknown): value is ApiMessage {
  return !!value && typeof value === 'object' && typeof (value as ApiMessage).role === 'string'
}

function createDefaultSession(title = 'Chat'): ChatSession {
  const now = Date.now()
  return {
    id: createId(),
    title,
    createdAt: now,
    updatedAt: now,
    messages: [],
    history: [],
  }
}

function readStoredSessions(): { sessions: ChatSession[]; activeSessionId: string | null } | null {
  try {
    const raw = localStorage.getItem(sessionKey(currentVault))
    if (!raw) return null
    const parsed = JSON.parse(raw) as { sessions?: unknown; activeSessionId?: unknown }
    if (!Array.isArray(parsed.sessions)) return null
    const sessions = parsed.sessions.filter((s): s is ChatSession => {
      return !!s && typeof s === 'object' &&
        typeof (s as ChatSession).id === 'string' &&
        Array.isArray((s as ChatSession).messages) &&
        Array.isArray((s as ChatSession).history)
    })
    if (!sessions.length) return null
    const activeSessionId = typeof parsed.activeSessionId === 'string' &&
      sessions.some((s) => s.id === parsed.activeSessionId)
      ? parsed.activeSessionId
      : sessions[0].id
    return { sessions, activeSessionId }
  } catch {
    return null
  }
}

function readLegacyHistory(): ChatMessage[] {
  try {
    const raw = localStorage.getItem(LEGACY_HISTORY_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter(isChatMessage) : []
  } catch {
    return []
  }
}

/** Migrate legacy unscoped sessions into the current vault's key exactly once. */
function migrateLegacySessions(): void {
  const raw = localStorage.getItem(SESSIONS_KEY)
  if (!raw) return
  try {
    localStorage.setItem(sessionKey(currentVault), raw)
    localStorage.removeItem(SESSIONS_KEY)
  } catch {
    /* storage unavailable — nothing to migrate */
  }
}

function persist(sessions: ChatSession[], activeSessionId: string | null) {
  try {
    localStorage.setItem(sessionKey(currentVault), JSON.stringify({ sessions, activeSessionId }))
  } catch {
    /* storage full or unavailable */
  }
}

export const sessions = writable<ChatSession[]>([])
export const activeSessionId = writable<string | null>(null)
export const sessionSummaries = derived(sessions, (list) => list
  .map((s): SessionSummary => ({
    id: s.id,
    title: s.title,
    updatedAt: s.updatedAt,
  }))
  .sort((a, b) => b.updatedAt - a.updatedAt))

let initialized = false

export function initSessionStore(): void {
  if (initialized) return
  initialized = true
  currentVault = vaultPath
  migrateLegacySessions()

  const stored = readStoredSessions()
  if (stored) {
    sessions.set(stored.sessions)
    activeSessionId.set(stored.activeSessionId)
    return
  }

  const legacy = readLegacyHistory()
  const initial = legacy.length
    ? { ...createDefaultSession(), messages: legacy }
    : createDefaultSession()
  sessions.set([initial])
  activeSessionId.set(initial.id)
  persist([initial], initial.id)
}

/**
 * Reload the session store for the current vault. Called from `main.ts` when
 * the user switches vaults (and from tests to simulate a switch). The previous
 * vault keeps its persisted data under its own key; if the active session id no
 * longer exists in this vault's list, it falls back to that vault's most recent
 * session.
 */
export function reloadSessionStore(): void {
  if (vaultPath === currentVault) return
  currentVault = vaultPath

  const stored = readStoredSessions()
  if (stored) {
    sessions.set(stored.sessions)
    activeSessionId.set(stored.activeSessionId)
    return
  }

  const initial = createDefaultSession(sessionTitle)
  sessions.set([initial])
  activeSessionId.set(initial.id)
  persist([initial], initial.id)
}

/** Vault path used to scope session storage; falls back to a shared bucket. */
let vaultPath = ''
export function setVaultScope(path: string): void {
  vaultPath = path ?? ''
}

/** Title for new sessions, with an English fallback when i18n is uninitialized. */
let sessionTitle = 'Chat'
export function setSessionTitle(title: string): void {
  if (title) sessionTitle = title
}

export function getActiveSession(): ChatSession | undefined {
  const id = get(activeSessionId)
  if (!id) return undefined
  return get(sessions).find((s) => s.id === id)
}

/** Persist the current session's transcript and agent history. */
export function saveActiveSession(messages: ChatMessage[], history: ApiMessage[]): void {
  const id = get(activeSessionId)
  if (!id) return
  const current = get(sessions)
  const next = current.map((s) => {
    if (s.id !== id) return s
    return {
      ...s,
      messages: Array.isArray(messages) ? messages : s.messages,
      history: Array.isArray(history) ? history : s.history,
      updatedAt: Date.now(),
    }
  })
  sessions.set(next)
  persist(next, id)
}

export function switchSession(id: string): ChatSession | undefined {
  const current = get(sessions)
  if (!current.some((s) => s.id === id)) return undefined
  activeSessionId.set(id)
  persist(current, id)
  return current.find((s) => s.id === id)
}

export function createSession(title = 'Chat'): ChatSession {
  const session = createDefaultSession(title)
  const next = [...get(sessions), session]
  sessions.set(next)
  activeSessionId.set(session.id)
  persist(next, session.id)
  return session
}

export function updateSessionTitle(id: string, title: string): void {
  const next = get(sessions).map((s) => s.id === id ? { ...s, title, updatedAt: Date.now() } : s)
  sessions.set(next)
  persist(next, get(activeSessionId))
}

/** Delete a session. The remaining most-recently-used one becomes active. */
export function deleteSession(id: string): ChatSession | undefined {
  const current = get(sessions)
  if (!current.some((s) => s.id === id)) return undefined
  const next = current.filter((s) => s.id !== id)
  const fallback = next.length ? next : [createDefaultSession(sessionTitle)]
  sessions.set(fallback)
  activeSessionId.set(fallback[0]!.id)
  persist(fallback, fallback[0]!.id)
  return fallback[0]
}

