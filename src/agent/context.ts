import { app } from '@typora-community-plugin/core'
import { listFiles } from '@/adapter/vault'
import { basename } from '@/utils/helpers'


/**
 * Dynamic vault context. Kept short and appended as a user message right
 * after the static system prompt so the cacheable prefix is undisturbed.
 */
export async function buildContextMessage(): Promise<string> {
  const vaultName = basename(app.vault.path || 'Vault')
  let fileCount = 0
  try {
    const files = await listFiles('', 'md')
    fileCount = files.length
  } catch {
    fileCount = 0
  }
  const activeFile = app.workspace.activeFile
  const active = activeFile ? ` Active document: ${activeFile}.` : ''
  return `[Context: Vault "${vaultName}" with ${fileCount} markdown file(s).${active}]`
}
