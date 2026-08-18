/**
 * The `/skill` slash command — suggests discovered skills for invocation and
 * inlines a skill's instructions into the next turn. No Svelte dependencies,
 * so it is easy to unit test and can be reused by any component that needs
 * skill suggestions or explicit skill invocations.
 */

import { fs } from '@typora-community-plugin/core'
import { getSkill } from '@/agent/skills/index'
import { stripFrontmatter } from '@/agent/skills/frontmatter'
import { chatStore } from '@/store/chat-store'
import type { SlashCommand, SlashCommandContext } from './types'

const SKILL_NAME = 'skill'
const SKILL_COMMAND = '/skill'
const SKILL_SUBCOMMAND_PREFIX = '/skill:'

function filterSkills(skills: string[], query: string): string[] {
  return skills.filter((name) => name.toLowerCase().startsWith(query.toLowerCase()))
}

/**
 * Entry point for an explicit `/skill:<name>` invocation. The transcript shows
 * the original command line; internally the skill body is inlined as an
 * instruction prefix so the model follows it for this turn regardless of
 * whether it would have called use_skill on its own.
 */
export async function invokeSkill(
  skillName: string,
  rest: string,
  runTurn: (options: { displayText: string; expandedMessage: string | null }) => Promise<void>,
): Promise<void> {
  const displayText = `/skill:${skillName}${rest ? ` ${rest}` : ''}`

  let skill
  try {
    skill = await getSkill(skillName)
  } catch {
    /* fall through to error below */
  }
  if (!skill) {
    chatStore.addUserMessage(displayText, null)
    const callId = chatStore.addToolCall('use_skill', { name: skillName })
    chatStore.updateToolResult(callId, { content: `Unknown skill "${skillName}".`, isError: true }, true)
    return
  }

  let body = ''
  try {
    const text = await fs.readText(skill.path)
    body = stripFrontmatter(text).trim()
  } catch (error: any) {
    chatStore.addUserMessage(displayText, null)
    chatStore.addError(`Failed to read skill "${skillName}": ${error.message || error}`)
    return
  }

  const expandedMessage =
    `Follow the instructions of the skill "${skill.name}" for this turn. ` +
    `Auxiliary files live under ${skill.dir}; read them if referenced.\n\n` +
    `${body}\n\n` +
    (rest.trim() ? `User request: ${rest.trim()}` : 'Apply the skill to the current context.')

  await runTurn({ displayText, expandedMessage })
}

/** The `/skill` built-in command: invoke a discovered skill. */
export const skillCommand: SlashCommand = {
  name: SKILL_NAME,
  command: SKILL_COMMAND,
  subcommandPrefix: SKILL_SUBCOMMAND_PREFIX,
  hasSubcommands: true,
  suggestSubcommands: (query: string, { skills }: SlashCommandContext): string[] =>
    filterSkills(skills, query).map((name) => `${SKILL_SUBCOMMAND_PREFIX}${name}`),
  callback: async (subcommand, rest, context) => {
    if (!subcommand || !context.runTurn) return
    await invokeSkill(subcommand, rest.trim(), context.runTurn)
  },
}
