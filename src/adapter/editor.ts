import { app } from '@typora-community-plugin/core'
import { editor } from 'typora'
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

/**
 * Whether the user is currently editing the note: the caret/selection is in
 * the writing area and focus is not in another text field (chat sidebar,
 * Settings, command panel…). Keyboard event targets are not reliable for
 * this in Typora, so the selection and the active element are checked.
 */
export function isEditingNote(): boolean {
  const write = editor.writingArea
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
    const { selection, UserOp } = editor
    const rangy = selection.getRangy()
    if (!UserOp?.prepMarkHtml || !UserOp.getMarkdownSourceFrom || !rangy || rangy.collapsed || !rangy.toHtml) return null
    const markElem = UserOp.prepMarkHtml(rangy.toHtml(), editor)
    const md = UserOp.getMarkdownSourceFrom(markElem.html())
    return typeof md === 'string' && md.trim() ? md.trim() : null
  } catch {
    return null
  }
}

/**
 * A caret/selection captured in the writing area, so it survives focus moving
 * into a popup. Insertion is delegated to core's
 * `activeEditor.insertMarkdown()`; the anchor only records the selection text,
 * Markdown, position and whether the note changed meanwhile.
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
  const write = editor.writingArea
  if (!sel || !sel.rangeCount || !write) return null
  const range = sel.getRangeAt(0)
  if (!write.contains(range.commonAncestorContainer)) return null

  const activeEditor = app.workspace.activeEditor

  const text = sel.toString().trim()
  const markdown = text ? (selectionMarkdown() ?? text) : ''
  let before = ''
  let caretRatio: number | null = null
  if (!text) {
    const cursor = activeEditor.selection.getCursor()
    if (cursor !== null) {
      const content = write.textContent ?? ''
      before = content.slice(0, cursor)
      caretRatio = content.length ? cursor / content.length : null
    }
  }

  const saved = range.cloneRange()
  let stale = false
  let offEdit: (() => void) | null = null
  try {
    const off = activeEditor.on('edit', () => { stale = true })
    offEdit = typeof off === 'function' ? off : null
  } catch { offEdit = null }

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
      if (stale || !editor.writingArea) return false
      const at = mode === 'after' ? 'cursor' : 'selection'
      try {
        activeEditor.selection.restoreForInsertion(at)
        const current = window.getSelection()
        const block = current?.anchorNode
          ? (current.anchorNode.nodeType === 1 ? current.anchorNode as Element : current.anchorNode.parentElement)?.closest('[cid]')
          : null
        const caretInText = !!current?.isCollapsed && !!block?.textContent?.trim()
        const newBlock = mode === 'after' || (asBlock && caretInText)
        if (newBlock) {
          current?.collapseToEnd()
          const { UserOp } = editor
          if (UserOp?.insertParagraph) UserOp.insertParagraph(false, editor)
          else md = `\n\n${md}\n\n`
        }
        activeEditor.insertMarkdown(md, newBlock ? 'cursor' : 'selection')
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
