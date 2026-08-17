/**
 * The `/new` built-in slash command — resets the chat to a fresh session.
 * Pure helpers — no Svelte dependencies, so they are easy to unit test and can
 * be reused by any component that needs built-in command suggestions.
 */

import { SESSIONS_COMMAND } from './sessions'

/** The `/new` built-in command: start a fresh session. */
export const NEW_COMMAND = '/new'

/** Built-in slash commands that are not skill invocations. */
const BUILTIN_COMMANDS = [NEW_COMMAND, SESSIONS_COMMAND]

/**
 * Built-in commands whose name (without the leading `/`) has `bareQuery` as a
 * case-insensitive prefix. `bareQuery` is the raw token after `/` and may be
 * empty, in which case every built-in command matches.
 */
export function matchBuiltinCommands(bareQuery: string): string[] {
  const query = bareQuery.toLowerCase()
  return BUILTIN_COMMANDS.filter((cmd) => cmd.slice(1).toLowerCase().startsWith(query))
}
