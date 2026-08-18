/**
 * The `/new` built-in slash command — resets the chat to a fresh session.
 */

import type { SlashCommand } from './types'
import { getActiveSession, saveActiveSession, createSession } from '@/store/session-store'
import { chatStore } from '@/store/chat-store'
import { getAgentHistory, setAgentHistory } from '@/agent/history'
import { undoStore } from '@/store/undo-store'
import { refreshContextUsage } from '@/store/context-usage-store'

/** The `/new` built-in command: start a fresh session. */
export const newCommand: SlashCommand = {
  name: 'new',
  command: '/new',
  subcommandPrefix: '/new:',
  hasSubcommands: false,
  takesRest: true,
  suggestSubcommands: () => [],
  callback: (_sub, rest, context) => {
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
    // Any trailing text after /new is sent as the first message of the new session.
    const seed = rest.trim()
    if (seed) {
      context.onSend?.(seed)
    }
  },
}
