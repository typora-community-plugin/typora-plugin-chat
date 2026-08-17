import { describe, expect, it } from 'vitest'
import { parseFrontmatter, deriveSkillMeta, stripFrontmatter } from './frontmatter'


describe('parseFrontmatter', () => {
  it('parses flat key: value pairs and keeps the body', () => {
    const text = [
      '---',
      'name: demo-skill',
      "description: A skill that says hi.",
      '---',
      '',
      '# Demo',
      '',
      'Do the thing.',
    ].join('\n')

    const parsed = parseFrontmatter(text)
    expect(parsed.meta).toEqual({
      name: 'demo-skill',
      description: 'A skill that says hi.',
    })
    expect(parsed.body).toBe('# Demo\n\nDo the thing.')
  })

  it('handles CRLF line endings', () => {
    const text = '---\r\nname: crlf\r\ndescription: wins\r\n---\r\nbody here'
    const parsed = parseFrontmatter(text)
    expect(parsed.meta).toEqual({ name: 'crlf', description: 'wins' })
    expect(parsed.body).toBe('body here')
  })

  it('returns empty meta when there is no frontmatter block', () => {
    const text = '# Just a doc\n\nNo metadata.'
    const parsed = parseFrontmatter(text)
    expect(parsed.meta).toEqual({})
    expect(parsed.body).toBe(text)
  })

  it('ignores comments, blank lines and indented (nested) keys', () => {
    const text = [
      '---',
      '# a comment',
      '',
      'name: real-name',
      'nested:',
      '  child: not-parsed',
      'quoted: "with quotes"',
      "---",
      'body',
    ].join('\n')

    const parsed = parseFrontmatter(text)
    expect(parsed.meta.name).toBe('real-name')
    expect(parsed.meta.quoted).toBe('with quotes')
    // Indented continuation lines must not create bogus keys.
    expect(Object.keys(parsed.meta)).toEqual(['name', 'quoted'])
  })

  it('does not treat a mid-file --- as frontmatter', () => {
    const text = 'intro\n---\nnot meta: true\n---\nrest'
    const parsed = parseFrontmatter(text)
    expect(parsed.meta).toEqual({})
  })
})

describe('deriveSkillMeta', () => {
  it('uses frontmatter name and description when present', () => {
    const text = '---\nname: alpha\ndescription: does alpha things\n---\nbody'
    expect(deriveSkillMeta(text, 'dir-name')).toEqual({
      name: 'alpha',
      description: 'does alpha things',
    })
  })

  it('falls back to the directory basename for a missing name', () => {
    const text = '---\ndescription: only desc\n---\nbody'
    expect(deriveSkillMeta(text, 'my-folder').name).toBe('my-folder')
  })

  it('derives description from the first paragraph when absent', () => {
    const text = '---\nname: x\n---\n# Title\n\nFirst real paragraph.\n\nSecond.'
    expect(deriveSkillMeta(text, 'x').description).toBe('First real paragraph.')
  })

  it('truncates a long fallback description', () => {
    const body = `no frontmatter here\n\n${'word '.repeat(200)}`.trim()
    const derived = deriveSkillMeta(body, 'x')
    expect(derived.description.length).toBeLessThanOrEqual(161) // 160 + ellipsis
    expect(derived.description.endsWith('…')).toBe(true)
  })

  it('returns a placeholder when nothing is derivable', () => {
    expect(deriveSkillMeta('', 'x').description).toBe('(no description)')
  })
})

describe('stripFrontmatter', () => {
  it('removes the leading frontmatter block only', () => {
    const text = '---\nname: a\n---\nbody one\n---\nnot stripped'
    expect(stripFrontmatter(text)).toBe('body one\n---\nnot stripped')
  })

  it('is a no-op without frontmatter', () => {
    expect(stripFrontmatter('plain')).toBe('plain')
  })
})
