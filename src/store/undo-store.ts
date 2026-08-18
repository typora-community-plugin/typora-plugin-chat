/**
 * In-memory undo/redo stacks for the `/undo` and `/redo` slash commands.
 *
 * Scope: current session only. The stacks are intentionally NOT persisted and
 * are cleared on session switch / new session / conversation clear / view close
 * so that an undo or redo never reaches across a session boundary.
 *
 * Undo: each entry records the before-image of exactly one write-tool call,
 * tagged with the `turnId` of the agent turn that made it. `/undo` pops ALL
 * entries of the most recent turn and reverses them in chronological order
 * (oldest first), so the whole previous turn's file mutations are rolled back
 * together. The popped data is captured into a RedoEntry for potential replay.
 *
 * Redo: each entry preserves the agent history slice that `/undo` removed, plus
 * the original tool inputs. `/redo` pushes the slice back into agent history and
 * re-executes every write-tool call so the file mutations are restored.
 */

import type { ApiMessage, ChatMessage } from '@/config/types'

export type UndoOp =
  | 'replace_all'
  | 'find_replace'
  | 'insert'
  | 'create'
  | 'delete'
  | 'rename'
  | 'set_properties'

/** Before-image of a file at the moment just before a write tool mutates it. */
export interface UndoSnapshot {
  /** `absent` means the file did not exist before the operation (e.g. create_file). */
  kind: 'content' | 'absent'
  /** Full text captured before the mutation; undefined when kind === 'absent'. */
  content?: string
  /** True when the before-image was read from the active editor buffer rather than disk. */
  wasActiveDoc?: boolean
}

export interface UndoEntry {
  ts: number
  /** Agent turn that produced this write tool call (see loop.ts). */
  turnId: string
  file: string
  op: UndoOp
  before: UndoSnapshot
  /** For rename entries only: the path the file moved to. */
  newFile?: string
  /** The original tool name that produced this entry — used by /redo to re-execute. */
  toolName?: string
  /** The original tool input — used by /redo to re-execute with identical parameters. */
  toolInput?: Record<string, unknown>
}

/** A single write-tool invocation captured for redo replay. */
export interface RedoToolCall {
  name: string
  input: Record<string, unknown>
}

/** Captured data needed by `/redo` to restore a rolled-back turn. */
export interface RedoEntry {
  ts: number
  /** The agent history messages that were removed by /undo (user + assistant + tool blocks). */
  historySlice: ApiMessage[]
  /** Original user message text for re-insertion into the chat transcript. */
  userText: string | null
  /** Write-tool calls to re-execute, in original order. */
  toolCalls: RedoToolCall[]
  /** The chat transcript messages that were removed from the UI by /undo (set post-hoc). */
  chatMessages?: ChatMessage[]
}

/** Cap on stack depth so a very long session cannot exhaust memory. */
export const MAX_UNDO = 200

class UndoStack {
  private entries: UndoEntry[] = []
  /** Redo buffer: at most one entry (the most recent undo). */
  private redoEntries: RedoEntry[] = []

  push(entry: Omit<UndoEntry, 'ts'>): void {
    this.entries.push({ ...entry, ts: Date.now() })
    if (this.entries.length > MAX_UNDO) {
      // Drop the oldest; keep only the most recent MAX_UNDO.
      this.entries = this.entries.slice(this.entries.length - MAX_UNDO)
    }
  }

  /** Remove and return the most recent entry, or null when empty. */
  pop(): UndoEntry | null {
    if (this.entries.length === 0) return null
    const last = this.entries[this.entries.length - 1]!
    this.entries.pop()
    return last
  }

  /**
   * Remove and return ALL entries belonging to the most recent turn, in
   * chronological order (oldest first) so callers can reverse them in the
   * original execution order. Returns null when the stack is empty.
   */
  popTurn(): UndoEntry[] | null {
    if (this.entries.length === 0) return null
    const turnId = this.entries[this.entries.length - 1]!.turnId
    const removed: UndoEntry[] = []
    while (this.entries.length > 0 && this.entries[this.entries.length - 1]!.turnId === turnId) {
      removed.push(this.entries.pop()!)
    }
    // `removed` is newest-first; flip to oldest-first for reversal.
    return removed.reverse()
  }

  peek(): UndoEntry | undefined {
    return this.entries[this.entries.length - 1]
  }

  clear(): void {
    this.entries = []
  }

  get length(): number {
    return this.entries.length
  }

  get isEmpty(): boolean {
    return this.entries.length === 0
  }

  // ─── Redo stack ────────────────────────────────────────────────────────

  /** Store the captured data from a completed /undo. Replaces any previous redo entry. */
  pushRedo(entry: Omit<RedoEntry, 'ts'>): void {
    this.redoEntries = [{ ...entry, ts: Date.now() }]
  }

  /** Supplement the most recent redo entry with chat transcript messages (set after UI removal). */
  setRedoChatMessages(msgs: ChatMessage[]): void {
    if (this.redoEntries.length > 0) {
      this.redoEntries[0]!.chatMessages = msgs
    }
  }

  /** Remove and return the stored redo entry, or null when none exists. */
  popRedo(): RedoEntry | null {
    if (this.redoEntries.length === 0) return null
    return this.redoEntries.pop()!
  }

  clearRedo(): void {
    this.redoEntries = []
  }

  get redoAvailable(): boolean {
    return this.redoEntries.length > 0
  }
}

/** Module-level singleton; one stack per plugin view instance. */
export const undoStore = new UndoStack()
