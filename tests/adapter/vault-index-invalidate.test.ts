import { afterEach, describe, expect, it, vi } from 'vitest'
import { mockApp, mockFs } from '../setup'
import { vaultIndex } from '../../src/adapter/vault-index'

const originalPath = mockApp.vault.path

afterEach(() => {
  vaultIndex.invalidateAll()
  mockApp.vault.path = originalPath
})

describe('vaultIndex invalidation', () => {
  it('re-walks the filesystem after a folder is mounted following an unindexable root', async () => {
    // Typora reports '' when no folder is mounted: the empty result is cached.
    mockApp.vault.path = ''
    vaultIndex.invalidateAll()
    await vaultIndex.ensureFresh()
    expect(mockFs.listFiles).not.toHaveBeenCalled()
    expect(vaultIndex.count()).toBe(0)

    // Mounting a folder must not serve that cached empty result.
    mockApp.vault.path = '/vault'
    mockFs.listFiles.mockResolvedValue(['/vault/notes.md'])
    mockFs.readText.mockResolvedValue('')

    await vaultIndex.ensureFresh()

    expect(mockFs.listFiles).toHaveBeenCalledTimes(1)
    expect(mockFs.listFiles.mock.calls[0][0]).toBe('/vault')
    expect(vaultIndex.listAll()).toEqual(['notes.md'])
  })

  it('drops the old vault data when the root changes', async () => {
    mockApp.vault.path = '/old'
    vaultIndex.invalidateAll()
    mockFs.listFiles.mockResolvedValue(['/old/a.md', '/old/b.md'])
    mockFs.readText.mockResolvedValue('')
    await vaultIndex.ensureFresh()
    expect(vaultIndex.count()).toBe(2)

    mockApp.vault.path = '/new'
    mockFs.listFiles.mockResolvedValue(['/new/c.md'])
    await vaultIndex.ensureFresh()

    expect(vaultIndex.listAll()).toEqual(['c.md'])
  })

  it('aborts an in-flight walk and lets the replacement build complete', async () => {
    mockApp.vault.path = '/old'
    vaultIndex.invalidateAll()

    let firstSignal: AbortSignal | undefined
    mockFs.listFiles.mockImplementationOnce((_root: string, options?: { signal?: AbortSignal }) => {
      firstSignal = options?.signal
      return new Promise((_resolve, reject) => {
        options?.signal?.addEventListener('abort', () => {
          const error = new Error('Aborted')
          error.name = 'AbortError'
          reject(error)
        })
      })
    })

    const staleBuild = vaultIndex.ensureFresh()
    vaultIndex.invalidateAll()
    await expect(staleBuild).rejects.toMatchObject({ name: 'AbortError' })
    expect(firstSignal?.aborted).toBe(true)

    mockApp.vault.path = '/new'
    mockFs.listFiles.mockResolvedValue(['/new/only.md'])
    mockFs.readText.mockResolvedValue('')

    await vaultIndex.ensureFresh()
    // A second call is served from the fresh cache: the superseded build's
    // `finally` must not have cleared the replacement.
    await vaultIndex.ensureFresh()

    expect(mockFs.listFiles).toHaveBeenCalledTimes(2)
    expect(vaultIndex.listAll()).toEqual(['only.md'])
  })

  it('clears the index immediately on invalidateAll', async () => {
    mockApp.vault.path = '/vault'
    vaultIndex.invalidateAll()
    mockFs.listFiles.mockResolvedValue(['/vault/a.md'])
    mockFs.readText.mockResolvedValue('')
    await vaultIndex.ensureFresh()
    expect(vaultIndex.count()).toBe(1)

    vaultIndex.invalidateAll()

    expect(vaultIndex.count()).toBe(0)
    expect(vaultIndex.listAll()).toEqual([])
  })

  it('does not abort the replacement when an old waiter is cancelled', async () => {
    mockApp.vault.path = '/old'
    vaultIndex.invalidateAll()

    mockFs.listFiles.mockImplementationOnce((_root: string, options?: { signal?: AbortSignal }) => {
      return new Promise((_resolve, reject) => {
        options?.signal?.addEventListener('abort', () => {
          const error = new Error('Aborted')
          error.name = 'AbortError'
          reject(error)
        })
      })
    })
    const controller = new AbortController()
    const staleBuild = vaultIndex.ensureFresh(controller.signal)

    // Switch vaults: the old build is superseded and the new one starts.
    mockApp.vault.path = '/new'
    mockFs.listFiles.mockResolvedValue(['/new/a.md'])
    mockFs.readText.mockResolvedValue('')
    const freshBuild = vaultIndex.ensureFresh()

    // The old caller's Stop must not kill the build it is no longer waiting for.
    controller.abort()
    await expect(staleBuild).rejects.toMatchObject({ name: 'AbortError' })

    await expect(freshBuild).resolves.toBeUndefined()
    expect(vaultIndex.listAll()).toEqual(['a.md'])
  })
})
