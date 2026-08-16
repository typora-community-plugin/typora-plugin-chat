import { app } from '@typora-community-plugin/core'
import type { ToolDefinition, ToolResult, ToolSummary } from '../../config/types'
import { findReplace, getActiveDocumentContent, insertText, readFile, writeFile } from '../../adapter/vault'


export const editDocumentSchema: ToolDefinition = {
  name: 'edit_document',
  description:
    'Edit a markdown document atomically. Use `replace_all` to overwrite the whole file, ' +
    '`find_replace` for surgical edits (preferred), or `insert` to add content at beginning/end/after_frontmatter. ' +
    'Omit `path` to edit the currently active document.',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Optional vault-relative path. Defaults to active document.' },
      operation: {
        type: 'string',
        enum: ['replace_all', 'find_replace', 'insert'],
        description: 'The edit operation to perform.',
      },
      content: { type: 'string', description: 'New content (replace_all), replacement text (find_replace), or text to insert (insert).' },
      find: { type: 'string', description: 'Exact text to find, required for find_replace.' },
      position: {
        type: 'string',
        enum: ['beginning', 'end', 'after_frontmatter'],
        description: 'Insert position, required for insert.',
      },
    },
    required: ['operation'],
  },
}

async function readTarget(path?: string): Promise<string> {
  return path ? readFile(path) : getActiveDocumentContent()
}

async function writeTarget(path: string | undefined, content: string): Promise<void> {
  if (path) {
    await writeFile(path, content)
    return
  }
  // Active document: update through the editor so Typora sees the change live.
  app.workspace.activeEditor.setMarkdown(content)
}

function findInText(text: string, find: string): string | null {
  return text.includes(find) ? text.replace(find, '') : null
}

export const summarizeEditDocument: ToolSummary = (input) => {
  const parts: string[] = []
  if (typeof input.path === 'string' && input.path) parts.push(input.path)
  return parts.length ? parts.join(', ') : '(no parameters)'
}

export async function executeEditDocument(input: Record<string, unknown>): Promise<ToolResult> {
  const targetPath = typeof input.path === 'string' ? input.path : undefined
  const operation = input.operation as string
  const content = input.content as string
  const find = input.find as string
  const position = (input.position as 'beginning' | 'end' | 'after_frontmatter') ?? 'end'

  try {
    if (operation === 'replace_all') {
      if (typeof content !== 'string') {
        return { content: 'edit_document failed: content is required for replace_all', isError: true }
      }
      await writeTarget(targetPath, content)
      return { content: `Replaced entire document${targetPath ? ` ${targetPath}` : ''}.` }
    }

    if (operation === 'find_replace') {
      if (typeof find !== 'string' || typeof content !== 'string') {
        return { content: 'edit_document failed: find and content are required for find_replace', isError: true }
      }
      if (targetPath) {
        await findReplace(targetPath, find, content)
      } else {
        const current = await getActiveDocumentContent()
        const updated = findInText(current, find)
        if (updated === null) {
          return { content: 'edit_document failed: text not found in active document', isError: true }
        }
        app.workspace.activeEditor.setMarkdown(updated)
      }
      return { content: `find_replace succeeded${targetPath ? ` in ${targetPath}` : ''}.` }
    }

    if (operation === 'insert') {
      if (typeof content !== 'string') {
        return { content: 'edit_document failed: content is required for insert', isError: true }
      }
      if (targetPath) {
        await insertText(targetPath, content, position)
      } else {
        const current = await getActiveDocumentContent()
        let next: string
        if (position === 'beginning') next = `${content}\n${current}`
        else if (position === 'after_frontmatter' && current.startsWith('---\n')) {
          const end = current.indexOf('\n---', 4)
          if (end !== -1) {
            const close = end + 4
            next = `${current.slice(0, close)}\n${content}${current.slice(close)}`
          } else {
            next = `${current}\n${content}`
          }
        } else {
          next = `${current}\n${content}`
        }
        app.workspace.activeEditor.setMarkdown(next)
      }
      return { content: `insert succeeded${targetPath ? ` in ${targetPath}` : ''}.` }
    }

    return { content: `edit_document failed: unknown operation "${operation}"`, isError: true }
  } catch (error: any) {
    return { content: `edit_document failed: ${error.message || error}`, isError: true }
  }
}
