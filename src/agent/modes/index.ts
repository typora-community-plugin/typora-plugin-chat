import type { AgentMode } from '@/config/types'
import { settingsManager } from '@/config/settings'
import { SUBAGENT_EXCLUDED_TOOLS, isReadTool, isWriteTool } from '../tools/permissions'
import { workspaceWriteStrategy } from './workspace-write'
import { readOnlyStrategy } from './read-only'
import { chatOnlyStrategy } from './chat-only'

/**
 * Agent access-mode strategies (Strategy Pattern).
 *
 * Each mode strategy owns one slice of the mode branching that used to be
 * scattered across permissions.ts / executor.ts / system-prompt.ts / subagent.ts
 * / undo-redo / context-usage-store: tool visibility, executor blocking copy,
 * system-prompt line, and undo/redo write-back gating.
 */
export interface AgentModeStrategy {
  /** Stable id matching the `AgentMode` union value (used as settings/UI key). */
  readonly id: AgentMode
  /** i18n key of the human-readable label shown in the mode dropdown. */
  readonly labelKey: string
  /** Whether a tool is visible/executable to the model under this mode. */
  toolAllowed(name: string): boolean
  /** Executor defense-in-depth block message; null when execution is allowed. */
  blockReason(name: string): string | null
  /** Line appended to the system prompt (may be empty). */
  systemPromptLine(): string
  /** Whether /undo and /redo may write file state back under this mode. */
  canUndoRedo(): boolean
}

const MODES: readonly AgentModeStrategy[] = [
  chatOnlyStrategy,
  readOnlyStrategy,
  workspaceWriteStrategy,
] as const

/** All registered strategies in dropdown display order (chat-only → read-only → workspace-write). */
export const ALL_MODES: readonly AgentModeStrategy[] = MODES

/** Mutable list for UI iteration; append new strategies here to extend the dropdown. */
export function listModes(): AgentModeStrategy[] {
  return [...MODES]
}

/** Normalize any stored value back to a known mode id. */
export function normalizeMode(mode: unknown): AgentMode {
  if (mode === 'read-only' || mode === 'chat-only') return mode
  return 'workspace-write'
}

/** Look up a strategy by its id; falls back to the default workspace-write. */
export function getMode(id: AgentMode | string = normalizeMode(settingsManager.get().mode)): AgentModeStrategy {
  const normalized = typeof id === 'string' ? normalizeMode(id) : 'workspace-write'
  return MODES.find((m) => m.id === normalized) ?? workspaceWriteStrategy
}

/** The strategy for the live settings mode. */
export function currentMode(): AgentModeStrategy {
  return getMode()
}

/** Whether a tool may be exposed to a SUB agent under the given mode (no escalation). */
export function subAgentToolAllowed(name: string, mode: AgentMode = normalizeMode(settingsManager.get().mode)): boolean {
  return getMode(mode).toolAllowed(name) && !SUBAGENT_EXCLUDED_TOOLS.has(name)
}

/** Re-exported so existing consumers keep importing from the modes module. */
export { isWriteTool, isReadTool }
