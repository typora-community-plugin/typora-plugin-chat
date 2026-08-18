import type { ToolDefinition, ToolResult, ToolSummary } from '@/config/types'
import { deleteFile, fileExists, readFile, relativePathToRoot } from '@/adapter/vault'
import { undoStore } from '@/store/undo-store'


export const deleteFileSchema: ToolDefinition = {
  name: 'delete_file',
  description: 'Move a file to the system trash. Fails if the file does not exist.',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Vault-relative path to delete.' },
    },
    required: ['path'],
  },
}

export const summarizeDeleteFile: ToolSummary = (input) => {
  const path = input.path
  return typeof path === 'string' && path ? relativePathToRoot(path) : '(no path)'
}

export async function executeDeleteFile(input: Record<string, unknown>, turnId?: string): Promise<ToolResult> {
  const targetPath = input.path as string
  if (!targetPath) return { content: 'delete_file failed: path is required', isError: true }
  try {
    // Capture the file's full text before trashing it so /undo can write it back.
    if (await fileExists(targetPath)) {
      const content = await readFile(targetPath).catch(() => '')
      undoStore.push({ file: targetPath, op: 'delete', before: { kind: 'content', content }, turnId: turnId ?? '', toolName: 'delete_file', toolInput: input })
    }
    await deleteFile(targetPath)
    return { content: `Deleted ${targetPath}.` }
  } catch (error: any) {
    return { content: `delete_file failed: ${error.message || error}`, isError: true }
  }
}
