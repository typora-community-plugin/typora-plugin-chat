import { describe, expect, it } from 'vitest'
import {
  computeSuggestions,
  MAX_SUGGESTIONS,
  shouldCompleteSubcommand,
  suggestionsShouldBeOpen,
} from './index'

const SKILLS = ['alpha', 'beta', 'gamma', 'delta-one']

describe('computeSuggestions', () => {
  it('returns [] when the value does not start with /', () => {
    expect(computeSuggestions({ skills: SKILLS, value: 'hello' })).toEqual([])
  })

  it('enters command mode for / and lists all three commands', () => {
    expect(computeSuggestions({ skills: SKILLS, value: '/' })).toEqual(['/new', '/sessions', '/skill'])
  })

  it('lists all three commands even when no skills are available', () => {
    expect(computeSuggestions({ skills: [], value: '/' })).toEqual(['/new', '/sessions', '/skill'])
  })

  it('filters commands by prefix', () => {
    expect(computeSuggestions({ skills: SKILLS, value: '/s' })).toEqual(['/sessions', '/skill'])
    expect(computeSuggestions({ skills: SKILLS, value: '/sk' })).toEqual(['/skill'])
    expect(computeSuggestions({ skills: SKILLS, value: '/n' })).toEqual(['/new'])
    expect(computeSuggestions({ skills: SKILLS, value: '/ne' })).toEqual(['/new'])
  })

  it('matches command names case-insensitively', () => {
    expect(computeSuggestions({ skills: SKILLS, value: '/NE' })).toContain('/new')
    expect(computeSuggestions({ skills: SKILLS, value: '/SES' })).toContain('/sessions')
    expect(computeSuggestions({ skills: SKILLS, value: '/SK' })).toEqual(['/skill'])
  })

  it('does not directly suggest skills in command mode', () => {
    expect(computeSuggestions({ skills: SKILLS, value: '/d' })).toEqual([])
    expect(computeSuggestions({ skills: SKILLS, value: '/al.pha' })).toEqual([])
  })

  it('returns [] when no command matches', () => {
    expect(computeSuggestions({ skills: SKILLS, value: '/zzz' })).toEqual([])
  })

  it('enters subcommand mode after /skill: and filters skills', () => {
    expect(computeSuggestions({ skills: SKILLS, value: '/skill:' })).toEqual([
      '/skill:alpha',
      '/skill:beta',
      '/skill:gamma',
      '/skill:delta-one',
    ])
    expect(computeSuggestions({ skills: SKILLS, value: '/skill:b' })).toEqual(['/skill:beta'])
  })

  it('matches skill names case-insensitively in subcommand mode', () => {
    expect(computeSuggestions({ skills: SKILLS, value: '/skill:ALP' })).toEqual(['/skill:alpha'])
    expect(computeSuggestions({ skills: SKILLS, value: '/SKILL:ALP' })).toEqual(['/skill:alpha'])
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
    const many = Array.from({ length: MAX_SUGGESTIONS + 5 }, (_, i) => `skill-${i}`)
    const result = computeSuggestions({ skills: many, value: '/skill:' })
    expect(result).toHaveLength(MAX_SUGGESTIONS)
  })
})

describe('shouldCompleteSubcommand', () => {
  it('returns true only for commands with subcommand support', () => {
    expect(shouldCompleteSubcommand('/skill')).toBe(true)
    expect(shouldCompleteSubcommand('/new')).toBe(false)
    expect(shouldCompleteSubcommand('/sessions')).toBe(false)
    expect(shouldCompleteSubcommand('/unknown')).toBe(false)
  })
})

describe('suggestionsShouldBeOpen', () => {
  it('is true only when enabled and suggestions exist', () => {
    expect(suggestionsShouldBeOpen({ skills: SKILLS, value: '/s' }, true)).toBe(true)
    expect(suggestionsShouldBeOpen({ skills: SKILLS, value: '/s' }, false)).toBe(false)
    expect(suggestionsShouldBeOpen({ skills: SKILLS, value: '' }, true)).toBe(false)
  })
})
