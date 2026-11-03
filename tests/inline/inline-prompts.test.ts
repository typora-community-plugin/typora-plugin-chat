import { describe, expect, it } from 'vitest'
import {
  ACTION_NEEDS_NOTE, CARET_ACTIONS, INLINE_NOTE_MAX_CHARS, INLINE_NOTE_MIN_CHARS, SELECTION_ACTIONS,
  actionInstruction, buildInlineMessages, cleanInlineOutput, isBlockMarkdown, locateAnchor, noteCharBudget, translateUiInstruction, windowNote,
} from '../../src/inline/inline-prompts'

describe('buildInlineMessages', () => {
  it('asks for insert-ready Markdown and includes the note as context', () => {
    const [system, user] = buildInlineMessages({ instruction: 'Make a table', selection: '', note: '# Trip\nDay 1', title: 'trip.md', before: 'Costs:' })
    expect(system.role).toBe('system')
    expect(system.content).toContain('output ONLY the Markdown content to insert')
    expect(system.content).toContain('<note>\n# Trip\nDay 1\n</note>')
    expect(system.content).toContain('"trip.md"')
    expect(user.content).toContain('Text right before the cursor:\n"""\nCosts:\n"""')
    expect(user.content).toContain('Instruction: Make a table')
  })

  it('sends the selection instead of the caret context when text is selected', () => {
    const [system, user] = buildInlineMessages({ instruction: 'Polish', selection: '- **teh** item', note: '', before: 'ignored' })
    expect(system.content).toContain('replace or follow the selected text')
    expect(user.content).toContain('Selected text:\n"""\n- **teh** item\n"""')
    expect(user.content).not.toContain('ignored')
  })

  it('omits the note block when no note is given', () => {
    const [system] = buildInlineMessages({ instruction: 'x', selection: '', note: '   ' })
    expect(system.content).not.toContain('<note>')
  })

  it('has an instruction for every quick action; the diagram action asks for Mermaid', () => {
    for (const id of [...CARET_ACTIONS, ...SELECTION_ACTIONS]) expect(actionInstruction(id)).toBeTruthy()
    expect(actionInstruction('diagram')).toContain('```mermaid')
  })

  it('translates to the plugin UI language for the dynamic translate action', () => {
    expect(translateUiInstruction('zh-cn')).toContain('Simplified Chinese')
    expect(translateUiInstruction('de')).toContain('German')
    expect(translateUiInstruction('zh-tw')).toContain('Simplified Chinese')
    expect(actionInstruction('translateUi', 'de')).toBe(translateUiInstruction('de'))
    expect(actionInstruction('translateUi', 'fr')).toContain('English')
  })

  it('does not send the note for pure selection transforms', () => {
    for (const id of SELECTION_ACTIONS) expect(ACTION_NEEDS_NOTE[id]).toBe(false)
    for (const id of CARET_ACTIONS) expect(ACTION_NEEDS_NOTE[id]).toBe(true)
  })
})

describe('noteCharBudget', () => {
  it('scales with the context window and stays within bounds', () => {
    expect(noteCharBudget(8_192)).toBe(INLINE_NOTE_MIN_CHARS) // small local model
    expect(noteCharBudget(32_000)).toBe(13_000)
    expect(noteCharBudget(1_000_000)).toBe(INLINE_NOTE_MAX_CHARS)
  })
})

describe('locateAnchor', () => {
  const note = '# Title\n\nIntro paragraph here.\n\n## Costs\n\nHotel is **300** GBP per night and flights 450.\n'
  it('finds the caret from the tail of the text before it (ignoring Markdown syntax differences)', () => {
    const at = locateAnchor(note, { before: 'Title Intro paragraph here. Costs Hotel is 300 GBP per night and flights 450.' })
    expect(at).toBe(note.indexOf('flights 450.') + 'flights 450.'.length)
  })
  it('finds a selection by its start', () => {
    expect(locateAnchor(note, { selection: 'Intro paragraph here.' })).toBe(note.indexOf('Intro'))
  })
  it('falls back to the caret ratio, then null', () => {
    expect(locateAnchor(note, { before: 'zzzzzzzzzzzz no match', caretRatio: 0.5 })).toBe(Math.round(note.length / 2))
    expect(locateAnchor(note, {})).toBeNull()
  })
})

describe('windowNote', () => {
  const note = 'HEAD'.repeat(1000) + 'x'.repeat(50_000) + 'NEAR_CARET' + 'y'.repeat(20_000)
  it('returns short notes unchanged', () => {
    expect(windowNote('short', 0, 100)).toBe('short')
  })
  it('keeps the head and a window around the caret instead of only the beginning', () => {
    const anchor = note.indexOf('NEAR_CARET') + 10
    const out = windowNote(note, anchor, 10_000)
    expect(out.startsWith('HEADHEAD')).toBe(true)
    expect(out).toContain('NEAR_CARET')
    expect(out).toContain('…(omitted)…')
    expect(out.length).toBeLessThan(10_100)
  })
  it('defaults to the end of the note without an anchor', () => {
    const out = windowNote(note, null, 5_000)
    expect(out.endsWith('y'.repeat(100))).toBe(true)
  })
})

describe('cleanInlineOutput', () => {
  it('unwraps a reply wrapped in a single markdown fence', () => {
    expect(cleanInlineOutput('```markdown\n| a | b |\n|---|---|\n| 1 | 2 |\n```')).toBe('| a | b |\n|---|---|\n| 1 | 2 |')
    expect(cleanInlineOutput('```\nplain\n```')).toBe('plain')
  })
  it('normalizes CRLF before unwrapping', () => {
    expect(cleanInlineOutput('```markdown\r\n| a |\r\n|---|\r\n```\r\n')).toBe('| a |\n|---|')
  })
  it('keeps Mermaid and other language fences', () => {
    const mermaid = '```mermaid\nflowchart LR\n  A --> B\n```'
    expect(cleanInlineOutput(mermaid)).toBe(mermaid)
    expect(cleanInlineOutput('```python\nprint(1)\n```')).toBe('```python\nprint(1)\n```')
  })
  it('does not unwrap when the reply contains several fences', () => {
    const text = '```\na\n```\n\ntext\n\n```\nb\n```'
    expect(cleanInlineOutput(text)).toBe(text)
  })
})

describe('isBlockMarkdown', () => {
  it.each([
    ['| a | b |\n|---|---|', true], ['```mermaid\nA-->B\n```', true], ['- item', true], ['## Heading', true],
    ['para one\n\npara two', true], ['just a sentence.', false], ['inline **bold** text', false],
  ])('%j → %s', (md, expected) => {
    expect(isBlockMarkdown(md)).toBe(expected)
  })
})
