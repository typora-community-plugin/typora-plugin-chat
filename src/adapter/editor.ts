import { app } from '@typora-community-plugin/core'
import type { SelectionScope } from '@/config/types'
import { getCurrentFilePath } from './vault'


/**
 * Typora editor API wrapper.
 *
 * Typora's plugin SDK exposes the active `MarkdownEditor` (getMarkdown/setMarkdown)
 * but not a full selection range API, so selection is read from the DOM.
 */

export function getTextRange(start: number, end: number): string {
  const markdown = app.workspace.activeEditor.getMarkdown()
  return markdown.slice(start, end)
}

export function insertTextAtCursor(text: string): void {
  const editorEl = document.querySelector<HTMLElement>('#write, .md-editor, [contenteditable="true"]')
  if (editorEl && typeof document.execCommand === 'function') {
    try {
      editorEl.focus()
      document.execCommand('insertText', false, text)
      return
    } catch {
      /* fall through to markdown append */
    }
  }
  const current = app.workspace.activeEditor.getMarkdown()
  app.workspace.activeEditor.setMarkdown(`${current}\n${text}`)
}

export function getSelection(): SelectionScope | null {
  const domSelection = window.getSelection()
  const text = domSelection?.toString()?.trim()
  if (!text) return null
  return {
    text,
    filePath: getCurrentFilePath() ?? undefined,
  }
}

// ── Selection snapshots & markdown insertion (inline assistant) ─────────

interface TyporaRangy { select(): void }
interface TyporaEditor {
  selection?: { getRangy?(): TyporaRangy }
  UserOp?: { pasteHandler?(editor: unknown, content: string, isMarkdown?: boolean): void }
}

/** Typora's internal editor instance (`File.editor`), if available. */
function typoraEditor(): TyporaEditor | null {
  const w = window as unknown as { File?: { editor?: TyporaEditor }; editor?: TyporaEditor }
  return w.File?.editor ?? w.editor ?? null
}

function writingArea(): HTMLElement | null {
  return document.querySelector<HTMLElement>('#write')
}

/** A saved editor selection that survives focus moving into a popup. */
export interface SelectionSnapshot {
  range: Range | null
  rangy: TyporaRangy | null
  text: string
}

/**
 * Snapshot the current selection if it lies inside the writing area.
 * Returns null when the caret is elsewhere (e.g. in the chat sidebar).
 */
export function captureSelection(): SelectionSnapshot | null {
  const sel = window.getSelection()
  const write = writingArea()
  if (!sel || !sel.rangeCount || !write) return null
  const range = sel.getRangeAt(0)
  if (!write.contains(range.commonAncestorContainer)) return null
  let rangy: TyporaRangy | null = null
  try { rangy = typoraEditor()?.selection?.getRangy?.() ?? null } catch { rangy = null }
  return { range: range.cloneRange(), rangy, text: sel.toString().trim() }
}

/** Screen rectangle of a snapshot's caret/selection end, for positioning popups. */
export function snapshotRect(snapshot: SelectionSnapshot | null): DOMRect | null {
  const range = snapshot?.range
  if (!range) return null
  const rects = range.getClientRects()
  const last = rects.length ? rects[rects.length - 1] : null
  if (last && (last.width || last.height)) return last
  const rect = range.getBoundingClientRect()
  if (rect.width || rect.height) return rect
  const node = range.startContainer
  const el = node.nodeType === 1 ? (node as Element) : node.parentElement
  return el?.getBoundingClientRect() ?? null
}

function restoreSnapshot(snapshot: SelectionSnapshot): boolean {
  try {
    if (snapshot.rangy) { snapshot.rangy.select(); return true }
  } catch { /* fall back to the DOM range */ }
  if (!snapshot.range) return false
  const sel = window.getSelection()
  if (!sel) return false
  sel.removeAllRanges()
  sel.addRange(snapshot.range)
  return true
}

/**
 * Insert Markdown at a saved selection using Typora's own paste pipeline, so
 * tables, code fences and Mermaid diagrams are rendered as blocks.
 *
 * - `replace`: replace the selected text (or insert at the caret).
 * - `after`:   keep the selection and insert after it as a new block.
 */
export function insertMarkdownAt(snapshot: SelectionSnapshot | null, markdown: string, mode: 'replace' | 'after' = 'replace'): boolean {
  writingArea()?.focus()
  if (snapshot) restoreSnapshot(snapshot)
  if (mode === 'after') {
    const sel = window.getSelection()
    if (sel && sel.rangeCount) sel.collapseToEnd()
    if (snapshot?.text) markdown = `\n\n${markdown}`
  }
  const ed = typoraEditor()
  try {
    if (ed?.UserOp?.pasteHandler) {
      ed.UserOp.pasteHandler(ed, markdown, true)
      return true
    }
  } catch { /* fall through */ }
  try {
    if (typeof document.execCommand === 'function' && document.execCommand('insertText', false, markdown)) return true
  } catch { /* ignore */ }
  return false
}
