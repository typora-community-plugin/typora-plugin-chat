import { app } from '@typora-community-plugin/core'
import type { ToolDefinition, ToolResult, ToolSummary } from '@/config/types'
import { listFiles, readFile, resolveVaultPath, relativePathToRoot } from '@/adapter/vault'
import { basename } from '@/utils/helpers'


export const getBacklinksSchema: ToolDefinition = {
  name: 'get_backlinks',
  description: 'Find notes that link to the given document. Omit `path` for the active document.',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Optional vault-relative path to the markdown file.' },
    },
    required: [],
  },
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export const summarizeGetBacklinks: ToolSummary = (input) => {
  const path = input.path
  return typeof path === 'string' && path ? relativePathToRoot(path) : '(active document)'
}

export async function executeGetBacklinks(input: Record<string, unknown>): Promise<ToolResult> {
  const targetPath = typeof input.path === 'string' ? input.path : app.workspace.activeFile
  if (!targetPath) return { content: 'get_backlinks failed: no active document and no path given', isError: true }

  try {
    const targetName = basename(targetPath).replace(/\.md$/i, '')
    const files = await listFiles('', 'md')
    const backlinks: string[] = []
    for (const file of files) {
      if (file === targetPath) continue
      try {
        const content = await readFile(file)
        const wikilink = new RegExp(`\\[\\[${escapeRegExp(targetName)}(?:\\.[^|\\]]+)?(?:\\|[^\\]]+)?\\]\\]`, 'i')
        const mdLink = new RegExp(`\\]\\([^)]*${escapeRegExp(targetName)}(?:\\.md)?\\)`, 'i')
        if (wikilink.test(content) || mdLink.test(content)) backlinks.push(file)
      } catch {
        /* skip unreadable */
      }
    }
    if (!backlinks.length) return { content: 'No backlinks found.' }
    return { content: `${backlinks.length} backlink(s):\n${backlinks.map(f => `- ${f}`).join('\n')}` }
  } catch (error: any) {
    return { content: `get_backlinks failed: ${error.message || error}`, isError: true }
  }
}
