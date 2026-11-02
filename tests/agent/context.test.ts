import { afterEach, describe, expect, it, vi } from 'vitest'
import { mockApp, mockFs } from '../setup'
import { buildContextMessage } from '../../src/agent/context'
import { vaultIndex } from '../../src/adapter/vault-index'

const originalPath = mockApp.vault.path

afterEach(() => {
  mockApp.vault.path = originalPath
  vaultIndex.invalidateAll()
})

describe('buildContextMessage', () => {
  it('never walks the filesystem root when no folder is open (macOS reports "/")', async () => {
    mockApp.vault.path = '/'
    mockFs.listFiles.mockImplementation(() => new Promise(() => {})) // would hang forever

    const text = await buildContextMessage()

    expect(text).toContain('No vault folder is open')
    expect(mockFs.listFiles).not.toHaveBeenCalled()
  })

  it('reports the file count once the index is ready', async () => {
    mockApp.vault.path = '/vault'
    vaultIndex.invalidateAll()
    mockFs.listFiles.mockResolvedValue(['/vault/a.md', '/vault/b.md', '/vault/c.txt'])
    mockFs.readText.mockResolvedValue('')

    const text = await buildContextMessage(1000)

    expect(text).toContain('with 2 markdown file(s)')
  })

  // Keep last: the never-resolving build stays in flight for the module.
  it('does not wait longer than the budget for a slow index build', async () => {
    mockApp.vault.path = '/slow-vault'
    vaultIndex.invalidateAll()
    mockFs.listFiles.mockImplementation(() => new Promise(() => {})) // never resolves

    const started = Date.now()
    const text = await buildContextMessage(50)

    expect(Date.now() - started).toBeLessThan(1000)
    expect(text).toContain('index still building')
  })
})
