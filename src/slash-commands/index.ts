/**
 * Slash-command autocomplete logic for the input bar.
 * Pure helpers — no Svelte dependencies, so they are easy to unit test and can
 * be reused by any component that needs built-in commands or skill suggestions.
 *
 * All three commands (`/new`, `/sessions`, `/skill`) share the same shape:
 * - command mode: `/` plus letters filters the command names;
 * - subcommand mode: `/name:` plus letters filters that command's subcommands.
 * Command-specific logic lives in sibling modules: `/new` in `./new`,
 * `/sessions` in `./sessions`, `/skill` in `./skill`. This module only
 * orchestrates them through a generic parser.
 */

import { newCommand } from './new'
import { sessionsCommand } from './sessions'
import { skillCommand } from './skill'
import type { SlashCommand } from './types'

export interface SlashCommandOptions {
  /** Discovered skill names used as suggestion candidates. */
  skills: string[]
  /** Raw textarea value. */
  value: string
}

/** Maximum number of suggestions rendered at once. */
export const MAX_SUGGESTIONS = 8

/** The three slash commands, in display order. */
export const SLASH_COMMANDS: readonly SlashCommand[] = [newCommand, sessionsCommand, skillCommand]

/**
 * Returns the first token when it is a single slash token without a following
 * space. `null` means the suggestion list should be closed.
 */
function getBareSlashToken(value: string): string | null {
  const firstToken = value.split(/\s/)[0] ?? ''
  if (!firstToken.startsWith('/')) return null
  if (value.length > firstToken.length) return null
  return firstToken
}

/**
 * Compute the list of suggestions for the current input value.
 *
 * - Command mode (`/` or `/prefix`): match the three command names.
 * - Subcommand mode (`/name:` or `/name:query`): ask that command for
 *   subcommand suggestions. The command before the colon must match exactly
 *   (case-insensitively). Whitespace after the first token closes the list.
 */
export function computeSuggestions({ skills, value }: Pick<SlashCommandOptions, 'skills' | 'value'>): string[] {
  const token = getBareSlashToken(value)
  if (token === null) return []

  const colonIndex = token.indexOf(':')
  if (colonIndex === -1) {
    const query = token.slice(1).toLowerCase()
    return SLASH_COMMANDS
      .filter((cmd) => cmd.name.startsWith(query))
      .map((cmd) => cmd.command)
      .slice(0, MAX_SUGGESTIONS)
  }

  const name = token.slice(1, colonIndex).toLowerCase()
  const subquery = token.slice(colonIndex + 1)
  const command = SLASH_COMMANDS.find((cmd) => cmd.name === name)
  if (!command) return []

  return command.suggestSubcommands(subquery, { skills }).slice(0, MAX_SUGGESTIONS)
}

/**
 * Whether picking this command should continue into subcommand mode by
 * appending `:` instead of closing the suggestion list.
 */
export function shouldCompleteSubcommand(suggestion: string): boolean {
  return SLASH_COMMANDS.some((cmd) => cmd.hasSubcommands && cmd.command === suggestion)
}

/** Whether the suggestion list should be open for the given state. */
export function suggestionsShouldBeOpen({ skills, value }: SlashCommandOptions, enabled: boolean): boolean {
  return enabled && computeSuggestions({ skills, value }).length > 0
}
