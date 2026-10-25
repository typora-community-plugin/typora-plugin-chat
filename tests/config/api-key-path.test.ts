import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockApp, mockFs } from '../setup'


const KEY_FILE = 'typora-plugin-chat.apikey'
const originalConfig = mockApp.config

describe('API-key vault path', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.mocked(mockFs.readText).mockReset()
    vi.mocked(mockFs.readText).mockRejectedValue(new Error('missing'))
  })

  afterEach(() => {
    mockApp.config = originalConfig
  })

  it('uses the global config data dir when the core uses global config', async () => {
    mockApp.config = {
      configDir: '/global/.typora',
      dataDir: '/global/.typora/data',
      isUsingGlobalConfig: true,
    }

    await import('../../src/config/settings')

    expect(mockFs.readText).toHaveBeenCalledWith(`/global/.typora/data/${KEY_FILE}`)
  })

  it('uses the vault data dir when the core uses vault config', async () => {
    mockApp.config = {
      configDir: '/vault/.typora',
      dataDir: '/vault/.typora/data',
      isUsingGlobalConfig: false,
    }

    await import('../../src/config/settings')

    expect(mockFs.readText).toHaveBeenCalledWith(`/vault/.typora/data/${KEY_FILE}`)
  })
})
