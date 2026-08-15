import { app } from '@typora-community-plugin/core'
import type { ToolResult } from '../config/types'
import { listFiles, readFile, resolveVaultPath } from '../adapter/vault'
import { basename } from '../utils/helpers'


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
  } catch (error) {
    return { content: `get_backlinks failed: ${error.message || error}`, isError: true }
  }
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
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

export async function executeGetCurrentDatetime(): Promise<ToolResult> {
  const now = new Date()
  return { content: now.toString() }
}
