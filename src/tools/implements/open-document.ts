import { app } from '@typora-community-plugin/core'
import type { ToolDefinition, ToolResult } from '../../config/types'
import { resolveVaultPath } from '../../adapter/vault'


export const openDocumentSchema: ToolDefinition = {
  name: 'open_document',
  description: 'Open a file in the Typora editor.',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Vault-relative path to the file to open.' },
    },
    required: ['path'],
  },
}

export async function executeOpenDocument(input: Record<string, unknown>): Promise<ToolResult> {
  const targetPath = input.path as string
  if (!targetPath) return { content: 'open_document failed: path is required', isError: true }
  try {
    app.workspace.activeEditor.openFile(resolveVaultPath(targetPath))
    return { content: `Opened ${targetPath}.` }
  } catch (error) {
    return { content: `open_document failed: ${error.message || error}`, isError: true }
  }
}
