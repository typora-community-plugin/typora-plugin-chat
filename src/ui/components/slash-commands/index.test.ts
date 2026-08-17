import { describe, expect, it } from 'vitest'
import { computeSuggestions, MAX_SUGGESTIONS, suggestionsShouldBeOpen } from './index'

const SKILLS = ['alpha', 'beta', 'gamma', 'delta-one']

describe('computeSuggestions', () => {
  it('returns [] when no skills are available', () => {
    expect(computeSuggestions({ skills: [], value: '/a' })).toEqual([])
  })

  it('returns [] when the value does not start with /', () => {
    expect(computeSuggestions({ skills: SKILLS, value: 'hello' })).toEqual([])
  })

  it('suggests all skills plus the built-in commands when only / is typed', () => {
    const result = computeSuggestions({ skills: SKILLS, value: '/' })
    expect(result).toEqual(['/new', '/sessions', '/skill:alpha', '/skill:beta', '/skill:gamma', '/skill:delta-one'])
  })

  it('suggests matching skills for a bare /name prefix (plus built-ins that match)', () => {
    const result = computeSuggestions({ skills: SKILLS, value: '/d' })
    expect(result).toEqual(['/skill:delta-one'])
  })

  it('accepts the explicit /skill:name form', () => {
    const result = computeSuggestions({ skills: SKILLS, value: '/skill:b' })
    expect(result).toEqual(['/skill:beta'])
  })

  it('matches skill names case-insensitively', () => {
    const result = computeSuggestions({ skills: SKILLS, value: '/ALP' })
    expect(result).toEqual(['/skill:alpha'])
  })

  it('stops suggesting once a whitespace appears after the first token', () => {
    expect(computeSuggestions({ skills: SKILLS, value: '/alpha extra text' })).toEqual([])
    expect(computeSuggestions({ skills: SKILLS, value: '/alpha ' })).toEqual([])
    expect(computeSuggestions({ skills: SKILLS, value: '/skill:beta extra text' })).toEqual([])
  })

  it('keeps suggesting all skills when /skill: is followed by a space', () => {
    const result = computeSuggestions({ skills: SKILLS, value: '/skill: ' })
    expect(result).toEqual(['/skill:alpha', '/skill:beta', '/skill:gamma', '/skill:delta-one'])
  })

  it('stops suggesting when the bare token contains characters that cannot match a skill name', () => {
    expect(computeSuggestions({ skills: SKILLS, value: '/al.pha' })).toEqual([])
  })

  it('caps the number of suggestions at MAX_SUGGESTIONS', () => {
    const many = Array.from({ length: MAX_SUGGESTIONS + 5 }, (_, i) => `skill-${i}`)
    const result = computeSuggestions({ skills: many, value: '/s' })
    expect(result).toHaveLength(MAX_SUGGESTIONS)
  })

  it('returns [] when there are no matching skills and no built-in matches', () => {
    expect(computeSuggestions({ skills: SKILLS, value: '/zzz' })).toEqual([])
  })

  describe('/new built-in command', () => {
    it('appears in suggestions for a bare / and is first in the list', () => {
      const result = computeSuggestions({ skills: SKILLS, value: '/' })
      expect(result[0]).toBe('/new')
      expect(result.slice(1)).toEqual(['/sessions', '/skill:alpha', '/skill:beta', '/skill:gamma', '/skill:delta-one'])
    })

    it('appears when the query is a prefix of /new', () => {
      const result = computeSuggestions({ skills: SKILLS, value: '/n' })
      expect(result[0]).toBe('/new')
    })

    it('is matched case-insensitively like skill names', () => {
      expect(computeSuggestions({ skills: SKILLS, value: '/ne' })).toEqual(['/new'])
      expect(computeSuggestions({ skills: SKILLS, value: '/NE' })).toContain('/new')
    })

    it('does not suggest /new after a space or further text in the same token', () => {
      expect(computeSuggestions({ skills: SKILLS, value: '/new ' })).toEqual([])
      expect(computeSuggestions({ skills: SKILLS, value: '/new x' })).toEqual([])
    })

    it('is included within the MAX_SUGGESTIONS cap along with skill suggestions', () => {
      const many = Array.from({ length: MAX_SUGGESTIONS + 5 }, (_, i) => `skill-${i}`)
      const result = computeSuggestions({ skills: many, value: '/' })
      expect(result).toHaveLength(MAX_SUGGESTIONS)
      expect(result[0]).toBe('/new')
    })

    it('appears even when no skills are available', () => {
      const result = computeSuggestions({ skills: [], value: '/n' })
      expect(result).toEqual(['/new'])
    })
  })

  describe('/sessions built-in command', () => {
    it('appears in suggestions for a bare /', () => {
      const result = computeSuggestions({ skills: SKILLS, value: '/' })
      expect(result).toContain('/sessions')
    })

    it('appears when the query is a prefix of /sessions', () => {
      expect(computeSuggestions({ skills: SKILLS, value: '/s' })).toEqual(['/sessions'])
      expect(computeSuggestions({ skills: SKILLS, value: '/se' })).toEqual(['/sessions'])
      expect(computeSuggestions({ skills: SKILLS, value: '/SES' })).toContain('/sessions')
    })

    it('does not suggest /sessions after a space or further text in the same token', () => {
      expect(computeSuggestions({ skills: SKILLS, value: '/sessions ' })).toEqual([])
      expect(computeSuggestions({ skills: SKILLS, value: '/sessions x' })).toEqual([])
    })

    it('appears even when no skills are available', () => {
      const result = computeSuggestions({ skills: [], value: '/s' })
      expect(result).toEqual(['/sessions'])
    })
  })
})

describe('suggestionsShouldBeOpen', () => {
  it('is true only when enabled and suggestions exist', () => {
    expect(suggestionsShouldBeOpen({ skills: SKILLS, value: '/a' }, true)).toBe(true)
    expect(suggestionsShouldBeOpen({ skills: SKILLS, value: '/a' }, false)).toBe(false)
    expect(suggestionsShouldBeOpen({ skills: SKILLS, value: '' }, true)).toBe(false)
  })
})
