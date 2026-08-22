/**
 * `/undo` slash-command tool.
 *
 * Reverses ALL write-tool calls recorded on the in-memory undo stack (see
 * `@/store/undo-store`) that belong to the most recent agent turn, popping them
 * together and reversing them in chronological order (oldest first) so the net
 * effect is exactly "the previous turn never happened". No parameters: one
 * invocation = one whole turn rolled back.
 *
 * The stack is session-scoped and cleared on session switch / new / clear /
 * close, so an undo can never reach across a session boundary.
 */

import { app } from '@typora-community-plugin/core'
import type { ToolDefinition, ToolResult, ApiMessage } from '@/config/types'
import { deleteFile, writeFile } from '@/adapter/vault'
import { currentMode } from '@/agent/modes'
import { undoStore, type UndoEntry, type RedoToolCall } from '@/store/undo-store'
import { getAgentHistory } from '@/agent/history'

export const undoSchema: ToolDefinition = {
  name: 'undo',
  description: 'Undo all file mutations made by write tools in the most recent agent turn of this session.',
  parameters: { type: 'object', properties: {} },
}

/**
 * Reverse one undo entry. All I/O failures are surfaced to the caller as an
 * error ToolResult; the entry has already been popped at that point so we do
 * not retry the same step twice.
 */
async function reverseEntry(entry: UndoEntry): Promise<ToolResult> {
  switch (entry.op) {
    case 'create': {
      // The file did not exist before — delete it again to restore state.
      try {
        await deleteFile(entry.file)
        return { content: `已撤销 create：删除了 ${entry.file}` }
      } catch (error: any) {
        return { content: `undo 失败（create）：${error.message || error}`, isError: true }
      }
    }

    case 'delete': {
      // The file was trashed — write its captured text back.
      try {
        await writeFile(entry.file, entry.before.content ?? '')
        return { content: `已撤销 delete：恢复了 ${entry.file}` }
      } catch (error: any) {
        return { content: `undo 失败（delete）：${error.message || error}`, isError: true }
      }
    }

    case 'rename': {
      // The file was moved to entry.newFile — move it back. If the reverse
      // move fails, fall back to writing the captured content at the old path
      // (best-effort; a partial state is better than leaving nothing).
      const from = entry.newFile ?? entry.file
      try {
        await deleteFile(from)
        await writeFile(entry.file, entry.before.content ?? '')
        return { content: `已撤销 rename：${entry.newFile} → ${entry.file}` }
      } catch (error: any) {
        // Last resort: just write the captured text at the old path.
        try {
          await writeFile(entry.file, entry.before.content ?? '')
          return { content: `undo 部分完成（rename）：已写回 ${entry.file}，但 ${from} 可能仍存在`, isError: true }
        } catch (fallbackError: any) {
          return { content: `undo 失败（rename）：${fallbackError.message || fallbackError}`, isError: true }
        }
      }
    }

    case 'replace_all':
    case 'find_replace':
    case 'insert':
    case 'set_properties': {
      // Generic content restore. For the active document we go through the
      // editor so Typora sees the change live; for vault files we write disk.
      try {
        if (entry.before.wasActiveDoc) {
          app.workspace.activeEditor.setMarkdown(entry.before.content ?? '')
        } else {
          await writeFile(entry.file, entry.before.content ?? '')
        }
        return { content: `已撤销 ${entry.op}：${entry.file}` }
      } catch (error: any) {
        return { content: `undo 失败（${entry.op}）：${error.message || error}`, isError: true }
      }
    }

    default:
      return { content: `undo 失败：未知操作 ${(entry as UndoEntry).op}`, isError: true }
  }
}

/**
 * Extract the last user turn's messages from agent history (everything from
 * the last role='user' message to the end). Used by /undo to capture what will
 * be removed, so /redo can re-insert it.
 */
function extractLastTurnHistory(history: ApiMessage[]): { slice: ApiMessage[]; userText: string | null } {
  let i = history.length - 1
  while (i >= 0 && history[i]!.role !== 'user') i--
  if (i < 0) return { slice: [], userText: null }
  const slice = history.slice(i)
  const first = slice[0]!
  const userText = typeof first.content === 'string' ? first.content : null
  return { slice, userText }
}

export async function executeUndo(): Promise<ToolResult> {
  // Defense in depth: undo is a write-back, so it must respect the same mode
  // gate as every other mutating tool.
  if (!currentMode().canUndoRedo()) {
    return { content: 'Read Only 模式下无法撤销', isError: true }
  }

  const entries = undoStore.popTurn()
  if (!entries || entries.length === 0) {
    return { content: '没有可撤销的操作' }
  }

  // Capture the agent history slice BEFORE it is removed by App.svelte's
  // popLastAgentTurn(), so /redo can re-insert it later.
  const currentHistory = getAgentHistory()
  const { slice, userText } = extractLastTurnHistory(currentHistory)

  // Collect original tool calls (name + input) from the undo entries for redo replay.
  const toolCalls: RedoToolCall[] = entries
    .filter((e): e is UndoEntry & { toolName: string; toolInput: Record<string, unknown> } => !!e.toolName && !!e.toolInput)
    .map((e) => ({ name: e.toolName!, input: e.toolInput! }))

  // Store redo data so /redo can restore this turn.
  undoStore.pushRedo({ historySlice: slice, userText, toolCalls })

  // Reverse in chronological order (oldest first): the net effect is exactly
  // "the previous turn's mutations never happened". A single failure does not
  // stop the rest — each entry was already popped, and we continue so later
  // steps are not left stranded.
  const results: ToolResult[] = []
  for (const entry of entries) {
    results.push(await reverseEntry(entry))
  }

  if (results.length === 1) {
    return results[0] ?? { content: '没有可撤销的操作' }
  }

  // Multiple steps: merge into a single summary. The overall result is an error
  // only when EVERY step failed; partial failures are reported inline so the
  // user can see what was and was not rolled back.
  const failed = results.filter((r) => r.isError).length
  const lines = [`已撤销上一轮 ${results.length} 步操作（${failed ? `其中 ${failed} 步失败` : '全部成功'}）：`]
  for (const r of results) {
    lines.push(r.isError ? `- ⚠️ ${r.content}` : `- ✅ ${r.content}`)
  }
  return { content: lines.join('\n'), isError: failed === results.length }
}
