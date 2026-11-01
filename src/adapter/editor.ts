import { app } from '@typora-community-plugin/core'
import type { SelectionScope } from '@/config/types'
import { getCurrentFilePath } from './vault'


/**
 * Typora editor API wrapper.
 *
 * Typora's plugin SDK exposes the active `MarkdownEditor` (getMarkdown/setMarkdown)
 * but not a full selection range API, so selection is read from the DOM.
 */

export function getSelection(): SelectionScope | null {
  const domSelection = window.getSelection()
  const text = domSelection?.toString()?.trim()
  if (!text) return null
  return {
    text,
    filePath: getCurrentFilePath() ?? undefined,
  }
}

// ── Editor anchor (inline assistant) ────────────────────────────────────

interface TyporaRangy {
  collapsed?: boolean
  toHtml?(): string
}
/** The parts of Typora's internal `File.editor` used here (not in the plugin SDK). */
interface TyporaEditor {
  selection?: { getRangy?(): TyporaRangy | null }
  UserOp?: {
    pasteHandler?(editor: unknown, content: string, isMarkdown?: boolean): void
    insertParagraph?(before: boolean, editor: unknown): void
    prepMarkHtml?(html: string, editor: unknown): { html(): string }
    getMarkdownSourceFrom?(html: string): string
  }
}

function typoraEditor(): TyporaEditor | null {
  const w = window as unknown as { File?: { editor?: TyporaEditor }; editor?: TyporaEditor }
  return w.File?.editor ?? w.editor ?? null
}

function writingArea(): HTMLElement | null {
  return document.querySelector<HTMLElement>('#write')
}

/**
 * Whether the user is currently editing the note: the caret/selection is in
 * the writing area and focus is not in another text field (chat sidebar,
 * Settings, command panel…). Keyboard event targets are not reliable for
 * this in Typora, so the selection and the active element are checked.
 */
export function isEditingNote(): boolean {
  const write = writingArea()
  const sel = window.getSelection()
  if (!write || !sel?.anchorNode || !write.contains(sel.anchorNode)) return false
  const active = document.activeElement
  if (active && active !== document.body && !write.contains(active)
    && active.matches('input, textarea, select, [contenteditable="true"], [contenteditable=""]')) return false
  return true
}

/**
 * The current selection as Markdown, via the same path as Typora's
 * "Copy as Markdown" (prepMarkHtml → getMarkdownSourceFrom), without touching
 * the clipboard. Returns null if unavailable, so callers can fall back to
 * plain text.
 */
function selectionMarkdown(): string | null {
  try {
    const ed = typoraEditor()
    const rangy = ed?.selection?.getRangy?.()
    if (!ed?.UserOp?.prepMarkHtml || !ed.UserOp.getMarkdownSourceFrom || !rangy || rangy.collapsed || !rangy.toHtml) return null
    const markElem = ed.UserOp.prepMarkHtml(rangy.toHtml(), ed)
    const md = ed.UserOp.getMarkdownSourceFrom(markElem.html())
    return typeof md === 'string' && md.trim() ? md.trim() : null
  } catch {
    return null
  }
}

/**
 * A caret/selection captured in the writing area, so it survives focus moving
 * into a popup. Built on core's `activeEditor.selection.save()/restore()`, and
 * marked stale as soon as the note is edited, because a saved range no longer
 * points where the user expects after an edit.
 */
export interface EditorAnchor {
  /** Selected text (plain); empty for a caret. */
  readonly text: string
  /** Selected text as Markdown (falls back to `text`). */
  readonly markdown: string
  /** Plain text before the caret (for a caret only). */
  readonly before: string
  /** Caret position as a fraction of the document text, if known. */
  readonly caretRatio: number | null
  /** Screen rectangle of the caret/selection end, for positioning popups. */
  rect(): DOMRect | null
  /** True once the note has been edited since capture. */
  isStale(): boolean
  /**
   * Insert Markdown through Typora's paste pipeline so tables, fences and
   * Mermaid render natively.
   * - `replace`: replace the selection, or insert at the caret.
   * - `after`:   insert below the selection's block.
   * `asBlock` inserts into a new paragraph after the current block when the
   * caret sits inside text, so block content never runs into the sentence.
   */
  insert(markdown: string, mode: 'replace' | 'after', asBlock: boolean): boolean
  dispose(): void
}

/** Capture the caret/selection, or null when it is not in the writing area. */
export function captureAnchor(): EditorAnchor | null {
  const sel = window.getSelection()
  const write = writingArea()
  if (!sel || !sel.rangeCount || !write) return null
  const range = sel.getRangeAt(0)
  if (!write.contains(range.commonAncestorContainer)) return null

  const editor = app.workspace.activeEditor
  try { editor.selection.save() } catch { /* restore() below then falls back to the DOM range */ }

  const text = sel.toString().trim()
  const markdown = text ? (selectionMarkdown() ?? text) : ''
  let before = ''
  let caretRatio: number | null = null
  if (!text) {
    try {
      const pre = document.createRange()
      pre.setStart(write, 0)
      pre.setEnd(range.startContainer, range.startOffset)
      before = pre.toString()
      const total = write.textContent?.length ?? 0
      caretRatio = total ? before.length / total : null
    } catch { /* leave empty */ }
  }

  const saved = range.cloneRange()
  let stale = false
  let offEdit: (() => void) | null = null
  try {
    const off = editor.on('edit', () => { stale = true })
    offEdit = typeof off === 'function' ? off : null
  } catch { offEdit = null }

  const restore = () => {
    try {
      editor.selection.restore()
      const current = window.getSelection()
      if (current && current.rangeCount && write.contains(current.getRangeAt(0).commonAncestorContainer)) return
    } catch { /* fall back */ }
    const current = window.getSelection()
    current?.removeAllRanges()
    current?.addRange(saved)
  }

  return {
    text,
    markdown,
    before,
    caretRatio,
    rect() {
      const rects = saved.getClientRects()
      const last = rects.length ? rects[rects.length - 1] : null
      if (last && (last.width || last.height)) return last
      const rect = saved.getBoundingClientRect()
      if (rect.width || rect.height) return rect
      const node = saved.startContainer
      const el = node.nodeType === 1 ? (node as Element) : node.parentElement
      return el?.getBoundingClientRect() ?? null
    },
    isStale: () => stale,
    insert(md, mode, asBlock) {
      const ed = typoraEditor()
      if (stale || !ed?.UserOp?.pasteHandler) return false
      write.focus()
      restore()
      const current = window.getSelection()
      const block = current?.anchorNode
        ? (current.anchorNode.nodeType === 1 ? current.anchorNode as Element : current.anchorNode.parentElement)?.closest('[cid]')
        : null
      const caretInText = !!current?.isCollapsed && !!block?.textContent?.trim()
      const newBlock = mode === 'after' || (asBlock && caretInText)
      try {
        if (newBlock) {
          current?.collapseToEnd()
          if (ed.UserOp.insertParagraph) ed.UserOp.insertParagraph(false, ed)
          else md = `\n\n${md}\n\n`
        }
        ed.UserOp.pasteHandler(ed, md, true)
        return true
      } catch {
        return false
      }
    },
    dispose() {
      offEdit?.()
      offEdit = null
    },
  }
}
