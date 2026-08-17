import { fs, path } from '@typora-community-plugin/core'
import { deriveSkillMeta } from './frontmatter'
import { skillRoots } from './paths'


export interface DiscoveredSkill {
  name: string
  description: string
  /** Absolute directory containing the SKILL.md file. */
  dir: string
  /** Absolute path to the SKILL.md file itself. */
  path: string
  source: 'global' | 'vault'
}

const MAX_CATALOG_SKILLS = 100

/**
 * Scan both skill roots for `<dir>/<name>/SKILL.md` entries. Vault skills are
 * scanned first and shadow global skills with the same name. Missing or empty
 * roots simply contribute nothing — a vault without `.agents/skills` behaves
 * exactly as before this feature existed.
 */
export async function discoverSkills(): Promise<DiscoveredSkill[]> {
  const found: DiscoveredSkill[] = []

  for (const root of skillRoots()) {
    let entries: string[] = []
    try {
      if (!(await fs.exists(root.dir))) continue
      // Non-recursive listing; each entry is a sibling directory or file.
      entries = await fs.list(root.dir)
    } catch {
      continue
    }

    for (const entry of entries) {
      const dir = path.join(root.dir, entry)
      let isDir = false
      try {
        isDir = await fs.isDirectory(dir)
      } catch {
        continue
      }
      if (!isDir) continue

      const skillPath = path.join(dir, 'SKILL.md')
      let exists = false
      try {
        exists = await fs.exists(skillPath)
      } catch {
        continue
      }
      if (!exists) continue

      let text: string
      try {
        text = await fs.readText(skillPath)
      } catch {
        continue
      }
      const meta = deriveSkillMeta(text, entry)
      found.push({ ...meta, dir, path: skillPath, source: root.source })
    }
  }

  // Dedupe by name: first occurrence wins, and vault roots are scanned first.
  const seen = new Set<string>()
  const unique = found.filter(skill => {
    if (seen.has(skill.name)) return false
    seen.add(skill.name)
    return true
  })
  return unique.sort((a, b) => a.name.localeCompare(b.name)).slice(0, MAX_CATALOG_SKILLS)
}

/** Look up one skill by name. Re-discovers on every call (no cache). */
export async function getSkill(name: string): Promise<DiscoveredSkill | null> {
  const skills = await discoverSkills()
  return skills.find(skill => skill.name === name) ?? null
}

/**
 * The "Available skills" block injected into the system prompt. Returns an
 * empty string when there is nothing to list, so the static prefix of the
 * prompt stays byte-identical for users without any skills (KV-cache friendly).
 */
export function buildSkillsCatalog(skills: DiscoveredSkill[]): string {
  if (!skills.length) return ''
  const lines = skills.map(skill => `- \`${skill.name}\`: ${skill.description}`)
  return [
    '## Available skills',
    '',
    'Reusable task-specific instruction sets (SKILL.md files). When the user\'s task clearly matches one of these, call `use_skill` with its exact name to load the full instructions, then follow them. Do not call use_skill preemptively for tasks that no listed skill covers.',
    '',
    ...lines,
  ].join('\n')
}
