import type { ApiMessage } from '@/config/types'
import { cleanInlineOutput } from './inline-prompts'

export type InlinePhase = 'idle' | 'running' | 'done' | 'empty' | 'error' | 'aborted'

export interface InlineState {
  phase: InlinePhase
  result: string
  error: string
}

export type InsertMode = 'replace' | 'after'

/** Side effects, injected so the state machine can be unit-tested. */
export interface InlineDeps {
  /** Send one request; resolves with the reply text. Must honor `signal`. */
  send(messages: ApiMessage[], signal: AbortSignal): Promise<string>
  /**
   * Whether inserting is still safe: an editor anchor exists and the note
   * was not edited since it was captured.
   */
  canInsert(): boolean
  /** Insert at the captured anchor; false if the editor refused. */
  insert(markdown: string, mode: InsertMode): boolean
  /** Write to the clipboard; false if it failed (no focus, no permission…). */
  copy(text: string): Promise<boolean>
  /** Show a transient message to the user. */
  notify(message: string): void
}

export interface InlineMessages {
  insertNoAnchor: string
  insertFailed: string
  copyFailed: string
}

export type ApplyOutcome = 'inserted' | 'copied' | 'failed' | 'nothing'

/**
 * State machine behind the inline popup: run → (done | empty | error |
 * aborted), retry, apply. Every await is guarded by a request id, so a stale
 * reply (e.g. after Stop, close-and-reopen, or a retry) never touches the
 * current state.
 */
export class InlineSession {
  private requestId = 0
  private controller: AbortController | null = null
  private lastMessages: ApiMessage[] | null = null
  private listeners = new Set<(state: InlineState) => void>()
  private disposed = false
  state: InlineState = { phase: 'idle', result: '', error: '' }

  constructor(private deps: InlineDeps, private text: InlineMessages) {}

  onChange(listener: (state: InlineState) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  get running(): boolean {
    return this.state.phase === 'running'
  }

  private set(patch: Partial<InlineState>) {
    if (this.disposed) return
    this.state = { ...this.state, ...patch }
    this.listeners.forEach(fn => fn(this.state))
  }

  async run(messages: ApiMessage[]): Promise<void> {
    if (this.disposed) return
    this.controller?.abort()
    const id = ++this.requestId
    const controller = new AbortController()
    this.controller = controller
    this.lastMessages = messages
    this.set({ phase: 'running', result: '', error: '' })
    try {
      const text = await this.deps.send(messages, controller.signal)
      if (id !== this.requestId) return
      const result = cleanInlineOutput(text)
      this.set(result ? { phase: 'done', result } : { phase: 'empty', result: '' })
    } catch (error) {
      if (id !== this.requestId) return
      if (controller.signal.aborted) this.set({ phase: 'aborted' })
      else this.set({ phase: 'error', error: error instanceof Error ? error.message : String(error) })
    } finally {
      if (id === this.requestId) this.controller = null
    }
  }

  retry(): Promise<void> {
    return this.lastMessages ? this.run(this.lastMessages) : Promise.resolve()
  }

  abort() {
    this.controller?.abort()
  }

  /**
   * Insert the result at the captured anchor. Without a usable anchor (opened
   * from the command panel, focus elsewhere, or the note changed meanwhile)
   * it falls back to the clipboard instead of guessing a position.
   */
  async apply(mode: InsertMode): Promise<ApplyOutcome> {
    const text = this.state.result
    if (this.state.phase !== 'done' || !text) return 'nothing'
    if (this.deps.canInsert() && this.deps.insert(text, mode)) return 'inserted'
    const copied = await this.deps.copy(text)
    const reason = this.deps.canInsert() ? this.text.insertFailed : this.text.insertNoAnchor
    this.deps.notify(copied ? reason : this.text.copyFailed)
    return copied ? 'copied' : 'failed'
  }

  copy(): Promise<boolean> {
    return this.state.result ? this.deps.copy(this.state.result) : Promise.resolve(false)
  }

  /** Abort any request and ignore every late reply. */
  dispose() {
    this.requestId++
    this.controller?.abort()
    this.controller = null
    this.disposed = true
    this.listeners.clear()
  }
}
