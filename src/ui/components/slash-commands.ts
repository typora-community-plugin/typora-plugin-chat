/**
 * Slash-command (`/skill:`) autocomplete logic for the input bar.
 * Pure helpers — no Svelte dependencies, so they are easy to unit test and can
 * be reused by any component that needs skill suggestions.
 */

export interface SlashCommandOptions {
  /** Discovered skill names used as suggestion candidates. */
  skills: string[]
  /** Raw textarea value. */
  value: string
}

/** Maximum number of suggestions rendered at once. */
export const MAX_SUGGESTIONS = 8

const SKILL_PREFIX = '/skill:'
const BARE_TOKEN_RE = /^\/[A-Za-z0-9_-]*$/

/** Extract the skill-name prefix from the first token, or null if not a valid slash command. */
function extractPrefix(value: string): string | null {
  const firstToken = value.split(/\s/)[0]
  if (/\s/.test(firstToken)) return null
  if (/^\/skill:/.test(firstToken)) return firstToken.slice(SKILL_PREFIX.length)
  if (!BARE_TOKEN_RE.test(firstToken)) return null
  return firstToken.slice(1)
}

/**
 * Compute the list of `/skill:<name>` suggestions for the current input value.
 * Suggestions are only produced while typing the first token (no whitespace yet).
 * Both bare `/name` and explicit `/skill:name` prefixes are accepted.
 */
export function computeSuggestions({ skills, value }: Pick<SlashCommandOptions, 'skills' | 'value'>): string[] {
  if (!skills.length || !value.startsWith('/')) return []

  const prefix = extractPrefix(value)
  if (prefix === null) return []

  const lower = prefix.toLowerCase()
  const matches = skills.filter((name) => name.toLowerCase().startsWith(lower))
  return matches.slice(0, MAX_SUGGESTIONS).map((name) => `${SKILL_PREFIX}${name}`)
}

/** Whether the suggestion list should be open for the given state. */
export function suggestionsShouldBeOpen({ skills, value }: SlashCommandOptions, enabled: boolean): boolean {
  return enabled && computeSuggestions({ skills, value }).length > 0
}
