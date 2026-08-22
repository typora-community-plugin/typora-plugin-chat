import type { ToolDefinition, ToolResult, ToolSummary } from '@/config/types'
import { getActiveDocumentContent, readFile, relativePathToRoot } from '@/adapter/vault'


export const readDocumentSchema: ToolDefinition = {
  name: 'read_document',
  description: 'Read a markdown document. Omit `path` to read the currently active document.',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Optional vault-relative path to the markdown file.' },
    },
    required: [],
  },
}

export const summarizeReadDocument: ToolSummary = (input) => {
  const path = input.path
  return typeof path === 'string' && path ? relativePathToRoot(path) : '(active document)'
}

export async function executeReadDocument(input: Record<string, unknown>): Promise<ToolResult> {
  const targetPath = typeof input.path === 'string' ? input.path : undefined
  try {
    const content = targetPath ? await readFile(targetPath) : await getActiveDocumentContent()
    return { content }
  } catch (error: any) {
    return { content: `read_document failed: ${error.message || error}`, isError: true }
  }
}
