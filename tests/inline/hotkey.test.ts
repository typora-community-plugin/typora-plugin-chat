import { describe, expect, it } from 'vitest'
import { eventHotkey, needsKeydownFallback, normalizeHotkey } from '../../src/inline/hotkey'

const ev = (key: string, mods: Partial<Record<'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey', boolean>> = {}) =>
  ({ key, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, ...mods })

describe('hotkey helpers', () => {
  it('normalizes core-style hotkey strings', () => {
    expect(normalizeHotkey('Cmd+J')).toBe('meta+j')
    expect(normalizeHotkey('Shift+Cmd+K')).toBe('meta+shift+k')
    expect(normalizeHotkey('Ctrl+Alt+J')).toBe('ctrl+alt+j')
    expect(normalizeHotkey('Option+Command+J')).toBe('meta+alt+j')
  })

  it('maps keyboard events to the same form', () => {
    expect(eventHotkey(ev('j', { metaKey: true }))).toBe('meta+j')
    expect(eventHotkey(ev('J', { metaKey: true, shiftKey: true }))).toBe('meta+shift+j')
    expect(eventHotkey(ev('Meta', { metaKey: true }))).toBe('')
  })

  it('matches a remapped binding', () => {
    expect(eventHotkey(ev('k', { metaKey: true, shiftKey: true }))).toBe(normalizeHotkey('Cmd+Shift+K'))
  })

  it('needs the keydown fallback only for ⌘ bindings on macOS', () => {
    expect(needsKeydownFallback('Cmd+J', true)).toBe(true)
    expect(needsKeydownFallback('Ctrl+J', true)).toBe(false)
    expect(needsKeydownFallback('Cmd+J', false)).toBe(false)
    expect(needsKeydownFallback(null, true)).toBe(false)
  })
})
