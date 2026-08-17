import { app, fs, path } from '@typora-community-plugin/core'
import { isMarkdownFile } from '../utils/helpers'


/**
 * Thin wrapper around the Typora community plugin `fs` adapter.
 * All paths are vault-relative unless noted otherwise.
 */

export function vaultRoot(): string {
  return app.vault.path
}

/** Normalize any path to be relative to the vault root. */
export function relativePathToRoot(absOrRel: string): string {
  const root = app.vault.path
  if (path.isAbsolute(absOrRel) && absOrRel.startsWith(root)) {
    let rel = absOrRel.slice(root.length)
    // strip leading separator(s)
    while (rel.startsWith('/') || rel.startsWith('\\')) {
      rel = rel.slice(1)
    }
    return rel || '.'
  }
  return absOrRel
}

export function resolveVaultPath(vaultPath: string): string {
  if (path.isAbsolute(vaultPath)) return vaultPath
  return path.join(app.vault.path, vaultPath)
}

async function ensureParentDir(filepath: string): Promise<void> {
  const dir = path.dirname(filepath)
  if (dir && dir !== app.vault.path) {
    try {
      await fs.mkdir(dir)
    } catch {
      /* parent may already exist */
    }
  }
}

export async function readFile(vaultPath: string): Promise<string> {
  return fs.readText(resolveVaultPath(vaultPath))
}

export async function writeFile(vaultPath: string, content: string): Promise<void> {
  const absolute = resolveVaultPath(vaultPath)
  await ensureParentDir(absolute)
  await fs.writeText(absolute, content)
}

export async function fileExists(vaultPath: string): Promise<boolean> {
  return fs.exists(resolveVaultPath(vaultPath))
}

export async function findReplace(
  vaultPath: string,
  find: string,
  replacement: string,
  position?: string,
): Promise<string> {
  const absolute = resolveVaultPath(vaultPath)
  const current = await fs.readText(absolute)
  if (!current.includes(find)) {
    throw new Error(`find_replace failed: text not found in ${vaultPath}`)
  }
  const next = current.replace(find, replacement)
  await fs.writeText(absolute, next)
  return next
}

export async function insertText(
  vaultPath: string,
  content: string,
  position: 'beginning' | 'end' | 'after_frontmatter' = 'end',
): Promise<void> {
  const absolute = resolveVaultPath(vaultPath)
  const current = await fs.readText(absolute)
  let next: string
  if (position === 'beginning') {
    next = `${content}\n${current}`
  } else if (position === 'after_frontmatter') {
    if (current.startsWith('---\n')) {
      const end = current.indexOf('\n---', 4)
      if (end !== -1) {
        const close = end + 4
        next = `${current.slice(0, close)}\n${content}${current.slice(close)}`
      } else {
        next = `${current}\n${content}`
      }
    } else {
      next = `${content}\n${current}`
    }
  } else {
    next = `${current}\n${content}`
  }
  await fs.writeText(absolute, next)
}

export async function createFile(vaultPath: string, content: string): Promise<void> {
  if (await fileExists(vaultPath)) {
    throw new Error(`create_file failed: ${vaultPath} already exists`)
  }
  await writeFile(vaultPath, content)
}

export async function renameFile(vaultPath: string, newPath: string): Promise<void> {
  await fs.move(resolveVaultPath(vaultPath), resolveVaultPath(newPath))
}

export async function deleteFile(vaultPath: string): Promise<void> {
  const absolute = resolveVaultPath(vaultPath)
  if (!(await fs.exists(absolute))) {
    throw new Error(`delete_file failed: ${vaultPath} does not exist`)
  }
  try {
    await fs.trash(absolute)
  } catch {
    await fs.remove(absolute)
  }
}

export async function listFiles(folder = '', extension?: string): Promise<string[]> {
  const dir = folder ? resolveVaultPath(folder) : app.vault.path
  const files = await fs.listFiles(dir, { recursive: true })
  const root = app.vault.path
  return files
    .map(file => file.startsWith(root) ? file.slice(root.length + 1) : file)
    .filter(file => !extension || file.toLowerCase().endsWith(`.${extension.toLowerCase()}`))
    .sort()
}

export async function searchFiles(query: string, searchContent: boolean, limit = 20): Promise<string[]> {
  const files = await listFiles('', 'md')
  const needle = query.toLowerCase()
  const results: string[] = []
  const cap = Math.min(Math.max(limit, 1), 50)

  for (const file of files) {
    if (results.length >= cap) break
    if (file.toLowerCase().includes(needle)) {
      results.push(file)
      continue
    }
    if (searchContent) {
      try {
        const content = await readFile(file)
        if (content.toLowerCase().includes(needle)) results.push(file)
      } catch {
        /* skip unreadable files */
      }
    }
  }
  return results
}

export function getCurrentFilePath(): string | null {
  const active = app.workspace.activeFile
  return active || null
}

/** Read a vault document or the active editor content when path is omitted. */
export async function readDocument(path?: string): Promise<string> {
  return path ? readFile(path) : getActiveDocumentContent()
}

/** Write a vault document or update the active editor when path is omitted. */
export async function writeDocument(path: string | undefined, content: string): Promise<void> {
  if (path) {
    await writeFile(path, content)
    return
  }
  app.workspace.activeEditor.setMarkdown(content)
}

export async function getActiveDocumentContent(): Promise<string> {
  try {
    return app.workspace.activeEditor.getMarkdown()
  } catch {
    const activeFile = getCurrentFilePath()
    if (activeFile) return readFile(activeFile)
    throw new Error('No active document')
  }
}

export async function isMarkdown(filePath: string): Promise<boolean> {
  return isMarkdownFile(filePath)
}
