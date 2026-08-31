import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockApp, mockFs } from '../setup'
import { appendAgentsMd, loadAgentsMd, resetAgentsMdCache } from '../../src/agent/agents-md'


describe('loadAgentsMd', () => {
  beforeEach(() => {
    vi.mocked(mockFs.exists).mockReset()
    vi.mocked(mockFs.readText).mockReset()
    resetAgentsMdCache()
  })

  it('returns an empty string when the vault has no path', async () => {
    const original = mockApp.vault.path
    ;(mockApp.vault as Record<string, unknown>).path = ''
    try {
      await expect(loadAgentsMd()).resolves.toBe('')
      expect(mockFs.exists).not.toHaveBeenCalled()
    } finally {
      ;(mockApp.vault as Record<string, unknown>).path = original
    }
  })

  it('returns an empty string when AGENTS.md does not exist', async () => {
    vi.mocked(mockFs.exists).mockResolvedValue(false)
    await expect(loadAgentsMd()).resolves.toBe('')
    expect(mockFs.readText).not.toHaveBeenCalled()
  })

  it('reads and trims the vault-root AGENTS.md', async () => {
    vi.mocked(mockFs.exists).mockResolvedValue(true)
    vi.mocked(mockFs.readText).mockResolvedValue('\n# Project rules\n- be kind\n')
    await expect(loadAgentsMd()).resolves.toBe('# Project rules\n- be kind')
    expect(mockFs.exists).toHaveBeenCalledWith('/vault/AGENTS.md')
  })

  it('returns an empty string for a whitespace-only file', async () => {
    vi.mocked(mockFs.exists).mockResolvedValue(true)
    vi.mocked(mockFs.readText).mockResolvedValue('   \n\t\n')
    await expect(loadAgentsMd()).resolves.toBe('')
  })

  it('truncates files larger than 32,000 chars', async () => {
    vi.mocked(mockFs.exists).mockResolvedValue(true)
    vi.mocked(mockFs.readText).mockResolvedValue('a'.repeat(40_000))
    const content = await loadAgentsMd()
    expect(content.length).toBe(32_000)
  })

  it('never throws when fs calls fail', async () => {
    vi.mocked(mockFs.exists).mockRejectedValue(new Error('boom'))
    await expect(loadAgentsMd()).resolves.toBe('')
  })

  it('serves the second call from cache within the TTL (no re-read)', async () => {
    vi.mocked(mockFs.exists).mockResolvedValue(true)
    vi.mocked(mockFs.readText).mockResolvedValue('rules v1')
    await loadAgentsMd()
    const firstReadCount = vi.mocked(mockFs.readText).mock.calls.length

    vi.mocked(mockFs.readText).mockResolvedValue('rules v2')
    const cached = await loadAgentsMd()
    expect(cached).toBe('rules v1')
    expect(vi.mocked(mockFs.readText).mock.calls.length).toBe(firstReadCount)
  })

  it('re-reads after the cache expires (TTL)', async () => {
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1_000_000)
    try {
      vi.mocked(mockFs.exists).mockResolvedValue(true)
      vi.mocked(mockFs.readText).mockResolvedValue('rules v1')
      await loadAgentsMd()

      nowSpy.mockReturnValue(1_000_000 + 61_000) // past the 60s TTL
      vi.mocked(mockFs.exists).mockResolvedValue(true)
      vi.mocked(mockFs.readText).mockResolvedValue('rules v2')
      await expect(loadAgentsMd()).resolves.toBe('rules v2')
    } finally {
      nowSpy.mockRestore()
    }
  })

  it('resetAgentsMdCache forces an immediate re-read', async () => {
    vi.mocked(mockFs.exists).mockResolvedValue(true)
    vi.mocked(mockFs.readText).mockResolvedValue('rules v1')
    await loadAgentsMd()
    const firstReadCount = vi.mocked(mockFs.readText).mock.calls.length

    resetAgentsMdCache()
    vi.mocked(mockFs.readText).mockResolvedValue('rules v2')
    await expect(loadAgentsMd()).resolves.toBe('rules v2')
    expect(vi.mocked(mockFs.readText).mock.calls.length).toBeGreaterThan(firstReadCount)
  })
})

describe('appendAgentsMd', () => {
  it('returns the prompt unchanged when AGENTS.md is empty or whitespace', () => {
    const base = 'You are Typora Chat.'
    expect(appendAgentsMd(base, '')).toBe(base)
    expect(appendAgentsMd(base, '   \n')).toBe(base)
    expect(appendAgentsMd(base)).toBe(base)
  })

  it('appends the project instructions section for non-empty content', () => {
    const base = 'You are Typora Chat.'
    const out = appendAgentsMd(base, '- rule one')
    expect(out).toBe(`${base}\n\n## Project instructions (AGENTS.md)\n- rule one`)
  })

  it('trims surrounding whitespace from the injected content', () => {
    const out = appendAgentsMd('base', '  - rule one  ')
    expect(out.endsWith('- rule one')).toBe(true)
  })
})
