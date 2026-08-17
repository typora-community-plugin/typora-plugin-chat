import type { AgentMode } from '../../config/types'
import { settingsManager } from '../../config/settings'


/**
 * Agent write-permission helpers.
 *
 * Modes:
 * - `read-only`: file-mutating tools are hidden from the model and blocked by
 *   the executor (defense in depth).
 * - `workspace-write`: all tools are available (default, preserves legacy
 *   behavior).
 */

/** Tools that mutate vault/editor content and must be gated in read-only mode. */
export const WRITE_TOOL_NAMES: ReadonlySet<string> = new Set([
  'edit_document',
  'set_properties',
  'create_file',
  'delete_file',
  'rename_file',
])

/** Resolve the current mode, normalizing any unexpected stored value. */
export function currentAgentMode(): AgentMode {
  const mode = settingsManager.get().mode
  return mode === 'read-only' ? 'read-only' : 'workspace-write'
}

export function isWriteTool(name: string): boolean {
  return WRITE_TOOL_NAMES.has(name)
}

/** Whether a tool may run under the given mode (defaults to the live mode). */
export function toolAllowed(name: string, mode: AgentMode = currentAgentMode()): boolean {
  return mode !== 'read-only' || !isWriteTool(name)
}
