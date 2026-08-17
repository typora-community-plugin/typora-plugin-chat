import { beforeEach, describe, expect, it, vi } from 'vitest'
import { executeUseSkill } from '../../src/tools/system/use-skill'
import { mockFs } from '../setup'


/**
 * A minimal in-memory vault layout for skill discovery:
 *
 *   /vault/.agents/skills/<name>/SKILL.md  (vault root, higher precedence)
 *   /home/.agents/skills/<name>/SKILL.md   (global root, via os.homedir())
 */

const VAULT_ROOT = '/vault/.agents/skills'
const GLOBAL_ROOT = '/home/.agents/skills'

let skills: Record<string, string> // absolute path -> file content

function mockSkillFs() {
  const dirOf = (p: string) => p.slice(0, p.lastIndexOf('/'))
  const entriesUnder = (dir: string): string[] => {
    const prefix = `${dir}/`
    const names = new Set<string>()
    for (const path of Object.keys(skills)) {
      if (!path.startsWith(prefix)) continue
      const rest = path.slice(prefix.length)
      if (!rest.includes('/')) names.add(rest) // file at this level
      else names.add(rest.split('/')[0])       // directory with children
    }
    return [...names]
  }

  vi.mocked(mockFs.exists).mockImplementation(async (p: string) => p in skills || entriesUnder(p as string).length > 0)
  vi.mocked(mockFs.isDirectory).mockImplementation(async (p: string) => !(p in skills))
  vi.mocked(mockFs.list).mockImplementation(async (dir: string) => Promise.resolve(entriesUnder(dir)))
  vi.mocked(mockFs.readText).mockImplementation(async (p: string) => {
    if (!(p in skills)) throw new Error(`ENOENT ${p}`)
    return skills[p]
  })

  // Keep the dirOf helper referenced so TS does not consider it unused.
  void dirOf
}

beforeEach(() => {
  vi.mocked(mockFs.exists).mockReset()
  vi.mocked(mockFs.isDirectory).mockReset()
  vi.mocked(mockFs.list).mockReset()
  vi.mocked(mockFs.readText).mockReset()
})

describe('use_skill', () => {
  it('returns the stripped instruction body for a known skill', async () => {
    skills = {
      [`${VAULT_ROOT}/demo/SKILL.md`]: '---\nname: demo\ndescription: A demo\n---\n# Demo\n\nStep one.\n',
    }
    mockSkillFs()

    const result = await executeUseSkill({ name: 'demo' })

    expect(result.isError).toBeFalsy()
    expect(result.content).toContain('[Skill "demo" — follow these instructions')
    expect(result.content).toContain('Step one.')
    expect(result.content).not.toContain('name: demo') // frontmatter stripped
  })

  it('reports unknown skills with the available list', async () => {
    skills = { [`${VAULT_ROOT}/demo/SKILL.md`]: '---\nname: demo\n---\nbody' }
    mockSkillFs()

    const result = await executeUseSkill({ name: 'missing' })

    expect(result.isError).toBe(true)
    expect(result.content).toContain('unknown skill "missing"')
    expect(result.content).toContain('- demo')
  })

  it('reports the empty-directory case when no skills exist', async () => {
    skills = {}
    mockSkillFs()

    const result = await executeUseSkill({ name: 'anything' })

    expect(result.isError).toBe(true)
    expect(result.content).toContain('(no skills found')
  })

  it('requires a non-empty name', async () => {
    skills = {}
    mockSkillFs()

    const result = await executeUseSkill({ name: '   ' })

    expect(result.isError).toBe(true)
    expect(result.content).toContain('name is required')
  })
})
