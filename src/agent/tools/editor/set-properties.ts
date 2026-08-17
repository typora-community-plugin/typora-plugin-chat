import type { ToolDefinition, ToolResult, ToolSummary } from '@/config/types'
import { readDocument, relativePathToRoot, writeDocument } from '@/adapter/vault'
import { parseFrontmatter, stringifyYamlScalar } from '@/utils/helpers'


export const setPropertiesSchema: ToolDefinition = {
  name: 'set_properties',
  description:
    'Set/update YAML frontmatter properties of a markdown document. Properties are merged into ' +
    'existing ones; a null value removes that property. Omit `path` for the active document.',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Optional vault-relative path to the markdown file.' },
      properties: {
        type: 'object',
        description: 'Map of frontmatter properties to set (use null value to delete a key).',
      },
    },
    required: ['properties'],
  },
}

function mergeFrontmatter(markdown: string, properties: Record<string, unknown>): string {
  const existing = parseFrontmatter(markdown) ?? {}

  for (const [key, value] of Object.entries(properties)) {
    if (value === null) delete existing[key]
    else existing[key] = value
  }

  const yaml = `---\n${Object.entries(existing)
    .map(([key, value]) => `${key}: ${stringifyYamlScalar(value)}`)
    .join('\n')}\n---`

  if (markdown.startsWith('---\n')) {
    const end = markdown.indexOf('\n---', 4)
    if (end !== -1) return `${yaml}${markdown.slice(end + 4)}`
  }
  return `${yaml}\n${markdown}`
}

export const summarizeSetProperties: ToolSummary = (input) => {
  const parts: string[] = []
  if (typeof input.path === 'string' && input.path) parts.push(relativePathToRoot(input.path))
  return parts.length ? parts.join(', ') : '(no parameters)'
}

export async function executeSetProperties(input: Record<string, unknown>): Promise<ToolResult> {
  const targetPath = typeof input.path === 'string' ? input.path : undefined
  const properties = input.properties as Record<string, unknown> | undefined
  if (!properties || typeof properties !== 'object') {
    return { content: 'set_properties failed: properties object is required', isError: true }
  }
  try {
    const markdown = await readDocument(targetPath)
    const updated = mergeFrontmatter(markdown, properties)
    await writeDocument(targetPath, updated)
    return { content: `Updated frontmatter${targetPath ? ` of ${targetPath}` : ''}.` }
  } catch (error: any) {
    return { content: `set_properties failed: ${error.message || error}`, isError: true }
  }
}
