import { afterEach, describe, expect, it } from 'vitest'
import { mockApp, mockFs } from '../setup'
import { vaultIndex } from '../../src/adapter/vault-index'

const originalPath = mockApp.vault.path

afterEach(() => {
  mockApp.vault.path = originalPath
  vaultIndex.invalidateAll()
})

describe('vaultIndex cancellation', () => {
  it('passes the signal to fs.listFiles and rejects when the build is aborted', async () => {
    mockApp.vault.path = '/vault'
    vaultIndex.invalidateAll()

    let receivedSignal: AbortSignal | undefined
    mockFs.listFiles.mockImplementation((_root: string, options?: { signal?: AbortSignal }) => {
      receivedSignal = options?.signal
      return new Promise((_resolve, reject) => {
        options?.signal?.addEventListener('abort', () => {
          const error = new Error('Aborted')
          error.name = 'AbortError'
          reject(error)
        })
      })
    })
    mockFs.readText.mockResolvedValue('')

    const controller = new AbortController()
    const build = vaultIndex.ensureFresh(controller.signal)
    controller.abort()

    await expect(build).rejects.toMatchObject({ name: 'AbortError' })
    expect(receivedSignal).toBeInstanceOf(AbortSignal)
    expect(receivedSignal?.aborted).toBe(true)
  })
})
