/**
 * `/undo` slash-command tool.
 *
 * Reverses the most recent write-tool call recorded on the in-memory undo stack
 * (see `@/store/undo-store`). No parameters: one invocation = one step. The
 * stack is session-scoped and cleared on session switch / new / clear / close,
 * so an undo can never reach across a session boundary.
 */

import { app } from '@typora-community-plugin/core'
import type { ToolDefinition, ToolResult } from '@/config/types'
import { deleteFile, readFile, writeFile } from '@/adapter/vault'
import { currentAgentMode } from '../permissions'
import { undoStore, type UndoEntry } from '@/store/undo-store'

export const undoSchema: ToolDefinition = {
  name: 'undo',
  description: 'Undo the most recent file mutation made by a write tool in this session.',
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

export async function executeUndo(): Promise<ToolResult> {
  // Defense in depth: undo is a write-back, so it must respect the same mode
  // gate as every other mutating tool.
  if (currentAgentMode() === 'read-only') {
    return { content: 'Read Only 模式下无法撤销', isError: true }
  }

  const entry = undoStore.pop()
  if (!entry) {
    return { content: '没有可撤销的操作' }
  }
  return reverseEntry(entry)
}
