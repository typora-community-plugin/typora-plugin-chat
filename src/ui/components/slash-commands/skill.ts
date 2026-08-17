/**
 * The `/skill:` slash command — suggests discovered skills for invocation.
 * Pure helpers — no Svelte dependencies, so they are easy to unit test and can
 * be reused by any component that needs skill suggestions.
 */

/** The `/skill:` prefix used to invoke a discovered skill. */
export const SKILL_PREFIX = '/skill:'

function filterSkills(skills: string[], query: string): string[] {
  return skills.filter((name) => name.toLowerCase().startsWith(query.toLowerCase()))
}

/**
 * Suggestions for the `/skill:` command: every skill whose name starts with
 * `query` (case-insensitive), rendered as `/skill:<name>`. A `null` or empty
 * query matches every skill.
 */
export function skillSuggestions(skills: string[], query: string | null): string[] {
  return filterSkills(skills, query ?? '').map((name) => `${SKILL_PREFIX}${name}`)
}
