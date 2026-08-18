/**
 * The `/undo` built-in slash command — reverses the most recent write-tool
 * call recorded in this session (see `@/agent/tools/system/undo`). Pure helper;
 * no Svelte dependencies so it can be unit-tested alongside the other commands.
 */

import type { SlashCommand } from './types'

/** The `/undo` built-in command: undo one step of agent file mutations. */
export const undoCommand: SlashCommand = {
  name: 'undo',
  command: '/undo',
  subcommandPrefix: '/undo:',
  hasSubcommands: false,
  suggestSubcommands: () => [],
}
