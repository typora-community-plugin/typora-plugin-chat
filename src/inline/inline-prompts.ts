import type { ApiMessage } from '@/config/types'

/** Upper bound for note context characters, whatever the model's window. */
export const INLINE_NOTE_MAX_CHARS = 30_000
/** Lower bound so small local models still get some context. */
export const INLINE_NOTE_MIN_CHARS = 2_000
/** Characters always kept from the start of a long note (title, intro). */
export const INLINE_NOTE_HEAD_CHARS = 2_000

export type InlineActionId =
  | 'table' | 'diagram' | 'continue' | 'outline'
  | 'polish' | 'shorten' | 'expand' | 'translateEn' | 'translateUi' | 'explain'

/** Actions shown when nothing is selected (generate at the caret). */
export const CARET_ACTIONS: InlineActionId[] = ['table', 'diagram', 'continue', 'outline']
/**
 * Actions shown when text is selected (transform the selection).
 * `translateUi` targets the plugin's current UI language, so the caller hides
 * it when that is English (where `translateEn` already covers it).
 */
export const SELECTION_ACTIONS: InlineActionId[] = ['polish', 'shorten', 'expand', 'translateEn', 'translateUi', 'explain']

/** Human-readable model target for each plugin locale, keyed by locale or language. */
const TRANSLATE_TARGETS: Record<string, string> = {
  en: 'English',
  zh: 'Simplified Chinese',
  'zh-cn': 'Simplified Chinese',
  de: 'German',
}

/** Instruction for "translate to the plugin's UI language". */
export function translateUiInstruction(locale: string): string {
  const target = TRANSLATE_TARGETS[locale] ?? TRANSLATE_TARGETS[locale.split('-')[0]] ?? 'English'
  return `Translate the selected text into natural ${target}, keeping its Markdown formatting.`
}

/**
 * The instruction sent to the model for each quick action. Kept in English on
 * purpose (models follow it reliably); the system prompt asks the model to
 * answer in the note's language. `translateUi` depends on the active locale.
 */
export const ACTION_INSTRUCTIONS: Record<Exclude<InlineActionId, 'translateUi'>, string> = {
  table: 'Create a Markdown table that fits here, based on the surrounding context. If the context is not enough, make a sensible, clearly structured table on the topic of the note.',
  diagram: 'Draw a diagram that fits here as a Mermaid code block (```mermaid … ```), e.g. a flowchart or sequence diagram, based on the surrounding context. Use only valid Mermaid syntax and quote node labels that contain spaces or punctuation.',
  continue: 'Continue writing naturally from the cursor position, matching the tone and language of the note.',
  outline: 'Write a concise Markdown outline (nested list) for the note.',
  polish: 'Polish the selected text: fix grammar and improve clarity and flow while keeping its meaning, tone, language and Markdown formatting.',
  shorten: 'Rewrite the selected text to be more concise, keeping its meaning, language and Markdown formatting.',
  expand: 'Expand the selected text with more detail, keeping its style, language and Markdown formatting.',
  translateEn: 'Translate the selected text into natural English, keeping its Markdown formatting.',
  explain: 'Explain the selected text in plain words.',
}

/** Instruction for a quick action; resolves the locale-dependent translate action. */
export function actionInstruction(id: InlineActionId, locale = 'en'): string {
  return id === 'translateUi' ? translateUiInstruction(locale) : ACTION_INSTRUCTIONS[id]
}

/**
 * Pure selection transforms only need the selection itself; sending the whole
 * note would just cost tokens and latency.
 */
export const ACTION_NEEDS_NOTE: Record<InlineActionId, boolean> = {
  table: true, diagram: true, continue: true, outline: true,
  polish: false, shorten: false, expand: false, translateEn: false, translateUi: false, explain: false,
}

/**
 * Character budget for note context, derived from the model's context window
 * (tokens). Reserves room for the reply and the prompt, and counts one
 * character as one token so CJK text cannot overflow the window.
 */
export function noteCharBudget(contextWindowTokens: number): number {
  const reserved = 6_000 // reply + system prompt + instruction
  const available = Math.floor((contextWindowTokens - reserved) / 2)
  return Math.max(INLINE_NOTE_MIN_CHARS, Math.min(INLINE_NOTE_MAX_CHARS, available))
}

/**
 * Best-effort offset of the caret (or selection) inside the note's Markdown.
 * DOM text and Markdown differ (syntax characters), so this looks for the
 * tail of the text before the caret, then falls back to a proportional guess.
 */
export function locateAnchor(note: string, hint: { selection?: string; before?: string; caretRatio?: number }): number | null {
  if (hint.selection) {
    for (const len of [80, 40, 20]) {
      const needle = hint.selection.trim().slice(0, len)
      if (needle.length >= 8) {
        const at = note.indexOf(needle)
        if (at >= 0) return at
      }
    }
  }
  if (hint.before) {
    const tail = hint.before.replace(/\s+$/, '')
    for (const len of [120, 60, 30, 15]) {
      const needle = tail.slice(-len)
      if (needle.length >= 8) {
        const at = note.lastIndexOf(needle)
        if (at >= 0) return at + needle.length
      }
    }
  }
  if (typeof hint.caretRatio === 'number' && Number.isFinite(hint.caretRatio)) {
    return Math.round(Math.min(1, Math.max(0, hint.caretRatio)) * note.length)
  }
  return null
}

/**
 * Trim a long note to `budget` characters around `anchor`: always keep the
 * head (title/intro), then a window biased towards the text before the caret,
 * which is what continuing or inserting "here" depends on.
 */
export function windowNote(note: string, anchor: number | null, budget: number): string {
  if (note.length <= budget) return note
  const head = Math.min(INLINE_NOTE_HEAD_CHARS, Math.floor(budget / 4))
  const rest = budget - head
  const at = anchor ?? note.length
  let start = Math.max(head, at - Math.floor(rest * 0.85))
  const end = Math.min(note.length, start + rest)
  start = Math.max(head, end - rest)
  const parts = [note.slice(0, head)]
  if (start > head) parts.push('\n…(omitted)…\n')
  parts.push(note.slice(start, end))
  if (end < note.length) parts.push('\n…(omitted)…')
  return parts.join('')
}

export interface InlineRequest {
  instruction: string
  /** Selected Markdown; empty when generating at the caret. */
  selection: string
  /** Note context, already windowed by the caller; empty to omit it. */
  note: string
  /** Note file name, for context. */
  title?: string
  /** Text immediately before the caret, to anchor "here". */
  before?: string
}

export function buildInlineMessages(req: InlineRequest): ApiMessage[] {
  const target = req.selection ? 'replace or follow the selected text' : 'be inserted at the cursor'
  const system = [
    'You are an inline writing assistant inside a Markdown editor (Typora).',
    `Your entire reply will ${target} verbatim, so output ONLY the Markdown content to insert:`,
    '- no greetings, explanations, or notes about what you did;',
    '- do not wrap the whole reply in a code fence (use fences only for code or ```mermaid diagrams);',
    '- write in the same language as the note unless the instruction says otherwise.',
    req.note.trim() ? `\nThe note${req.title ? ` "${req.title}"` : ''} for context:\n<note>\n${req.note}\n</note>` : '',
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
 * Normalize a model reply for insertion: normalizes line endings, trims, and
 * unwraps a reply that is entirely wrapped in a single ```markdown / ```md /
 * bare ``` fence (a common habit). Mermaid and other language fences are kept.
 */
export function cleanInlineOutput(text: string): string {
  const out = text.replace(/\r\n?/g, '\n').trim()
  const fenceLines = out.split('\n').filter(line => /^\s*```/.test(line))
  const m = out.match(/^```(markdown|md)?[ \t]*\n([\s\S]*)\n```$/i)
  // Only unwrap when the outer fence is the only fence pair in the reply.
  if (m && fenceLines.length === 2) return m[2].trim()
  return out
}

/** Whether Markdown is block-level content (table, list, fence…) rather than inline text. */
export function isBlockMarkdown(md: string): boolean {
  return /\n\s*\n/.test(md) || /^\s*(\||```|~~~|#{1,6}\s|[-*+]\s|\d+[.)]\s|>)/m.test(md)
}
