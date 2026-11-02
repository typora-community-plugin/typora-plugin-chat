import { describe, expect, it, vi } from 'vitest'

// Give the core mock an `os` with a known home directory for this file only.
vi.mock('@typora-community-plugin/core', async () => {
  const { mockApp, mockFs } = await import('../setup')
  return {
    app: mockApp,
    fs: mockFs,
    os: { homedir: () => '/Users/me' },
    path: { join: (...p: string[]) => p.join('/').replace(/\/+/g, '/'), isAbsolute: (p: string) => p.startsWith('/') },
  }
})

import { isIndexableRoot } from '../../src/adapter/vault-index'

describe('isIndexableRoot', () => {
  it('rejects missing roots and filesystem roots', () => {
    expect(isIndexableRoot('')).toBe(false)
    expect(isIndexableRoot(null)).toBe(false)
    expect(isIndexableRoot(undefined)).toBe(false)
    expect(isIndexableRoot('/')).toBe(false)
    expect(isIndexableRoot('C:\\')).toBe(false)
    expect(isIndexableRoot('D:/')).toBe(false)
  })

  it('rejects the user home directory (with or without trailing slash)', () => {
    expect(isIndexableRoot('/Users/me')).toBe(false)
    expect(isIndexableRoot('/Users/me/')).toBe(false)
  })

  it('accepts a normal vault folder, including one inside home', () => {
    expect(isIndexableRoot('/Users/me/notes')).toBe(true)
    expect(isIndexableRoot('/vault')).toBe(true)
    expect(isIndexableRoot('C:\\Users\\me\\notes')).toBe(true)
  })
})
