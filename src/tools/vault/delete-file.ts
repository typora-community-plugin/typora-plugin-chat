import type { ToolDefinition, ToolResult, ToolSummary } from '../../config/types'
import { deleteFile, relativePathToRoot } from '../../adapter/vault'


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

export async function executeDeleteFile(input: Record<string, unknown>): Promise<ToolResult> {
  const targetPath = input.path as string
  if (!targetPath) return { content: 'delete_file failed: path is required', isError: true }
  try {
    await deleteFile(targetPath)
    return { content: `Deleted ${targetPath}.` }
  } catch (error: any) {
    return { content: `delete_file failed: ${error.message || error}`, isError: true }
  }
}
