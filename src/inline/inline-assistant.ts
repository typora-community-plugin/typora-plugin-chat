import './inline-assistant.scss'
import { app, Notice } from '@typora-community-plugin/core'
import { sendMessage } from '@/api/client'
import { settingsManager } from '@/config/settings'
import { getActiveConfig } from '@/config/types'
import { isProviderEnabled } from '@/config/providers'
import { resolveContextWindow } from '@/agent/context-size'
import { isEditingNote } from '@/adapter/editor'
import type { EditorAnchor } from '@/adapter/editor'
import { renderMarkdown } from '@/utils/markdown-renderer'
import { basename } from '@/utils/helpers'
import { format, t } from '@/i18n'
import {
  ACTION_INSTRUCTIONS, ACTION_NEEDS_NOTE, CARET_ACTIONS, SELECTION_ACTIONS,
  buildInlineMessages, isBlockMarkdown, locateAnchor, noteCharBudget, windowNote,
} from './inline-prompts'
import type { InlineActionId } from './inline-prompts'
import { InlineSession } from './inline-session'
import type { InlineState, InsertMode } from './inline-session'

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
 * paste pipeline so tables and Mermaid diagrams render natively. The request
 * lifecycle lives in `InlineSession`; this class only renders it.
 */
export class InlineAssistant {
  private root: HTMLElement | null = null
  private input!: HTMLTextAreaElement
  private output!: HTMLElement
  private bar!: HTMLElement
  private anchor: EditorAnchor | null = null
  private session: InlineSession | null = null

  private readonly onKeydown = (e: KeyboardEvent) => {
    if (e.key !== 'Escape' || !this.root || e.isComposing) return
    // Only when focus is in the popup or back in the note: Esc in a dialog
    // opened on top (Settings, command panel…) belongs to that dialog.
    const modalOpen = Array.from(document.querySelectorAll<HTMLElement>('.typ-modal, .modal.in'))
      .some(el => !this.root!.contains(el) && el.getClientRects().length > 0)
    if (modalOpen) return
    const active = document.activeElement
    if ((active && this.root.contains(active)) || isEditingNote()) {
      e.preventDefault()
      e.stopPropagation()
      this.close()
    }
  }

  private readonly onMousedown = (e: MouseEvent) => {
    // Click outside closes only while idle with no result, so a stray click
    // never discards a generated answer.
    const phase = this.session?.state.phase
    if (this.root && !this.root.contains(e.target as Node) && (phase === 'idle' || phase === 'aborted')) this.close()
  }

  private readonly onReposition = () => this.position()

  get isOpen(): boolean {
    return !!this.root
  }

  toggle(anchor: EditorAnchor | null) {
    if (this.root) this.close()
    else this.open(anchor)
  }

  open(anchor: EditorAnchor | null) {
    this.close()
    this.anchor = anchor
    const tx = t.inline
    this.session = new InlineSession({
      send: async (messages, signal) => {
        const response = await sendMessage(settingsManager.get(), messages, [], signal)
        return response.content.filter(b => b.type === 'text').map(b => b.text ?? '').join('')
      },
      canInsert: () => !!this.anchor && !this.anchor.isStale(),
      insert: (markdown, mode) => !!this.anchor?.insert(markdown, mode, isBlockMarkdown(markdown)),
      copy: writeClipboard,
      notify,
    }, { insertNoAnchor: tx.insertNoAnchor, insertFailed: tx.insertFailed, copyFailed: tx.copyFailed })
    this.session.onChange(state => this.render(state))

    const selected = anchor?.text ?? ''
    const root = el('div', 'typ-inline-ai')
    if (selected) {
      const preview = selected.length > 60 ? selected.slice(0, 60) + '…' : selected
      root.append(el('div', 'typ-inline-ai__selection', `${format(tx.selected, { count: selected.length })}: ${preview}`))
    }

    const row = el('div', 'typ-inline-ai__row')
    this.input = el('textarea', 'typ-inline-ai__input')
    this.input.rows = 1
    this.input.placeholder = selected ? tx.askSelectionPlaceholder : tx.askPlaceholder
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && e.keyCode !== 229) {
        e.preventDefault()
        this.run(this.input.value, null)
      }
    })
    this.input.addEventListener('input', () => {
      this.input.style.height = 'auto'
      this.input.style.height = `${Math.min(this.input.scrollHeight, 120)}px`
    })
    const send = el('button', 'typ-inline-ai__send', '↵')
    send.addEventListener('click', () => this.run(this.input.value, null))
    row.append(this.input, send)

    const actions = el('div', 'typ-inline-ai__actions')
    for (const id of selected ? SELECTION_ACTIONS : CARET_ACTIONS) {
      const btn = el('button', 'typ-inline-ai__pill', tx.actions[id])
      btn.addEventListener('click', () => this.run(ACTION_INSTRUCTIONS[id], id))
      actions.append(btn)
    }

    this.output = el('div', 'typ-inline-ai__output')
    this.output.hidden = true
    this.bar = el('div', 'typ-inline-ai__bar')
    this.bar.hidden = true

    root.append(row, actions, this.output, this.bar)
    document.body.append(root)
    this.root = root
    this.position()

    window.addEventListener('resize', this.onReposition)
    document.addEventListener('scroll', this.onReposition, true)
    document.addEventListener('keydown', this.onKeydown, true)
    document.addEventListener('mousedown', this.onMousedown, true)
    setTimeout(() => this.input?.focus(), 0)
  }

  close() {
    this.session?.dispose()
    this.session = null
    this.anchor?.dispose()
    this.anchor = null
    if (!this.root) return
    this.root.remove()
    this.root = null
    window.removeEventListener('resize', this.onReposition)
    document.removeEventListener('scroll', this.onReposition, true)
    document.removeEventListener('keydown', this.onKeydown, true)
    document.removeEventListener('mousedown', this.onMousedown, true)
  }

  /** Keep the popup next to the caret and inside the viewport. */
  private position() {
    const root = this.root
    if (!root) return
    const margin = 12
    const vw = window.innerWidth
    const vh = window.innerHeight
    const width = Math.min(520, vw - margin * 2)
    root.style.width = `${width}px`
    root.style.maxHeight = `${vh - margin * 2}px`

    const rect = this.anchor?.rect() ?? document.querySelector('#write')?.getBoundingClientRect() ?? null
    const height = root.offsetHeight || 160
    let left = rect ? rect.left : (vw - width) / 2
    left = Math.max(margin, Math.min(left, vw - width - margin))
    let top = rect ? rect.bottom + 8 : vh / 3
    if (rect && top + height > vh - margin && rect.top - height - 8 > margin) top = rect.top - height - 8
    top = Math.max(margin, Math.min(top, vh - height - margin))
    root.style.left = `${left}px`
    root.style.top = `${top}px`
  }

  private showError(message: string) {
    this.output.hidden = false
    this.output.replaceChildren(el('div', 'typ-inline-ai__error', message))
  }

  /** Build the request for an instruction (quick action id, or null for free text). */
  private run(instruction: string, action: InlineActionId | null) {
    instruction = instruction.trim()
    const session = this.session
    if (!instruction || !session || session.running || !this.root) return
    const tx = t.inline
    const settings = settingsManager.get()
    if (!isProviderEnabled(settings.providers[settings.provider])) return this.showError(tx.providerDisabled)
    const config = getActiveConfig(settings)
    if (!config.model) return this.showError(tx.noModel)

    const anchor = this.anchor
    const selection = anchor?.markdown ?? ''
    let note = ''
    if (action === null || ACTION_NEEDS_NOTE[action]) {
      let full = ''
      try { full = app.workspace.activeEditor.getMarkdown() } catch { full = '' }
      const at = locateAnchor(full, { selection, before: anchor?.before, caretRatio: anchor?.caretRatio ?? undefined })
      note = windowNote(full, at, noteCharBudget(resolveContextWindow(config.model, config)))
    }
    const file = app.workspace.activeFile
    void session.run(buildInlineMessages({
      instruction,
      selection,
      note,
      title: file ? basename(file) : undefined,
      before: selection ? '' : anchor?.before,
    }))
  }

  /** Render the session state into the output area and the action bar. */
  private render(state: InlineState) {
    if (!this.root) return
    const tx = t.inline
    this.output.hidden = false
    this.bar.hidden = false
    const buttons: HTMLElement[] = []
    const add = (label: string, cls: string, onClick: (btn: HTMLButtonElement) => void) => {
      const btn = el('button', cls, label)
      btn.addEventListener('click', () => onClick(btn))
      buttons.push(btn)
    }

    switch (state.phase) {
      case 'running':
        this.output.replaceChildren(el('div', 'typ-inline-ai__pending', tx.thinking))
        add(tx.stop, 'typ-inline-ai__ghost', () => this.session?.abort())
        break
      case 'done': {
        this.output.replaceChildren()
        void renderMarkdown(state.result, this.output)
        const canInsert = !!this.anchor && !this.anchor.isStale()
        if (canInsert && this.anchor?.text) {
          add(tx.replace, 'typ-inline-ai__primary', () => this.apply('replace'))
          add(tx.insertAfter, 'typ-inline-ai__ghost', () => this.apply('after'))
        } else if (canInsert) {
          add(tx.insert, 'typ-inline-ai__primary', () => this.apply('replace'))
        }
        add(tx.copy, canInsert ? 'typ-inline-ai__ghost' : 'typ-inline-ai__primary', (btn) => {
          void this.session?.copy().then(ok => {
            btn.textContent = ok ? tx.copied : tx.copyFailed
          })
        })
        break
      }
      case 'empty':
        this.showError(tx.emptyReply)
        break
      case 'error':
        this.showError(format(tx.error, { message: state.error }))
        break
      case 'aborted':
        this.output.replaceChildren(el('div', 'typ-inline-ai__pending', tx.stopped))
        break
      default:
        this.output.hidden = true
        this.bar.hidden = true
        return
    }
    if (state.phase !== 'running') {
      add(tx.retry, 'typ-inline-ai__ghost', () => void this.session?.retry())
      add(tx.close, 'typ-inline-ai__ghost', () => this.close())
    }
    this.bar.replaceChildren(...buttons)
    this.position()
  }

  private apply(mode: InsertMode) {
    const session = this.session
    if (!session) return
    // Hide the popup first so focus can return to the editor, then insert.
    const root = this.root
    if (root) root.style.visibility = 'hidden'
    setTimeout(() => {
      void session.apply(mode).then(outcome => {
        if (outcome === 'inserted' || outcome === 'copied') this.close()
        else if (root) root.style.visibility = ''
      })
    }, 0)
  }
}
