import type { ApiMessage } from '@/config/types'

/** Max note characters sent as context for an inline request. */
export const INLINE_NOTE_LIMIT = 30_000

export type InlineActionId =
  | 'table' | 'diagram' | 'continue' | 'outline'
  | 'polish' | 'shorten' | 'expand' | 'translateEn' | 'translateZh' | 'explain'

/** Actions shown when nothing is selected (generate at the caret). */
export const CARET_ACTIONS: InlineActionId[] = ['table', 'diagram', 'continue', 'outline']
/** Actions shown when text is selected (transform the selection). */
export const SELECTION_ACTIONS: InlineActionId[] = ['polish', 'shorten', 'expand', 'translateEn', 'translateZh', 'explain']

/**
 * The instruction sent to the model for each quick action. Kept in English on
 * purpose (models follow it reliably); the system prompt asks the model to
 * answer in the note's language.
 */
export const ACTION_INSTRUCTIONS: Record<InlineActionId, string> = {
  table: 'Create a Markdown table that fits here, based on the surrounding context. If the context is not enough, make a sensible, clearly structured table on the topic of the note.',
  diagram: 'Draw a diagram that fits here as a Mermaid code block (```mermaid … ```), e.g. a flowchart or sequence diagram, based on the surrounding context. Use only valid Mermaid syntax and quote node labels that contain spaces or punctuation.',
  continue: 'Continue writing naturally from the cursor position, matching the tone and language of the note.',
  outline: 'Write a concise Markdown outline (nested list) for the note.',
  polish: 'Polish the selected text: fix grammar and improve clarity and flow while keeping its meaning, tone and language.',
  shorten: 'Rewrite the selected text to be more concise, keeping its meaning and language.',
  expand: 'Expand the selected text with more detail, keeping its style and language.',
  translateEn: 'Translate the selected text into natural English.',
  translateZh: 'Translate the selected text into natural Simplified Chinese.',
  explain: 'Explain the selected text in plain words.',
}

export interface InlineRequest {
  instruction: string
  /** Selected text; empty when generating at the caret. */
  selection: string
  /** Full Markdown of the active note (truncated by the caller or here). */
  note: string
  /** Note title or path, for context. */
  title?: string
  /** Text immediately before the caret, to anchor "here". */
  before?: string
}

export function buildInlineMessages(req: InlineRequest): ApiMessage[] {
  const note = req.note.length > INLINE_NOTE_LIMIT
    ? req.note.slice(0, INLINE_NOTE_LIMIT) + '\n…(truncated)'
    : req.note
  const target = req.selection ? 'replace or follow the selected text' : 'be inserted at the cursor'
  const system = [
    'You are an inline writing assistant inside a Markdown editor (Typora).',
    `Your entire reply will ${target} verbatim, so output ONLY the Markdown content to insert:`,
    '- no greetings, explanations, or notes about what you did;',
    '- do not wrap the whole reply in a code fence (use fences only for code or ```mermaid diagrams);',
    "- write in the same language as the note unless the instruction says otherwise.",
    note.trim() ? `\nThe note${req.title ? ` "${req.title}"` : ''} for context:\n<note>\n${note}\n</note>` : '',
  ].join('\n')

  const parts: string[] = []
  if (req.selection) parts.push(`Selected text:\n"""\n${req.selection}\n"""`)
  else if (req.before?.trim()) parts.push(`Text right before the cursor:\n"""\n${req.before.slice(-800)}\n"""`)
  parts.push(`Instruction: ${req.instruction}`)

  return [
    { role: 'system', content: system },
    { role: 'user', content: parts.join('\n\n') },
  ]
}

/**
 * Normalize a model reply for insertion: trims whitespace and unwraps a reply
 * that is entirely wrapped in a ```markdown / ```md / bare ``` fence (a common
 * habit). Mermaid and other language fences are kept.
 */
export function cleanInlineOutput(text: string): string {
  const out = text.trim()
  const fenceLines = out.split('\n').filter(line => /^\s*```/.test(line))
  const m = out.match(/^```(markdown|md)?[ \t]*\n([\s\S]*)\n```$/i)
  // Only unwrap when the outer fence is the only fence pair in the reply.
  if (m && fenceLines.length === 2) return m[2].trim()
  return out
}
