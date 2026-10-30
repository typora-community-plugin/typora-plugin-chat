import './inline-assistant.scss'
import { app, Notice } from '@typora-community-plugin/core'
import { sendMessage } from '@/api/client'
import { settingsManager } from '@/config/settings'
import { getActiveConfig } from '@/config/types'
import { isProviderEnabled } from '@/config/providers'
import { captureSelection, insertMarkdownAt, snapshotRect } from '@/adapter/editor'
import type { SelectionSnapshot } from '@/adapter/editor'
import { renderMarkdown } from '@/utils/markdown-renderer'
import { t } from '@/i18n'
import {
  ACTION_INSTRUCTIONS, CARET_ACTIONS, SELECTION_ACTIONS,
  buildInlineMessages, cleanInlineOutput,
} from './inline-prompts'
import type { InlineActionId } from './inline-prompts'

/** English fallbacks, used before i18n is initialized (and in tests). */
const FALLBACK = {
  askPlaceholder: 'Ask AI to write something here…',
  askSelectionPlaceholder: 'What should AI do with the selection?',
  selected: 'Selected {count} chars',
  thinking: 'Generating…',
  replace: 'Replace',
  insert: 'Insert',
  insertAfter: 'Insert below',
  copy: 'Copy',
  copied: 'Copied',
  retry: 'Retry',
  close: 'Close',
  stop: 'Stop',
  noModel: 'No model selected. Pick one in the Chat sidebar or in Settings → Chat.',
  providerDisabled: 'The active provider is disabled. Enable it in Settings → Chat.',
  emptyReply: 'The model returned no content.',
  error: 'Error: {message}',
  insertFailed: 'Could not insert; the text was copied to the clipboard.',
  actions: {
    table: 'Table', diagram: 'Diagram', continue: 'Continue', outline: 'Outline',
    polish: 'Polish', shorten: 'Shorten', expand: 'Expand',
    translateEn: 'To English', translateZh: 'To Chinese', explain: 'Explain',
  } as Record<InlineActionId, string>,
}

type InlineTexts = typeof FALLBACK

function texts(): InlineTexts {
  const loc = (t as unknown as { inline?: Partial<InlineTexts> }).inline ?? {}
  return { ...FALLBACK, ...loc, actions: { ...FALLBACK.actions, ...(loc.actions ?? {}) } }
}

function fmt(template: string, params: Record<string, unknown>): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (params[k] === undefined ? m : String(params[k])))
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (cls) node.className = cls
  if (text !== undefined) node.textContent = text
  return node
}

function textBeforeCaret(snapshot: SelectionSnapshot | null): string {
  const range = snapshot?.range
  const write = document.querySelector('#write')
  if (!range || !write) return ''
  try {
    const before = document.createRange()
    before.setStart(write, 0)
    before.setEnd(range.startContainer, range.startOffset)
    return before.toString()
  } catch {
    return ''
  }
}

/**
 * A small popup anchored at the editor caret: one-shot generation (no tools)
 * with the active provider/model, previewed and then inserted via Typora's
 * paste pipeline so tables and Mermaid diagrams render natively.
 */
export class InlineAssistant {
  private root: HTMLElement | null = null
  private input!: HTMLTextAreaElement
  private output!: HTMLElement
  private bar!: HTMLElement
  private snapshot: SelectionSnapshot | null = null
  private controller: AbortController | null = null
  private result = ''
  private lastInstruction = ''

  private readonly onKeydown = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && this.root) {
      e.preventDefault()
      e.stopPropagation()
      this.close()
    }
  }

  private readonly onMousedown = (e: MouseEvent) => {
    // Click outside closes only while idle with no result, so a stray click
    // never discards a generated answer.
    if (this.root && !this.root.contains(e.target as Node) && !this.controller && !this.result) this.close()
  }

  private readonly onReposition = () => this.position()

  get isOpen(): boolean {
    return !!this.root
  }

  toggle(snapshot?: SelectionSnapshot | null) {
    if (this.root) this.close()
    else this.open(snapshot)
  }

  open(snapshot: SelectionSnapshot | null = captureSelection()) {
    this.close()
    this.snapshot = snapshot
    this.result = ''
    const tx = texts()
    const selected = snapshot?.text ?? ''

    const root = el('div', 'typ-inline-ai')
    if (selected) {
      const preview = selected.length > 60 ? selected.slice(0, 60) + '…' : selected
      root.append(el('div', 'typ-inline-ai__selection', `${fmt(tx.selected, { count: selected.length })}: ${preview}`))
    }

    const row = el('div', 'typ-inline-ai__row')
    this.input = el('textarea', 'typ-inline-ai__input')
    this.input.rows = 1
    this.input.placeholder = selected ? tx.askSelectionPlaceholder : tx.askPlaceholder
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && e.keyCode !== 229) {
        e.preventDefault()
        void this.run(this.input.value)
      }
    })
    this.input.addEventListener('input', () => {
      this.input.style.height = 'auto'
      this.input.style.height = `${Math.min(this.input.scrollHeight, 120)}px`
    })
    const send = el('button', 'typ-inline-ai__send', '↵')
    send.addEventListener('click', () => void this.run(this.input.value))
    row.append(this.input, send)

    const actions = el('div', 'typ-inline-ai__actions')
    for (const id of selected ? SELECTION_ACTIONS : CARET_ACTIONS) {
      const btn = el('button', 'typ-inline-ai__pill', tx.actions[id])
      btn.addEventListener('click', () => void this.run(ACTION_INSTRUCTIONS[id]))
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
    setTimeout(() => this.input.focus(), 0)
  }

  close() {
    this.controller?.abort()
    this.controller = null
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

    const rect = snapshotRect(this.snapshot) ?? document.querySelector('#write')?.getBoundingClientRect() ?? null
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

  async run(instruction: string) {
    instruction = instruction.trim()
    if (!instruction || this.controller || !this.root) return
    const tx = texts()
    const settings = settingsManager.get()
    if (!isProviderEnabled(settings.providers[settings.provider])) return this.showError(tx.providerDisabled)
    if (!getActiveConfig(settings).model) return this.showError(tx.noModel)

    this.lastInstruction = instruction
    this.result = ''
    this.output.hidden = false
    this.output.replaceChildren(el('div', 'typ-inline-ai__pending', tx.thinking))
    this.bar.hidden = false
    const stop = el('button', 'typ-inline-ai__ghost', tx.stop)
    stop.addEventListener('click', () => this.controller?.abort())
    this.bar.replaceChildren(stop)
    this.position()

    let note = ''
    try { note = app.workspace.activeEditor.getMarkdown() } catch { note = '' }
    const messages = buildInlineMessages({
      instruction,
      selection: this.snapshot?.text ?? '',
      note,
      title: app.workspace.activeFile ?? undefined,
      before: this.snapshot?.text ? '' : textBeforeCaret(this.snapshot),
    })

    const controller = new AbortController()
    this.controller = controller
    let failed = false
    try {
      const response = await sendMessage(settings, messages, [], controller.signal)
      const text = response.content
        .filter(b => b.type === 'text')
        .map(b => b.text ?? '')
        .join('')
      this.result = cleanInlineOutput(text)
      if (!this.result) {
        failed = true
        this.showError(tx.emptyReply)
      } else {
        this.output.replaceChildren()
        renderMarkdown(this.result, this.output)
        // Typora's renderer leaves some blocks (e.g. ```mermaid) empty in a
        // detached preview; they render fine once inserted. Show the source
        // instead of a blank box.
        if (!this.output.textContent?.trim()) {
          this.output.replaceChildren(el('pre', 'typ-inline-ai__source', this.result))
        }
      }
    } catch (error) {
      failed = true
      if (controller.signal.aborted) {
        this.output.replaceChildren(el('div', 'typ-inline-ai__pending', '—'))
      } else {
        this.showError(fmt(tx.error, { message: error instanceof Error ? error.message : String(error) }))
      }
    } finally {
      if (this.controller === controller) this.controller = null
    }
    if (this.root) this.renderBar(failed)
  }

  private renderBar(failed: boolean) {
    const tx = texts()
    const buttons: HTMLElement[] = []
    const add = (label: string, cls: string, onClick: (btn: HTMLButtonElement) => void) => {
      const btn = el('button', cls, label)
      btn.addEventListener('click', () => onClick(btn))
      buttons.push(btn)
    }
    if (!failed && this.result) {
      if (this.snapshot?.text) {
        add(tx.replace, 'typ-inline-ai__primary', () => this.apply('replace'))
        add(tx.insertAfter, 'typ-inline-ai__ghost', () => this.apply('after'))
      } else {
        add(tx.insert, 'typ-inline-ai__primary', () => this.apply('replace'))
      }
      add(tx.copy, 'typ-inline-ai__ghost', (btn) => {
        void navigator.clipboard?.writeText(this.result)
        btn.textContent = tx.copied
      })
    }
    add(tx.retry, 'typ-inline-ai__ghost', () => void this.run(this.lastInstruction))
    add(tx.close, 'typ-inline-ai__ghost', () => this.close())
    this.bar.replaceChildren(...buttons)
    this.position()
  }

  private apply(mode: 'replace' | 'after') {
    const text = this.result
    const snapshot = this.snapshot
    this.close()
    // Let the popup's focus release before restoring the editor selection.
    setTimeout(() => {
      if (!insertMarkdownAt(snapshot, text, mode)) {
        void navigator.clipboard?.writeText(text)
        const message = texts().insertFailed
        try { Notice.warning(message, 4000) } catch { console.warn('[chat]', message) }
      }
    }, 0)
  }
}
