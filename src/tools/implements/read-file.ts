import type { ToolDefinition, ToolResult } from '../../config/types'
import { readFile } from '../../adapter/vault'


export const readFileSchema: ToolDefinition = {
  name: 'read_file',
  description: 'Read any file in the vault as text (markdown or other text files).',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Vault-relative path to the file.' },
    },
    required: ['path'],
  },
}

export async function executeReadFile(input: Record<string, unknown>): Promise<ToolResult> {
  const targetPath = input.path as string
  if (!targetPath) return { content: 'read_file failed: path is required', isError: true }
  try {
    const content = await readFile(targetPath)
    return { content }
  } catch (error) {
    return { content: `read_file failed: ${error.message || error}`, isError: true }
  }
}
