import type { ToolResult } from '../config/types'
import { readDocument, writeDocument } from '../adapter/vault'
import { parseFrontmatter, stringifyYamlScalar } from '../utils/helpers'


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

export async function executeGetProperties(input: Record<string, unknown>): Promise<ToolResult> {
  const targetPath = typeof input.path === 'string' ? input.path : undefined
  try {
    const markdown = await readDocument(targetPath)
    const properties = parseFrontmatter(markdown)
    if (!properties) return { content: 'No frontmatter found.' }
    return { content: JSON.stringify(properties, null, 2) }
  } catch (error) {
    return { content: `get_properties failed: ${error.message || error}`, isError: true }
  }
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
  } catch (error) {
    return { content: `set_properties failed: ${error.message || error}`, isError: true }
  }
}
