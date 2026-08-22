import type { AgentMode } from '@/config/types'
import * as modes from '@/agent/modes'
/**
 * Agent write-permission helpers.
 *
 * Tool CLASSIFICATION (write vs read) and the sub-agent exclusion set live in
 * `./tool-groups`; the per-mode policy itself lives in the strategy classes
 * under `@/agent/modes` (Strategy Pattern):
 * - `read-only`: write tools hidden + blocked; read tools stay available.
 * - `chat-only`: every vault/editor file tool (read + write) is hidden from
 *   the model; only non-file tools remain available.
 * - `workspace-write`: all tools are available (default, preserves legacy
 *   behavior).
 */


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

/** Whether a tool may be exposed to a SUB agent under the given mode. */
export function subAgentToolAllowed(name: string, mode: AgentMode = modes.getMode().id): boolean {
  return modes.subAgentToolAllowed(name, mode)
}

// Re-export the strategy layer so existing consumers keep importing from here.
export const currentAgentMode = (): AgentMode => modes.currentMode().id
export { getMode, normalizeMode, listModes, currentMode } from '@/agent/modes'
