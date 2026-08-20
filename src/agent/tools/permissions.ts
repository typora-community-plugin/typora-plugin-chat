import type { AgentMode } from '@/config/types'
import { settingsManager } from '@/config/settings'


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

// NOTE: `web_fetch` is deliberately NOT a write tool — it only reads remote
// content and never touches the vault, so it stays available in read-only mode.

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

// ---------------------------------------------------------------------------
// Sub-agent permission helpers (create_subagent)
//
// A sub agent INHERITS the caller's AgentMode — it can never widen its own
// tool set. `create_subagent` itself is not a write tool, but it must be
// hidden from sub agents so delegation cannot recurse without bound.
// ---------------------------------------------------------------------------

/** Tools removed from every SUB-agent's tool list (the parent owns delegation). */
export const SUBAGENT_EXCLUDED_TOOLS: ReadonlySet<string> = new Set([
  'create_subagent', // no unbounded recursion — the parent loop delegates instead
  'ask_user', // a sub agent must never interrupt the user mid-turn (plan p3-6)
])

/** Whether a tool may be exposed to a SUB agent under the given mode. */
export function subAgentToolAllowed(name: string, mode: AgentMode = currentAgentMode()): boolean {
  return toolAllowed(name, mode) && !SUBAGENT_EXCLUDED_TOOLS.has(name)
}

