import { app } from '@typora-community-plugin/core'
import { isIndexableRoot, vaultIndex } from '@/adapter/vault-index'
import { basename } from '@/utils/helpers'


/**
 * How long a chat request may wait for the vault index before it is sent
 * anyway. A cold index on a large vault (or a slow filesystem bridge) must
 * never hold the user's message hostage; the build keeps running in the
 * background and later turns pick up the real count.
 */
export const CONTEXT_INDEX_BUDGET_MS = 1500

/**
 * Dynamic vault context. Kept short and appended as a user message right
 * after the static system prompt so the cacheable prefix is undisturbed.
 */
export async function buildContextMessage(
  budgetMs = CONTEXT_INDEX_BUDGET_MS,
  signal?: AbortSignal,
): Promise<string> {
  const root = app.vault.path
  const activeFile = app.workspace.activeFile
  const active = activeFile ? ` Active document: ${activeFile}.` : ''

  // Core now reports '' when no folder/document is mounted. Keep the extra
  // guard for a deliberately mounted root or home directory, which chat's own
  // vault index must never walk.
  if (!root || !isIndexableRoot(root)) {
    return `[Context: No vault folder is open; vault-wide file tools are unavailable.${active}]`
  }

  const vaultName = basename(root)
  let fileCount: number | null = 0
  try {
    const ready = await Promise.race([
      vaultIndex.ensureFresh(signal).then(() => true),
      new Promise<false>(resolve => setTimeout(() => resolve(false), budgetMs)),
    ])
    fileCount = ready ? vaultIndex.count() : null
  } catch (error) {
    if (signal?.aborted) throw error
    fileCount = 0
  }
  const files = fileCount === null ? 'markdown files (index still building)' : `${fileCount} markdown file(s)`
  return `[Context: Vault "${vaultName}" with ${files}.${active}]`
}
