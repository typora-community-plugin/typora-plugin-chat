/**
 * The `/skill` slash command — suggests discovered skills for invocation.
 * Pure helpers — no Svelte dependencies, so they are easy to unit test and can
 * be reused by any component that needs skill suggestions.
 */

import type { SlashCommand, SlashCommandContext } from './types'

const SKILL_NAME = 'skill'
const SKILL_COMMAND = '/skill'
const SKILL_SUBCOMMAND_PREFIX = '/skill:'

function filterSkills(skills: string[], query: string): string[] {
  return skills.filter((name) => name.toLowerCase().startsWith(query.toLowerCase()))
}

/** The `/skill` built-in command: invoke a discovered skill. */
export const skillCommand: SlashCommand = {
  name: SKILL_NAME,
  command: SKILL_COMMAND,
  subcommandPrefix: SKILL_SUBCOMMAND_PREFIX,
  hasSubcommands: true,
  suggestSubcommands: (query: string, { skills }: SlashCommandContext): string[] =>
    filterSkills(skills, query).map((name) => `${SKILL_SUBCOMMAND_PREFIX}${name}`),
}
