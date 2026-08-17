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
