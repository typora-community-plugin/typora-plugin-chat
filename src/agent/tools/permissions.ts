import type { AgentMode } from '@/config/types'
import * as modes from '@/agent/modes'


/**
 * Agent write-permission helpers.
 *
 * This module only owns the tool CLASSIFICATION (write vs read) and the
 * sub-agent exclusion set — the per-mode policy itself lives in the strategy
 * classes under `@/agent/modes` (Strategy Pattern):
 * - `read-only`: write tools hidden + blocked; read tools stay available.
 * - `chat-only`: every vault/editor file tool (read + write) is hidden from
 *   the model; only non-file tools remain available.
 * - `workspace-write`: all tools are available (default, preserves legacy
 *   behavior).
 */

/** Tools that mutate vault/editor content and must be gated in non-write modes. */
export const WRITE_TOOL_NAMES: ReadonlySet<string> = new Set([
  'edit_document',
  'set_properties',
  'create_file',
  'delete_file',
  'rename_file',
])

/** Tools that read vault/editor content; blocked by `chat-only`. */
export const READ_TOOL_NAMES: ReadonlySet<string> = new Set([
  'read_document',
  'get_properties',
  'open_document',
  'read_file',
  'search_vault',
  'list_files',
])

// NOTE: `web_fetch` and `subbrowser` are deliberately NOT file tools — they
// only read remote content (fetch / embedded iframe) and never touch the
// vault, so they stay available in every mode.

export function isWriteTool(name: string): boolean {
  return WRITE_TOOL_NAMES.has(name)
}

export function isReadTool(name: string): boolean {
  return READ_TOOL_NAMES.has(name)
}

/** Whether a tool may run under the given mode (defaults to the live mode). */
export function toolAllowed(name: string, mode: AgentMode = modes.getMode().id): boolean {
  return modes.getMode(mode).toolAllowed(name)
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
export function subAgentToolAllowed(name: string, mode: AgentMode = modes.getMode().id): boolean {
  return modes.subAgentToolAllowed(name, mode)
}

// Re-export the strategy layer so existing consumers keep importing from here.
export const currentAgentMode = (): AgentMode => modes.currentMode().id
export { getMode, normalizeMode, listModes, currentMode } from '@/agent/modes'
