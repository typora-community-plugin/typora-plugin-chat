/**
 * In-memory redo stack for the `/redo` slash command.
 *
 * Scope: current session only (same hard rule as undoStore). Stores the entries
 * and user message that were rolled back by a single `/undo`, so `/redo` can
 * re-execute the original write-tool calls and restore the chat turn.
 *
 * Only ONE level of redo is supported (the most recent /undo). A second /undo
 * overwrites any pending redo, matching typical editor behavior.
 */

import type { UndoEntry } from './undo-store'

/** Cap on how many undone turns we keep in memory. */
const MAX_REDO = 50

export interface RedoRecord {
  /** The undo entries that were reversed (chronological order). */
  entries: UndoEntry[]
  /** The user message text that was removed from the transcript by /undo. */
  userText: string | null
}

class RedoStack {
  private records: RedoRecord[] = []

  push(record: Omit<RedoRecord, never>): void {
    this.records.push(record)
    if (this.records.length > MAX_REDO) {
      this.records = this.records.slice(this.records.length - MAX_REDO)
    }
  }

  /** Remove and return the most recent redo record, or null when empty. */
  pop(): RedoRecord | null {
    if (this.records.length === 0) return null
    return this.records.pop()!
  }

  peek(): RedoRecord | undefined {
    return this.records[this.records.length - 1]
  }

  clear(): void {
    this.records = []
  }

  get length(): number {
    return this.records.length
  }

  get isEmpty(): boolean {
    return this.records.length === 0
  }
}

/** Module-level singleton; one stack per plugin view instance. */
export const redoStore = new RedoStack()
