import { app, Notice } from '@typora-community-plugin/core'
import { mount, unmount } from 'svelte'
import { sendMessage } from '@/api/client'
import { settingsManager } from '@/config/settings'
import { getActiveConfig } from '@/config/types'
import { isProviderEnabled } from '@/config/providers'
import { resolveContextWindow } from '@/agent/context-size'
import { isEditingNote } from '@/adapter/editor'
import type { EditorAnchor } from '@/adapter/editor'
import { ensureSvelteDomShims } from '@/utils/svelte-dom'
import { basename } from '@/utils/helpers'
import { getLocale, t } from '@/i18n'
import {
  ACTION_NEEDS_NOTE, CARET_ACTIONS, DOC_ACTIONS, SELECTION_ACTIONS,
  actionInstruction, buildInlineMessages, isBlockMarkdown, locateAnchor, noteCharBudget, windowNote,
} from './inline-prompts'
import type { InlineActionId } from './inline-prompts'
import InlinePopup from './InlinePopup.svelte'
import { InlineSession } from './inline-session.svelte'
import type { InsertMode } from './inline-session.svelte'

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (cls) node.className = cls
  if (text !== undefined) node.textContent = text
  return node
}

async function writeClipboard(text: string): Promise<boolean> {
  try {
    if (!navigator.clipboard?.writeText) return false
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

function notify(message: string) {
  try { Notice.warning(message, 4000) } catch { console.warn('[chat]', message) }
}

/**
 * A small popup anchored at the editor caret: one-shot generation (no tools)
 * with the active provider/model, previewed and then inserted via Typora's
 * paste pipeline so tables and Mermaid diagrams render natively.
 *
 * This class owns the lifecycle (mount/unmount, anchor, keyboard, positioning);
 * the request lifecycle lives in `InlineSession` and the view in `InlinePopup`.
 */
export class InlineAssistant {
  /** Mount target. Only carries the `visibility` toggle used while inserting. */
  private shell: HTMLElement | null = null
  /** The popup element itself (`.typ-inline-ai`), styled by `position()`. */
  private popup: HTMLElement | null = null
  private component: Record<string, unknown> | null = null
  private resizeObserver: ResizeObserver | null = null
  private anchor: EditorAnchor | null = null
  private session: InlineSession | null = null

  private readonly onKeydown = (e: KeyboardEvent) => {
    if (e.key !== 'Escape' || !this.shell || e.isComposing) return
    // Only when focus is in the popup or back in the note: Esc in a dialog
    // opened on top (Settings, command panel…) belongs to that dialog.
    const modalOpen = Array.from(document.querySelectorAll<HTMLElement>('.typ-modal, .modal.in'))
      .some(el => !this.shell!.contains(el) && el.getClientRects().length > 0)
    if (modalOpen) return
    const active = document.activeElement
    if ((active && this.shell.contains(active)) || isEditingNote()) {
      e.preventDefault()
      e.stopPropagation()
      this.close()
    }
  }

  private readonly onMousedown = (e: MouseEvent) => {
    // Click outside closes only while idle with no result, so a stray click
    // never discards a generated answer.
    const phase = this.session?.state.phase
    if (this.shell && !this.shell.contains(e.target as Node) && (phase === 'idle' || phase === 'aborted')) this.close()
  }

  private readonly onReposition = () => this.position()

  get isOpen(): boolean {
    return !!this.shell
  }

  toggle(anchor: EditorAnchor | null) {
    if (this.shell) this.close()
    else this.open(anchor)
  }

  open(anchor: EditorAnchor | null) {
    this.close()
    ensureSvelteDomShims()
    this.anchor = anchor
    const tx = t.inline
    const session = new InlineSession({
      send: async (messages, signal) => {
        const response = await sendMessage(settingsManager.get(), messages, [], signal)
        return response.content.filter(b => b.type === 'text').map(b => b.text ?? '').join('')
      },
      canInsert: () => !!this.anchor && !this.anchor.isStale(),
      insert: (markdown, mode) => !!this.anchor?.insert(markdown, mode, isBlockMarkdown(markdown)),
      copy: writeClipboard,
      notify,
    }, {
      insertNoAnchor: tx.insertNoAnchor,
      insertFailed: tx.insertFailed,
      copyFailed: tx.copyFailed,
      error: tx.error,
    })
    this.session = session

    const selected = anchor?.text ?? ''
    const noteContext = selected ? '' : this.noteContext()
    const locale = getLocale()
    // Document-level generation is always offered; the rest depends on whether
    // the user selected text, which decides how the result is inserted.
    const groups: InlineActionId[][] = [DOC_ACTIONS]
    groups.push(selected
      // English UI: `translateEn` already targets the UI language.
      ? SELECTION_ACTIONS.filter(id => id !== 'translateUi' || locale.split('-')[0] !== 'en')
      : CARET_ACTIONS)
    const actionGroups = groups.map(ids => ids.map(id => ({ id, label: tx.actions[id] })))

    const shell = el('div')
    document.body.append(shell)
    this.shell = shell
    this.component = mount(InlinePopup, {
      target: shell,
      props: {
        session,
        selectedText: selected,
        noteContext,
        actionGroups,
        hasSelection: !!selected,
        canInsert: () => !!this.anchor && !this.anchor.isStale(),
        onRoot: (element: HTMLElement) => {
          this.popup = element
          this.observe()
          this.position()
        },
        onRun: (instruction: string) => this.run(instruction, null),
        onAction: (id: InlineActionId) => this.run(actionInstruction(id, getLocale()), id),
        onApply: (mode: InsertMode) => this.apply(mode),
        onRetry: () => { void this.session?.retry() },
        onAbort: () => this.session?.abort(),
        onCopy: () => this.session?.copy() ?? Promise.resolve(false),
        onClose: () => this.close(),
      },
    }) as unknown as Record<string, unknown>

    window.addEventListener('resize', this.onReposition)
    document.addEventListener('scroll', this.onReposition, true)
    document.addEventListener('keydown', this.onKeydown, true)
    document.addEventListener('mousedown', this.onMousedown, true)
  }

  close() {
    this.session?.dispose()
    this.session = null
    this.anchor?.dispose()
    this.anchor = null
    this.resizeObserver?.disconnect()
    this.resizeObserver = null
    if (this.component) {
      unmount(this.component as Parameters<typeof unmount>[0])
      this.component = null
    }
    this.popup = null
    if (!this.shell) return
    this.shell.remove()
    this.shell = null
    window.removeEventListener('resize', this.onReposition)
    document.removeEventListener('scroll', this.onReposition, true)
    document.removeEventListener('keydown', this.onKeydown, true)
    document.removeEventListener('mousedown', this.onMousedown, true)
  }

  /**
   * Re-measure whenever the popup's box changes: a reply can grow as Typora's
   * async renderer finishes (Mermaid, tables), and the textarea grows as the
   * draft wraps.
   */
  private observe() {
    this.resizeObserver?.disconnect()
    this.resizeObserver = null
    if (!this.popup || typeof ResizeObserver === 'undefined') return
    this.resizeObserver = new ResizeObserver(() => this.position())
    this.resizeObserver.observe(this.popup)
  }

  /** Keep the popup next to the caret and inside the viewport. */
  private position() {
    const popup = this.popup
    if (!popup) return
    const margin = 12
    const vw = window.innerWidth
    const vh = window.innerHeight
    const width = Math.min(555, vw - margin * 2)
    popup.style.width = `${width}px`
    popup.style.maxHeight = `${vh - margin * 2}px`

    const rect = this.anchor?.rect() ?? document.querySelector('#write')?.getBoundingClientRect() ?? null
    const height = popup.offsetHeight || 160
    let left = rect ? rect.left : (vw - width) / 2
    left = Math.max(margin, Math.min(left, vw - width - margin))
    let top = rect ? rect.bottom + 8 : vh / 3
    if (rect && top + height > vh - margin && rect.top - height - 8 > margin) top = rect.top - height - 8
    top = Math.max(margin, Math.min(top, vh - height - margin))
    popup.style.left = `${left}px`
    popup.style.top = `${top}px`
  }

  /**
   * Note context exactly as the request windows it: same anchor lookup and
   * character budget, so the popup preview shows what the model receives.
   */
  private noteContext(): string {
    const anchor = this.anchor
    const config = getActiveConfig(settingsManager.get())
    let full = ''
    try { full = app.workspace.activeEditor.getMarkdown() } catch { full = '' }
    const at = locateAnchor(full, {
      selection: anchor?.markdown,
      before: anchor?.before,
      caretRatio: anchor?.caretRatio ?? undefined,
    })
    return windowNote(full, at, noteCharBudget(resolveContextWindow(config.model, config)))
  }

  /** Build the request for an instruction (quick action id, or null for free text). */
  private run(instruction: string, action: InlineActionId | null) {
    instruction = instruction.trim()
    const session = this.session
    if (!instruction || !session || session.running || !this.shell) return
    const tx = t.inline
    const settings = settingsManager.get()
    if (!isProviderEnabled(settings.providers[settings.provider])) return session.fail(tx.providerDisabled)
    const config = getActiveConfig(settings)
    if (!config.model) return session.fail(tx.noModel)

    const anchor = this.anchor
    const selection = anchor?.markdown ?? ''
    const note = action === null || ACTION_NEEDS_NOTE[action] ? this.noteContext() : ''
    const file = app.workspace.activeFile
    void session.run(buildInlineMessages({
      instruction,
      selection,
      note,
      title: file ? basename(file) : undefined,
      before: selection ? '' : anchor?.before,
    }))
  }

  private apply(mode: InsertMode) {
    const session = this.session
    if (!session) return
    // Hide the popup first so focus can return to the editor, then insert.
    const shell = this.shell
    if (shell) shell.style.visibility = 'hidden'
    setTimeout(() => {
      void session.apply(mode).then(outcome => {
        if (outcome === 'inserted' || outcome === 'copied') this.close()
        else if (shell) shell.style.visibility = ''
      })
    }, 0)
  }
}
