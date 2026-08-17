/**
 * The `/new` built-in slash command — resets the chat to a fresh session.
 * Pure helpers — no Svelte dependencies, so they are easy to unit test and can
 * be reused by any component that needs built-in command suggestions.
 */

import type { SlashCommand } from './types'

/** The `/new` built-in command: start a fresh session. */
export const newCommand: SlashCommand = {
  name: 'new',
  command: '/new',
  subcommandPrefix: '/new:',
  hasSubcommands: false,
  suggestSubcommands: () => [],
}
