/**
 * Slash-command executor for the main send path.
 *
 * Given raw input text, finds a matching command in `SLASH_COMMANDS` and
 * delegates to its `callback`. If no built-in command matches, falls through
 * to `callbacks.onSend`.
 */

import { SLASH_COMMANDS } from './index'
import type { SlashCommandContext } from './types'

export interface ExecuteSlashCommandOptions {
  /** Discovered skill names used as suggestion candidates. */
  skills: string[]
  /** Sends raw text to the agent loop; `/new` uses it for an optional seed message. */
  onSend?: (text: string) => void
  /** Runs one chat turn; `/skill:<name> [rest]` inlines the skill into it. */
  runTurn: (options: { displayText: string; expandedMessage: string | null }) => Promise<void>
}

/**
 * Parse and execute a slash command from user input.
 * If no built-in command matches, falls through to `options.onSend`.
 */
export async function executeSlashCommand(
  text: string,
  options: ExecuteSlashCommandOptions,
): Promise<void> {
  const context: SlashCommandContext = {
    skills: options.skills,
    onSend: options.onSend,
    runTurn: options.runTurn,
  }

  for (const cmd of SLASH_COMMANDS) {
    if (!cmd.callback) continue

    let subcommand = ''
    let rest = ''

    if (cmd.hasSubcommands) {
      // Match `/name:<subcommand> [rest]`
      const match = text.match(new RegExp(`^${cmd.subcommandPrefix}([A-Za-z0-9_-]+)\\s*([\\s\\S]*)$`, 'i'))
      if (match) {
        subcommand = match[1]!
        rest = match[2] ?? ''
      } else {
        continue
      }
    } else if (cmd.takesRest) {
      // Match `/name [rest]` — command plus optional trailing text.
      const match = text.match(new RegExp(`^${cmd.command}(?:\\s+([\\s\\S]*))?$`))
      if (!match) continue
      rest = (match[1] ?? '').trim()
    } else {
      // Match `/name` exactly — any trailing text means it is NOT this command.
      const match = text.match(new RegExp(`^${cmd.command}\\s*$`))
      if (!match) continue
    }

    await cmd.callback(subcommand, rest, context)
    return
  }

  // Fallback: not a slash command — send to the agent loop.
  if (options.onSend) {
    options.onSend(text)
  }
}
