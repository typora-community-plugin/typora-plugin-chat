/**
 * Agent conversation history state and manipulation functions.
 *
 * Extracted from loop.ts to break the circular import cycle:
 *   loop.ts → executor.ts → undo/redo.ts → (needs) getAgentHistory/setAgentHistory
 *
 * This module has NO dependency on executor or any tool module, so it is safe
 * for tools (undo, redo, etc.) to import from without creating a cycle.
 */

import type { ApiMessage } from '@/config/types'

const MAX_HISTORY = 50
const KEEP_HISTORY = 40

let history: ApiMessage[] = []

function trimHistory(messages: ApiMessage[]): ApiMessage[] {
  return messages.length > MAX_HISTORY ? messages.slice(messages.length - KEEP_HISTORY) : messages
}

export function resetAgentHistory(): void {
  history = []
}

/**
 * Drop the last user turn from agent history so a `/undo` (which rolls back the
 * file mutations that turn caused) also removes its context from future model
 * requests. Returns the turn's original user message text, or null when there
 * is no user turn to drop — callers use it to refill the input box.
 */
export function popLastAgentTurn(): string | null {
  let i = history.length - 1
  while (i >= 0 && history[i]!.role !== 'user') i--
  if (i < 0) return null
  const userMsg = history[i]!
  const content = typeof userMsg.content === 'string' ? userMsg.content : ''
  history = history.slice(0, i)
  return content || null
}

/** Return a copy of the current agent history (conversation sent to the API). */
export function getAgentHistory(): ApiMessage[] {
  return history.slice()
}

/** Replace the agent history, e.g. when switching to a saved session. */
export function setAgentHistory(next: ApiMessage[]): void {
  history = Array.isArray(next) ? next.slice() : []
}

/** Called by loop.ts after each turn completes to store the new conversation. */
export function commitHistory(conversation: ApiMessage[]): void {
  history = trimHistory(conversation)
}
