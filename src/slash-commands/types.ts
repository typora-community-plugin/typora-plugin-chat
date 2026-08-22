/**
 * Shared types for slash-command autocomplete.
 *
 * Every command is represented by the same `SlashCommand` shape, so the
 * command-mode and subcommand-mode parsing in `index.ts` stays generic.
 */

export interface Suggestion {
  /** The full suggestion text, e.g. `/new`, `/skill:alpha`. */
  readonly text: string
  /** Short description shown beneath the command in the suggestion list. May be absent for skills without a frontmatter description. */
  readonly description?: string
}

export interface SkillRef {
  /** Display name of the skill. */
  readonly name: string
  /** One-line description from SKILL.md frontmatter. */
  readonly description?: string
}

export interface SlashCommandContext {
  /** Discovered skills — carries name and optional description for suggestion rendering. */
  skills: SkillRef[]
  /** Sends raw text to the agent loop; `/new` uses it for an optional seed message. */
  onSend?: (text: string) => void
  /** Runs one chat turn; `/skill:<name> [rest]` inlines the skill into it. Optional — only set by the executor. */
  runTurn?: (options: { displayText: string; expandedMessage: string | null }) => Promise<void>
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
  /** Short description shown in the suggestion list for built-in commands (i18n text). */
  readonly description?: () => string
  /**
   * When `true` the command accepts free-form trailing text after it
   * (e.g. `/new hello world`). When `false` only the bare command matches
   * (e.g. `/undo` — any extra text means it is NOT this command).
   */
  readonly takesRest?: boolean
  /**
   * Returns subcommand suggestions for `/name:<query>`, rendered in their
   * full form (e.g. `/skill:<name>`), each carrying an optional description.
   */
  readonly suggestSubcommands: (query: string, context: SlashCommandContext) => Suggestion[]
  /**
   * Called when the user submits this command.
   * For commands with subcommands (`hasSubcommands: true`), `subcommand` is the
   * token after the colon and `rest` is any trailing text.
   * For simple commands, `subcommand` is empty and `rest` holds all remaining text.
   */
  callback?: (subcommand: string, rest: string, context: SlashCommandContext) => void | Promise<void>
}
