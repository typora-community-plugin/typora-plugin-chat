import { describe, expect, it } from 'vitest'
import {
  computeSuggestions,
  MAX_SUGGESTIONS,
  shouldCompleteSubcommand,
  suggestionsShouldBeOpen,
} from '../../src/slash-commands/index'

const SKILLS = [
  { name: 'alpha', description: 'First skill' },
  { name: 'beta', description: 'Second skill' },
  { name: 'gamma', description: '' },
  { name: 'delta-one' },
]

describe('computeSuggestions', () => {
  it('returns [] when the value does not start with /', () => {
    expect(computeSuggestions({ skills: SKILLS, value: 'hello' })).toEqual([])
  })

  it('enters command mode for / and lists all built-in commands', () => {
    const result = computeSuggestions({ skills: SKILLS, value: '/' })
    expect(result.map(s => s.text)).toEqual(['/new', '/sessions', '/skill', '/undo', '/redo'])
  })

  it('lists all commands even when no skills are available', () => {
    const result = computeSuggestions({ skills: [], value: '/' })
    expect(result.map(s => s.text)).toEqual(['/new', '/sessions', '/skill', '/undo', '/redo'])
  })

  it('filters commands by prefix', () => {
    expect(computeSuggestions({ skills: SKILLS, value: '/s' }).map(s => s.text)).toEqual(['/sessions', '/skill'])
    expect(computeSuggestions({ skills: SKILLS, value: '/sk' }).map(s => s.text)).toEqual(['/skill'])
    expect(computeSuggestions({ skills: SKILLS, value: '/n' }).map(s => s.text)).toEqual(['/new'])
    expect(computeSuggestions({ skills: SKILLS, value: '/ne' }).map(s => s.text)).toEqual(['/new'])
    expect(computeSuggestions({ skills: SKILLS, value: '/u' }).map(s => s.text)).toEqual(['/undo'])
    expect(computeSuggestions({ skills: SKILLS, value: '/r' }).map(s => s.text)).toEqual(['/redo'])
  })

  it('matches command names case-insensitively', () => {
    const ne = computeSuggestions({ skills: SKILLS, value: '/NE' })
    expect(ne.map(s => s.text)).toContain('/new')
    const ses = computeSuggestions({ skills: SKILLS, value: '/SES' })
    expect(ses.map(s => s.text)).toContain('/sessions')
    expect(computeSuggestions({ skills: SKILLS, value: '/SK' }).map(s => s.text)).toEqual(['/skill'])
  })

  it('does not directly suggest skills in command mode', () => {
    expect(computeSuggestions({ skills: SKILLS, value: '/d' })).toEqual([])
    expect(computeSuggestions({ skills: SKILLS, value: '/al.pha' })).toEqual([])
  })

  it('returns [] when no command matches', () => {
    expect(computeSuggestions({ skills: SKILLS, value: '/zzz' })).toEqual([])
  })

  it('enters subcommand mode after /skill: and filters skills', () => {
    const all = computeSuggestions({ skills: SKILLS, value: '/skill:' })
    expect(all.map(s => s.text)).toEqual([
      '/skill:alpha',
      '/skill:beta',
      '/skill:gamma',
      '/skill:delta-one',
    ])
    expect(computeSuggestions({ skills: SKILLS, value: '/skill:b' }).map(s => s.text)).toEqual(['/skill:beta'])
  })

  it('matches skill names case-insensitively in subcommand mode', () => {
    expect(computeSuggestions({ skills: SKILLS, value: '/skill:ALP' }).map(s => s.text)).toEqual(['/skill:alpha'])
    expect(computeSuggestions({ skills: SKILLS, value: '/SKILL:ALP' }).map(s => s.text)).toEqual(['/skill:alpha'])
  })

  it('returns [] for commands without subcommands', () => {
    expect(computeSuggestions({ skills: SKILLS, value: '/new:' })).toEqual([])
    expect(computeSuggestions({ skills: SKILLS, value: '/sessions:' })).toEqual([])
  })

  it('requires the command name before the colon to match exactly', () => {
    expect(computeSuggestions({ skills: SKILLS, value: '/sk:b' })).toEqual([])
    expect(computeSuggestions({ skills: SKILLS, value: '/unknown:x' })).toEqual([])
  })

  it('closes suggestions when whitespace appears after the first token', () => {
    expect(computeSuggestions({ skills: SKILLS, value: '/new ' })).toEqual([])
    expect(computeSuggestions({ skills: SKILLS, value: '/new x' })).toEqual([])
    expect(computeSuggestions({ skills: SKILLS, value: '/skill: ' })).toEqual([])
    expect(computeSuggestions({ skills: SKILLS, value: '/skill:beta extra' })).toEqual([])
  })

  it('caps the number of suggestions at MAX_SUGGESTIONS', () => {
    const many = Array.from({ length: MAX_SUGGESTIONS + 5 }, (_, i) => ({ name: `skill-${i}` }))
    const result = computeSuggestions({ skills: many, value: '/skill:' })
    expect(result).toHaveLength(MAX_SUGGESTIONS)
  })

  it('built-in commands have description field (empty when i18n not initialized)', () => {
    const cmds = computeSuggestions({ skills: SKILLS, value: '/' })
    for (const s of cmds) {
      expect(s.description).toBeDefined()
    }
  })

  it('skill suggestions carry description from SkillRef', () => {
    const result = computeSuggestions({ skills: SKILLS, value: '/skill:' })
    expect(result[0]!.description).toBe('First skill')
    expect(result[1]!.description).toBe('Second skill')
    expect(result[2]!.description).toBeUndefined()
    expect(result[3]!.text).toBe('/skill:delta-one')
  })

  it('skill with empty string description omits the field', () => {
    const result = computeSuggestions({ skills: SKILLS, value: '/skill:g' })
    expect(result[0]!.description).toBeUndefined()
  })
})

describe('shouldCompleteSubcommand', () => {
  it('returns true only for commands with subcommand support', () => {
    expect(shouldCompleteSubcommand('/skill')).toBe(true)
    expect(shouldCompleteSubcommand('/new')).toBe(false)
    expect(shouldCompleteSubcommand('/sessions')).toBe(false)
    expect(shouldCompleteSubcommand('/unknown')).toBe(false)
  })

  it('accepts Suggestion objects', () => {
    expect(shouldCompleteSubcommand({ text: '/skill' })).toBe(true)
    expect(shouldCompleteSubcommand({ text: '/new' })).toBe(false)
    expect(shouldCompleteSubcommand({ text: '/skill', description: 'Invoke a skill by name' })).toBe(true)
  })
})

describe('suggestionsShouldBeOpen', () => {
  it('is true only when enabled and suggestions exist', () => {
    expect(suggestionsShouldBeOpen({ skills: SKILLS, value: '/s' }, true)).toBe(true)
    expect(suggestionsShouldBeOpen({ skills: SKILLS, value: '/s' }, false)).toBe(false)
    expect(suggestionsShouldBeOpen({ skills: SKILLS, value: '' }, true)).toBe(false)
  })
})
