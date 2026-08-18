/**
 * The `/undo` built-in slash command — reverses the most recent write-tool
 * call recorded in this session (see `@/agent/tools/system/undo`). Pure helper;
 * no Svelte dependencies so it can be unit-tested alongside the other commands.
 */

import type { SlashCommand } from './types'
import { chatStore } from '@/store/chat-store'
import { popLastAgentTurn } from '@/agent/history'
import { undoStore } from '@/store/undo-store'
import { executeUndo } from '@/agent/tools/system/undo'

/** The `/undo` built-in command: undo one step of agent file mutations. */
export const undoCommand: SlashCommand = {
  name: 'undo',
  command: '/undo',
  subcommandPrefix: '/undo:',
  hasSubcommands: false,
  suggestSubcommands: () => [],
  callback: async () => {
    const result = await executeUndo()
    if (result.isError) {
      chatStore.addError(result.content)
    } else {
      // Remove the rolled-back turn from both stores, keeping their removals
      // in sync so a later /sessions save or reload stays consistent.
      // Capture removed chat messages for potential /redo re-insertion.
      const { userText, removedMessages } = chatStore.popLastUserTurnWithMessages()
      popLastAgentTurn()
      undoStore.setRedoChatMessages(removedMessages)
      if (userText) chatStore.inputPlaceholder.set(userText)
    }
  },
}
