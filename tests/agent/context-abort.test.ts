import { afterEach, describe, expect, it } from 'vitest'
import { mockApp, mockFs } from '../setup'
import { buildContextMessage } from '../../src/agent/context'
import { vaultIndex } from '../../src/adapter/vault-index'

const originalPath = mockApp.vault.path

afterEach(() => {
  mockApp.vault.path = originalPath
  vaultIndex.invalidateAll()
})

describe('buildContextMessage cancellation', () => {
  it('propagates abort instead of reporting a zero-file vault', async () => {
    mockApp.vault.path = '/vault'
    vaultIndex.invalidateAll()
    mockFs.listFiles.mockImplementation((_root: string, options?: { signal?: AbortSignal }) => {
      return new Promise((_resolve, reject) => {
        options?.signal?.addEventListener('abort', () => {
          const error = new Error('Aborted')
          error.name = 'AbortError'
          reject(error)
        })
      })
    })

    const controller = new AbortController()
    const context = buildContextMessage(1000, controller.signal)
    controller.abort()

    await expect(context).rejects.toMatchObject({ name: 'AbortError' })
  })
})
