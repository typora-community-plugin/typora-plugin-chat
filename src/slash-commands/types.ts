/**
 * Shared types for slash-command autocomplete.
 *
 * Every command is represented by the same `SlashCommand` shape, so the
 * command-mode and subcommand-mode parsing in `index.ts` stays generic.
 */

export interface SlashCommandContext {
  /** Discovered skill names used as suggestion candidates. */
  skills: string[]
}

export interface SlashCommand {
  /** Command name without the leading slash, e.g. `skill`. */
  readonly name: string
  /** Full command as shown in command mode, e.g. `/skill`. */
  readonly command: string
  /** Prefix that starts subcommand mode, e.g. `/skill:`. */
  readonly subcommandPrefix: string
  /** Whether picking this command should continue into subcommand mode. */
  readonly hasSubcommands: boolean
  /**
   * Returns subcommand suggestions for `/name:<query>`, rendered in their
   * full form (e.g. `/skill:<name>`).
   */
  readonly suggestSubcommands: (query: string, context: SlashCommandContext) => string[]
}
