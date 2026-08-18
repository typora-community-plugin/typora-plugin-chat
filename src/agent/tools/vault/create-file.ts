import type { ToolDefinition, ToolResult, ToolSummary } from '@/config/types'
import { createFile, fileExists, relativePathToRoot } from '@/adapter/vault'
import { undoStore } from '@/store/undo-store'


export const createFileSchema: ToolDefinition = {
  name: 'create_file',
  description: 'Create a new file in the vault. Fails if the file already exists.',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Vault-relative path for the new file.' },
      content: { type: 'string', description: 'Initial file content.' },
    },
    required: ['path', 'content'],
  },
}

export const summarizeCreateFile: ToolSummary = (input) => {
  const path = input.path
  return typeof path === 'string' && path ? relativePathToRoot(path) : '(no path)'
}

export async function executeCreateFile(input: Record<string, unknown>, turnId?: string): Promise<ToolResult> {
  const targetPath = input.path as string
  const content = (input.content as string) ?? ''
  if (!targetPath) return { content: 'create_file failed: path is required', isError: true }
  try {
    // Record the before-state: a fresh file has no prior content (kind 'absent'),
    // so undo = delete it again. If the path already exists, createFile will
    // throw and we skip the push — nothing was written to revert.
    if (!(await fileExists(targetPath))) {
      undoStore.push({ file: targetPath, op: 'create', before: { kind: 'absent' }, turnId: turnId ?? '' })
    }
    await createFile(targetPath, content)
    return { content: `Created ${targetPath}.` }
  } catch (error: any) {
    return { content: `create_file failed: ${error.message || error}`, isError: true }
  }
}
