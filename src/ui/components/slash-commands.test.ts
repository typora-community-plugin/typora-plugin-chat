import { describe, expect, it } from 'vitest'
import { computeSuggestions, MAX_SUGGESTIONS, suggestionsShouldBeOpen } from './slash-commands'

const SKILLS = ['alpha', 'beta', 'gamma', 'delta-one']

describe('computeSuggestions', () => {
  it('returns [] when no skills are available', () => {
    expect(computeSuggestions({ skills: [], value: '/a' })).toEqual([])
  })

  it('returns [] when the value does not start with /', () => {
    expect(computeSuggestions({ skills: SKILLS, value: 'hello' })).toEqual([])
  })

  it('suggests all skills when only / is typed', () => {
    const result = computeSuggestions({ skills: SKILLS, value: '/' })
    expect(result).toEqual(['/skill:alpha', '/skill:beta', '/skill:gamma', '/skill:delta-one'])
  })

  it('suggests matching skills for a bare /name prefix', () => {
    const result = computeSuggestions({ skills: SKILLS, value: '/d' })
    expect(result).toEqual(['/skill:delta-one'])
  })

  it('accepts the explicit /skill:name form', () => {
    const result = computeSuggestions({ skills: SKILLS, value: '/skill:b' })
    expect(result).toEqual(['/skill:beta'])
  })

  it('matches case-insensitively', () => {
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

  it('returns [] when there are no matching skills', () => {
    expect(computeSuggestions({ skills: SKILLS, value: '/zzz' })).toEqual([])
  })
})

describe('suggestionsShouldBeOpen', () => {
  it('is true only when enabled and suggestions exist', () => {
    expect(suggestionsShouldBeOpen({ skills: SKILLS, value: '/a' }, true)).toBe(true)
    expect(suggestionsShouldBeOpen({ skills: SKILLS, value: '/a' }, false)).toBe(false)
    expect(suggestionsShouldBeOpen({ skills: SKILLS, value: '' }, true)).toBe(false)
  })
})
