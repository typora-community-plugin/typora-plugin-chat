import { get, writable } from 'svelte/store'
import type { AgentMode, ApiMessage, ToolDefinition } from '@/config/types'
import { settings, settingsManager } from '@/config/settings'
import { getAgentHistory } from '@/agent/history'
import { buildContextMessage } from '@/agent/context'
import { buildSkillsCatalog, discoverSkills } from '@/agent/skills/index'
import { normalizeMode } from '@/agent/modes'
import { buildSystemMessage, filterTools } from '@/agent/request'
import { estimateRequestTokens, resolveContextWindow } from '@/agent/context-size'

export interface ContextUsageState {
  usedTokens: number
  totalTokens: number
  percent: number
  source: 'estimate' | 'api' | 'unknown'
  model: string
  totalKnown: boolean
}

export const contextUsage = writable<ContextUsageState>({
  usedTokens: 0,
  totalTokens: 0,
  percent: 0,
  source: 'unknown',
  model: '',
  totalKnown: false,
})

interface CachedOverhead {
  mode: AgentMode
  systemMessage: ApiMessage
  contextMessage: ApiMessage
  tools: ToolDefinition[]
}

let cachedOverhead: CachedOverhead | null = null
let refreshVersion = 0
let refreshHandle: ReturnType<typeof requestAnimationFrame> | null = null

async function buildCachedOverhead(mode: AgentMode): Promise<CachedOverhead> {
  const [skills, contextText] = await Promise.all([
    discoverSkills().catch(() => []),
    buildContextMessage().catch(() => '[Context unavailable]'),
  ])
  const skillsCatalog = buildSkillsCatalog(skills)
  return {
    mode,
    systemMessage: buildSystemMessage(skillsCatalog, mode),
    contextMessage: { role: 'user', content: contextText },
    tools: filterTools(mode),
  }
}

/** Recompute the estimated context usage for the current session/draft. */
export async function refreshContextUsage(
  options: { draft?: string; refreshStatic?: boolean } = {},
): Promise<void> {
  const version = ++refreshVersion
  const mode = normalizeMode(settingsManager.get().mode)

  if (!cachedOverhead || cachedOverhead.mode !== mode || options.refreshStatic) {
    try {
      // Rebuild the system-prompt/tools/vault-context overhead in the background.
      // The ring keeps showing its previous value until this settles, so a slow
      // filesystem scan can never make the UI look frozen or stale.
      const rebuilt = await buildCachedOverhead(mode)
      if (version !== refreshVersion) return
      cachedOverhead = rebuilt
    } catch {
      // Never let a failed overhead build hide the ring; fall back to a
      // minimal overhead so the estimate still reflects history/draft size.
      if (version !== refreshVersion) return
      cachedOverhead = {
        mode,
        systemMessage: buildSystemMessage('', mode),
        contextMessage: { role: 'user', content: '' },
        tools: filterTools(mode),
      }
    }
  }

  if (version !== refreshVersion) return

  const history = getAgentHistory()
  const trimmedDraft = options.draft?.trim() ?? ''
  const pendingMessage: ApiMessage = { role: 'user', content: options.draft ?? '' }
  const conversation: ApiMessage[] = trimmedDraft
    ? [...history, pendingMessage]
    : history
  const messages: ApiMessage[] = [cachedOverhead.systemMessage, cachedOverhead.contextMessage, ...conversation]
  const usedTokens = estimateRequestTokens(messages, cachedOverhead.tools)
  const totalTokens = resolveContextWindow(settingsManager.get().model, settingsManager.get())
  const totalKnown = totalTokens > 0

  contextUsage.set({
    usedTokens,
    totalTokens,
    percent: totalKnown ? Math.min(1, usedTokens / totalTokens) : 0,
    source: 'estimate',
    model: settingsManager.get().model,
    totalKnown,
  })
}

/** Record a real prompt-token count returned by the provider. */
export function setApiInputTokens(tokens: number): void {
  if (!Number.isFinite(tokens) || tokens < 0) return
  const totalTokens = resolveContextWindow(settingsManager.get().model, settingsManager.get())
  const totalKnown = totalTokens > 0
  contextUsage.set({
    usedTokens: Math.round(tokens),
    totalTokens,
    percent: totalKnown ? Math.min(1, tokens / totalTokens) : 0,
    source: 'api',
    model: settingsManager.get().model,
    totalKnown,
  })
}

/** Schedule a cheap draft-only refresh (avoids scanning skills/vault per keystroke). */
export function scheduleContextUsageRefresh(draft = ''): void {
  if (refreshHandle != null) cancelAnimationFrame(refreshHandle)
  refreshHandle = requestAnimationFrame(() => {
    refreshHandle = null
    void refreshContextUsage({ draft })
  })
}

// Keep the ring aligned with settings changes (mode, model, context window).
let lastSubscribedMode: AgentMode | null = null
settings.subscribe(($settings) => {
  const mode: AgentMode = normalizeMode($settings.mode)
  const modeChanged = lastSubscribedMode !== null && lastSubscribedMode !== mode
  lastSubscribedMode = mode
  void refreshContextUsage({ refreshStatic: modeChanged })
})

/** Synchronous accessor for non-reactive callers. */
export function getContextUsage(): ContextUsageState {
  return get(contextUsage)
}
