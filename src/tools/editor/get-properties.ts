import type { ToolDefinition, ToolResult, ToolSummary } from '../../config/types'
import { readDocument } from '../../adapter/vault'
import { parseFrontmatter } from '../../utils/helpers'


export const getPropertiesSchema: ToolDefinition = {
  name: 'get_properties',
  description: 'Read YAML frontmatter properties of a markdown document. Omit `path` for the active document.',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Optional vault-relative path to the markdown file.' },
    },
    required: [],
  },
}

export const summarizeGetProperties: ToolSummary = (input) => {
  const path = input.path
  return typeof path === 'string' && path ? path : '(active document)'
}

export async function executeGetProperties(input: Record<string, unknown>): Promise<ToolResult> {
  const targetPath = typeof input.path === 'string' ? input.path : undefined
  try {
    const markdown = await readDocument(targetPath)
    const properties = parseFrontmatter(markdown)
    if (!properties) return { content: 'No frontmatter found.' }
    return { content: JSON.stringify(properties, null, 2) }
  } catch (error: any) {
    return { content: `get_properties failed: ${error.message || error}`, isError: true }
  }
}
