import { app, fs, path } from '@typora-community-plugin/core'
import { isMarkdownFile } from '@/utils/helpers'
import { isPathForbidden } from '@/agent/tools/path-policy'
import { vaultIndex } from './vault-index'


/**
 * Thin wrapper around the Typora community plugin `fs` adapter.
 * All paths are vault-relative unless noted otherwise.
 */

function throwIfForbidden(vaultPath: string): void {
  const rel = relativePathToRoot(vaultPath)
  if (isPathForbidden(rel)) {
    throw new Error(`Forbidden path: ${rel} cannot be listed, read or modified`)
  }
}

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
  throwIfForbidden(vaultPath)
  return fs.readText(resolveVaultPath(vaultPath))
}

export async function writeFile(vaultPath: string, content: string): Promise<void> {
  throwIfForbidden(vaultPath)
  const absolute = resolveVaultPath(vaultPath)
  await ensureParentDir(absolute)
  await fs.writeText(absolute, content)
  vaultIndex.invalidate(vaultPath)
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
  throwIfForbidden(vaultPath)
  const absolute = resolveVaultPath(vaultPath)
  const current = await fs.readText(absolute)
  if (!current.includes(find)) {
    throw new Error(`find_replace failed: text not found in ${vaultPath}`)
  }
  const next = current.replace(find, replacement)
  await fs.writeText(absolute, next)
  vaultIndex.invalidate(vaultPath)
  return next
}

export async function insertText(
  vaultPath: string,
  content: string,
  position: 'beginning' | 'end' | 'after_frontmatter' = 'end',
): Promise<void> {
  throwIfForbidden(vaultPath)
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
  vaultIndex.invalidate(vaultPath)
}

export async function createFile(vaultPath: string, content: string): Promise<void> {
  throwIfForbidden(vaultPath)
  if (await fileExists(vaultPath)) {
    throw new Error(`create_file failed: ${vaultPath} already exists`)
  }
  await writeFile(vaultPath, content) // invalidate is called inside writeFile
}

export async function renameFile(vaultPath: string, newPath: string): Promise<void> {
  throwIfForbidden(vaultPath)
  throwIfForbidden(newPath)
  await fs.move(resolveVaultPath(vaultPath), resolveVaultPath(newPath))
  vaultIndex.invalidate(vaultPath)
  vaultIndex.invalidate(newPath)
}

export async function deleteFile(vaultPath: string): Promise<void> {
  throwIfForbidden(vaultPath)
  const absolute = resolveVaultPath(vaultPath)
  if (!(await fs.exists(absolute))) {
    throw new Error(`delete_file failed: ${vaultPath} does not exist`)
  }
  await fs.trash(absolute)
  vaultIndex.invalidate(vaultPath)
}

export async function listFiles(folder = '', extension?: string): Promise<string[]> {
  await vaultIndex.ensureFresh()
  const all = vaultIndex.listAll().filter(f => !isPathForbidden(f))
  let filtered: string[]
  if (extension) {
    const ext = `.${extension.toLowerCase()}`
    filtered = all.filter(f => f.toLowerCase().endsWith(ext))
  } else {
    filtered = all
  }
  if (!folder) return filtered
  // Filter to the requested folder (prefix match on vault-relative path).
  const prefix = folder.replace(/\\/g, '/') + '/'
  return filtered.filter(f => f.startsWith(prefix) || f === folder)
}

/** @deprecated Use `vaultIndex.search()` directly — returns richer results with snippets. */
export async function searchFiles(query: string, searchContent: boolean, limit = 20): Promise<string[]> {
  const matches = await vaultIndex.search(query, searchContent, limit)
  return matches.map(m => m.file)
}

export function getCurrentFilePath(): string | null {
  const active = app.workspace.activeFile
  return active || null
}

/** Read a vault document or the active editor content when path is omitted. */
export async function readDocument(path?: string): Promise<string> {
  if (!path) return getActiveDocumentContent()
  throwIfForbidden(path)
  return readFile(path)
}

/** Write a vault document or update the active editor when path is omitted. */
export async function writeDocument(path: string | undefined, content: string): Promise<void> {
  if (path) {
    throwIfForbidden(path)
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
