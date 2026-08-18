/**
 * In-memory undo stack for the `/undo` slash command.
 *
 * Scope: current session only. The stack is intentionally NOT persisted and is
 * cleared on session switch / new session / conversation clear / view close so
 * that an undo never reaches across a session boundary (the plan's hard rule).
 *
 * Each entry records the before-image of exactly one write-tool call, so `/undo`
 * pops the most recent entry and reverses it. No arguments: one press = one step.
 */

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
  file: string
  op: UndoOp
  before: UndoSnapshot
  /** For rename entries only: the path the file moved to. */
  newFile?: string
}

/** Cap on stack depth so a very long session cannot exhaust memory. */
export const MAX_UNDO = 50

class UndoStack {
  private entries: UndoEntry[] = []

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
    const last = this.entries[this.entries.length - 1]
    this.entries.pop()
    return last
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
}

/** Module-level singleton; one stack per plugin view instance. */
export const undoStore = new UndoStack()
