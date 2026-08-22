/**
 * `/redo` slash-command replay logic.
 *
 * Restores the most recently undone turn by re-inserting its agent history
 * slice and re-executing every write-tool call that was originally performed
 * (in original order). Read-only tools are NOT replayed — they have no side
 * effects to restore.
 *
 * The actual orchestration (popping the redo entry, re-inserting chat messages)
 * lives in App.svelte; this module only handles the agent-history + tool-replay
 * portion so it stays testable without UI dependencies.
 */

import type { ToolResult } from '@/config/types'
import { executeTool } from '../executor'
import { currentMode } from '@/agent/modes'
import type { RedoEntry } from '@/store/undo-store'
import { setAgentHistory, getAgentHistory } from '@/agent/history'

/**
 * Replay the write-tool calls of a captured redo entry and re-insert its
 * agent history slice. Returns a summary ToolResult.
 */
export async function replayRedoEntry(entry: RedoEntry): Promise<ToolResult> {
  // Defense in depth: redo re-executes write tools, so it must respect the mode gate.
  if (!currentMode().canUndoRedo()) {
    return { content: 'Read Only 模式下无法重做', isError: true }
  }

  // 1. Re-insert the agent history slice so future model calls see the context.
  if (entry.historySlice.length > 0) {
    const current = getAgentHistory()
    setAgentHistory([...current, ...entry.historySlice])
  }

  // 2. Re-execute write-tool calls in original order.
  if (entry.toolCalls.length === 0) {
    return { content: 'ok' }
  }

  const results: ToolResult[] = []
  for (const call of entry.toolCalls) {
    try {
      const result = await executeTool(call.name, call.input, {})
      results.push(result)
    } catch (error: any) {
      results.push({ content: `redo 失败（${call.name}）：${error.message || error}`, isError: true })
    }
  }

  if (results.length === 1) {
    return results[0] ?? { content: '没有可重做的操作' }
  }

  // Multiple steps. On full success the caller shows nothing, so only build a
  // summary when at least one step failed; overall error only when ALL failed.
  const failures = results.filter((r) => r.isError)
  if (failures.length === 0) {
    return { content: 'ok' }
  }
  const lines = [`${failures.length} / ${results.length} 步操作失败：`]
  for (const f of failures) {
    lines.push(`- ${f.content}`)
  }
  return { content: lines.join('\n'), isError: failures.length === results.length }
}
