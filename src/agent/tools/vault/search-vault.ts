import type { ToolDefinition, ToolResult, ToolSummary } from '@/config/types'
import { searchFiles } from '@/adapter/vault'


export const searchVaultSchema: ToolDefinition = {
  name: 'search_vault',
  description: 'Search the vault by file name or file content. Returns matching file paths with snippets.',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search query text.' },
      searchContent: {
        type: 'boolean',
        description: 'Search inside file contents (default true). When false, only file names are matched.',
        default: true,
      },
      limit: {
        type: 'number',
        description: 'Maximum number of results (default 20, max 50).',
        default: 20,
      },
    },
    required: ['query'],
  },
}

export const summarizeSearchVault: ToolSummary = (input, result) => {
  if (result?.isError) return 'search failed'
  if (typeof result?.content === `string`) {
    const m = result.content.match(/Found (\d+) file/)
    if (m) return `found ${m[1]} file(s)`
    if (/^No files found/.test(result.content)) return 'no matches'
  }
  const q = typeof input.query === `string` && input.query ? `"${input.query}"` : `(no query)`
  return `search ${q}`
}

export async function executeSearchVault(input: Record<string, unknown>): Promise<ToolResult> {
  const query = input.query as string
  if (!query) return { content: 'search_vault failed: query is required', isError: true }
  try {
    const searchContent = input.searchContent !== false
    const limit = typeof input.limit === 'number' ? input.limit : 20
    const results = await searchFiles(query, searchContent, limit)
    if (!results.length) return { content: `No files found for "${query}".` }
    return { content: `Found ${results.length} file(s):\n${results.map(f => `- ${f}`).join('\n')}` }
  } catch (error: any) {
    return { content: `search_vault failed: ${error.message || error}`, isError: true }
  }
}
