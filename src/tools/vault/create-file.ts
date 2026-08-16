import type { ToolDefinition, ToolResult } from '../../config/types'
import { createFile } from '../../adapter/vault'


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

export async function executeCreateFile(input: Record<string, unknown>): Promise<ToolResult> {
  const targetPath = input.path as string
  const content = (input.content as string) ?? ''
  if (!targetPath) return { content: 'create_file failed: path is required', isError: true }
  try {
    await createFile(targetPath, content)
    return { content: `Created ${targetPath}.` }
  } catch (error: any) {
    return { content: `create_file failed: ${error.message || error}`, isError: true }
  }
}
