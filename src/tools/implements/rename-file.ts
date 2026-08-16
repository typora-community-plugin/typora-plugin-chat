import type { ToolDefinition, ToolResult } from '../../config/types'
import { renameFile } from '../../adapter/vault'


export const renameFileSchema: ToolDefinition = {
  name: 'rename_file',
  description: 'Rename or move a file inside the vault.',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Current vault-relative path.' },
      new_path: { type: 'string', description: 'New vault-relative path.' },
    },
    required: ['path', 'new_path'],
  },
}

export async function executeRenameFile(input: Record<string, unknown>): Promise<ToolResult> {
  const targetPath = input.path as string
  const newPath = input.new_path as string
  if (!targetPath || !newPath) {
    return { content: 'rename_file failed: path and new_path are required', isError: true }
  }
  try {
    await renameFile(targetPath, newPath)
    return { content: `Renamed ${targetPath} → ${newPath}.` }
  } catch (error) {
    return { content: `rename_file failed: ${error.message || error}`, isError: true }
  }
}
