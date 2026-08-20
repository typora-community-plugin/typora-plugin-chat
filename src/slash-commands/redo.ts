/**
 * The `/redo` built-in slash command — restores the most recently undone turn.
 * Pure helper; no Svelte dependencies so it can be unit-tested alongside the
 * other commands.
 */

import type { SlashCommand } from './types'
import { chatStore } from '@/store/chat-store'
import { undoStore } from '@/store/undo-store'
import { replayRedoEntry } from '@/agent/tools/system/redo'
import { t } from '@/i18n'

/** The `/redo` built-in command: redo the last undone agent turn. */
export const redoCommand: SlashCommand = {
  name: 'redo',
  command: '/redo',
  subcommandPrefix: '/redo:',
  hasSubcommands: false,
  description: () => ((t as any).chat?.slash?.redo?.description) || '',
  suggestSubcommands: () => [],
  callback: async () => {
    const entry = undoStore.popRedo()
    if (!entry) {
      chatStore.addError('没有可重做的操作')
      return
    }
    // Re-insert the removed chat messages so the turn re-appears in the UI.
    if (entry.chatMessages && entry.chatMessages.length > 0) {
      chatStore.appendMessages(entry.chatMessages)
    }
    const result = await replayRedoEntry(entry)
    if (result.isError) {
      // Surface failures as a redo tool-call block instead of an error bubble.
      const callId = chatStore.addToolCall('redo', {})
      chatStore.updateToolResult(callId, result, true)
    }
  },
}
