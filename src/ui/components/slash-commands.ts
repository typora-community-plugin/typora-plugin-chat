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
/** Bare first tokens may contain `/` plus any characters except whitespace. */
const BARE_TOKEN_RE = /^\/\S*$/

function filterSkills(skills: string[], query: string): string[] {
  return skills.filter((name) => name.toLowerCase().startsWith(query.toLowerCase()))
}

/** Returns the first token when it is a bare slash command without a following space. */
function getBareSlashToken(value: string): string | null {
  const firstToken = value.split(/\s/)[0] ?? ''
  if (!BARE_TOKEN_RE.test(firstToken)) return null
  if (value.length > firstToken.length) return null
  return firstToken.slice(1)
}

/**
 * Compute the list of `/skill:<name>` suggestions for the current input value.
 * A bare `/` or partial first token suggests skill entries as `/skill:<name>`, and an
 * explicit `/skill:` prefix filters after that marker. Whitespace immediately after a
 * bare slash command stops suggesting; whitespace after the exact `/skill:` prefix keeps it open.
 */
export function computeSuggestions({ skills, value }: Pick<SlashCommandOptions, 'skills' | 'value'>): string[] {
  if (!skills.length || !value.startsWith('/')) return []

  let query: string | null = null

  if (value.startsWith(SKILL_PREFIX)) {
    const rest = value.slice(SKILL_PREFIX.length)
    // A space immediately after the exact `/skill:` prefix still suggests all skills;
    // any other whitespace closes the list.
    query = /^\s/.test(rest) ? '' : rest
  } else {
    query = getBareSlashToken(value)
  }

  if (query === null) return []

  return filterSkills(skills, query).slice(0, MAX_SUGGESTIONS).map((name) => `${SKILL_PREFIX}${name}`)
}

/** Whether the suggestion list should be open for the given state. */
export function suggestionsShouldBeOpen({ skills, value }: SlashCommandOptions, enabled: boolean): boolean {
  return enabled && computeSuggestions({ skills, value }).length > 0
}
