/**
 * The `/redo` built-in slash command — restores the most recently undone turn.
 * Pure helper; no Svelte dependencies so it can be unit-tested alongside the
 * other commands.
 */

import type { SlashCommand } from './types'

/** The `/redo` built-in command: redo the last undone agent turn. */
export const redoCommand: SlashCommand = {
  name: 'redo',
  command: '/redo',
  subcommandPrefix: '/redo:',
  hasSubcommands: false,
  suggestSubcommands: () => [],
}
