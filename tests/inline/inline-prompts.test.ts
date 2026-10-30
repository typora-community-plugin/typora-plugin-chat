import { describe, expect, it } from 'vitest'
import {
  ACTION_INSTRUCTIONS, CARET_ACTIONS, INLINE_NOTE_LIMIT, SELECTION_ACTIONS,
  buildInlineMessages, cleanInlineOutput,
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
    const [system, user] = buildInlineMessages({ instruction: 'Polish', selection: 'teh text', note: 'x', before: 'ignored' })
    expect(system.content).toContain('replace or follow the selected text')
    expect(user.content).toContain('Selected text:\n"""\nteh text\n"""')
    expect(user.content).not.toContain('ignored')
  })

  it('truncates very long notes', () => {
    const [system] = buildInlineMessages({ instruction: 'x', selection: '', note: 'a'.repeat(INLINE_NOTE_LIMIT + 50) })
    expect(system.content as string).toContain('…(truncated)')
    expect((system.content as string).length).toBeLessThan(INLINE_NOTE_LIMIT + 2000)
  })

  it('omits the note block for an empty note', () => {
    const [system] = buildInlineMessages({ instruction: 'x', selection: '', note: '   ' })
    expect(system.content).not.toContain('<note>')
  })

  it('has an instruction for every quick action, and the diagram action asks for Mermaid', () => {
    for (const id of [...CARET_ACTIONS, ...SELECTION_ACTIONS]) expect(ACTION_INSTRUCTIONS[id]).toBeTruthy()
    expect(ACTION_INSTRUCTIONS.diagram).toContain('```mermaid')
  })
})

describe('cleanInlineOutput', () => {
  it('unwraps a reply wrapped in a single markdown fence', () => {
    expect(cleanInlineOutput('```markdown\n| a | b |\n|---|---|\n| 1 | 2 |\n```')).toBe('| a | b |\n|---|---|\n| 1 | 2 |')
    expect(cleanInlineOutput('```\nplain\n```')).toBe('plain')
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

  it('trims surrounding whitespace', () => {
    expect(cleanInlineOutput('\n\n  hello  \n')).toBe('hello')
  })
})
