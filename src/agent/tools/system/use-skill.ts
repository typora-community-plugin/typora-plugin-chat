import { fs } from '@typora-community-plugin/core'
import type { ToolDefinition, ToolResult, ToolSummary } from '@/config/types'
import { discoverSkills, getSkill } from '@/agent/skills/index'
import { stripFrontmatter } from '@/agent/skills/frontmatter'


export const useSkillSchema: ToolDefinition = {
  name: 'use_skill',
  description:
    "Load the full instructions of a known skill by its exact name (from the \"Available skills\" list). Call this when an available skill matches the user's task; follow the returned instructions for the current turn.",
  parameters: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: "Skill name exactly as listed in \"Available skills\".",
      },
    },
    required: ['name'],
  },
}

export const summarizeUseSkill: ToolSummary = (input) => {
  const name = input.name
  return typeof name === 'string' && name ? name : '(no name)'
}

/**
 * Return the SKILL.md body for a named skill. Frontmatter is stripped so the
 * model sees only instructions; a header tells it which skill this is and
 * where its auxiliary files live (readable via read_file if referenced).
 */
export async function executeUseSkill(input: Record<string, unknown>): Promise<ToolResult> {
  const name = typeof input.name === 'string' ? input.name.trim() : ''
  if (!name) return { content: 'use_skill failed: name is required', isError: true }

  const skill = await getSkill(name)
  if (!skill) {
    const all = await discoverSkills()
    const names = all.length
      ? all.map(s => `- ${s.name}`).join('\n')
      : '(no skills found — the skill directories are empty or do not exist)'
    return { content: `use_skill failed: unknown skill "${name}".\n\nAvailable:\n${names}`, isError: true }
  }

  let text: string
  try {
    text = await fs.readText(skill.path)
  } catch (error: any) {
    return { content: `use_skill failed reading ${skill.path}: ${error.message || error}`, isError: true }
  }

  const body = stripFrontmatter(text).trim()
  if (!body) {
    return { content: `Skill "${skill.name}" has an empty instruction body.`, isError: true }
  }
  return {
    content:
      `[Skill "${skill.name}" — follow these instructions for the current task.\n` +
      `Auxiliary files live under ${skill.dir}; read them with read_file if referenced below.]\n\n` +
      body,
  }
}
