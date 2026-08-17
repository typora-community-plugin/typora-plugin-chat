/**
 * Slash-command autocomplete logic for the input bar.
 * Pure helpers — no Svelte dependencies, so they are easy to unit test and can
 * be reused by any component that needs skill suggestions or built-in commands.
 */

export interface SlashCommandOptions {
  /** Discovered skill names used as suggestion candidates. */
  skills: string[]
  /** Raw textarea value. */
  value: string
}

/** Maximum number of suggestions rendered at once (built-in commands included). */
export const MAX_SUGGESTIONS = 8

const SKILL_PREFIX = '/skill:'
/** Built-in slash commands that are not skill invocations, e.g. `/new`. */
const BUILTIN_COMMANDS = ['/new']
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
 * Compute the list of suggestions for the current input value.
 * A bare `/` or partial first token suggests skill entries as `/skill:<name>` plus any
 * built-in slash command whose full form starts with that query, and an explicit
 * `/skill:` prefix filters skills after that marker. Whitespace immediately after a
 * bare slash command stops suggesting; whitespace after the exact `/skill:` prefix keeps it open.
 */
export function computeSuggestions({ skills, value }: Pick<SlashCommandOptions, 'skills' | 'value'>): string[] {
  if (!value.startsWith('/')) return []

  let builtins: string[] = []
  let skillQuery: string | null = null

  if (value.startsWith(SKILL_PREFIX)) {
    const rest = value.slice(SKILL_PREFIX.length)
    // A space immediately after the exact `/skill:` prefix still suggests all skills;
    // any other whitespace closes the list.
    skillQuery = /^\s/.test(rest) ? '' : rest
  } else if (value === SKILL_PREFIX) {
    // Exact marker, no query yet — suggest every skill.
    skillQuery = ''
  } else {
    const bare = getBareSlashToken(value)
    if (bare === null) return []
    builtins = BUILTIN_COMMANDS.filter((cmd) => cmd.startsWith(bare))
    // A skill name may not start with `skill:`; treat that as a no-match for skills.
    skillQuery = bare.toLowerCase() === 'skill:' ? '' : bare
  }

  const skillSuggestions = filterSkills(skills, skillQuery).map((name) => `${SKILL_PREFIX}${name}`)
  return [...builtins, ...skillSuggestions].slice(0, MAX_SUGGESTIONS)
}

/** Whether the suggestion list should be open for the given state. */
export function suggestionsShouldBeOpen({ skills, value }: SlashCommandOptions, enabled: boolean): boolean {
  return enabled && computeSuggestions({ skills, value }).length > 0
}
