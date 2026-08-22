import { beforeEach, describe, expect, it, vi } from 'vitest'
import { executeTool } from '../../src/agent/tools/executor'
import { settingsManager } from '../../src/config/settings'
import { mockFs } from '../setup'


describe('tool executor', () => {
  beforeEach(async () => {
    vi.mocked(mockFs.readText).mockReset()
    vi.mocked(mockFs.writeText).mockReset()
    vi.mocked(mockFs.exists).mockReset()
    vi.mocked(mockFs.readText).mockResolvedValue('# Hello\n\nworld')
    vi.mocked(mockFs.exists).mockResolvedValue(true)
    await settingsManager.save({ mode: 'workspace-write' })
  })

  it('read_document reads a vault file', async () => {
    const result = await executeTool('read_document', { path: 'notes/a.md' })

    expect(result.isError).toBeFalsy()
    expect(result.content).toBe('# Hello\n\nworld')
    expect(mockFs.readText).toHaveBeenCalledWith('/vault/notes/a.md')
  })

  it('edit_document find_replace writes the updated text', async () => {
    vi.mocked(mockFs.readText).mockResolvedValue('before old after')

    const result = await executeTool('edit_document', {
      path: 'notes/a.md',
      operation: 'find_replace',
      find: 'old',
      content: 'new',
    })

    expect(result.isError).toBeFalsy()
    expect(mockFs.writeText).toHaveBeenCalledWith('/vault/notes/a.md', 'before new after')
  })

  it('edit_document find_replace reports missing text', async () => {
    vi.mocked(mockFs.readText).mockResolvedValue('nothing here')

    const result = await executeTool('edit_document', {
      path: 'notes/a.md',
      operation: 'find_replace',
      find: 'missing',
      content: 'new',
    })

    expect(result.isError).toBe(true)
    expect(result.content).toContain('not found')
    expect(mockFs.writeText).not.toHaveBeenCalled()
  })

  it('create_file fails when the file already exists', async () => {
    vi.mocked(mockFs.exists).mockResolvedValue(true)

    const result = await executeTool('create_file', { path: 'notes/a.md', content: 'x' })

    expect(result.isError).toBe(true)
    expect(result.content).toContain('already exists')
  })

  it('delete_file reports missing files', async () => {
    vi.mocked(mockFs.exists).mockResolvedValue(false)

    const result = await executeTool('delete_file', { path: 'notes/nope.md' })

    expect(result.isError).toBe(true)
    expect(result.content).toContain('does not exist')
  })

  describe('read-only mode', () => {
    beforeEach(async () => {
      await settingsManager.save({ mode: 'read-only' })
    })

    it('blocks edit_document without touching the file system', async () => {
      const result = await executeTool('edit_document', {
        path: 'notes/a.md',
        operation: 'replace_all',
        content: 'x',
      })

      expect(result.isError).toBe(true)
      expect(result.content).toContain('requires write access (current mode is read-only)')
      expect(mockFs.writeText).not.toHaveBeenCalled()
    })

    it('blocks create_file', async () => {
      const result = await executeTool('create_file', { path: 'notes/new.md', content: 'x' })

      expect(result.isError).toBe(true)
      expect(result.content).toContain('requires write access (current mode is read-only)')
      expect(mockFs.writeText).not.toHaveBeenCalled()
    })

    it('still allows read tools', async () => {
      const result = await executeTool('read_document', { path: 'notes/a.md' })

      expect(result.isError).toBeFalsy()
      expect(result.content).toBe('# Hello\n\nworld')
    })
  })

  describe('chat-only mode', () => {
    beforeEach(async () => {
      await settingsManager.save({ mode: 'chat-only' })
    })

    it('blocks a stale write-tool call (defense in depth)', async () => {
      const result = await executeTool('edit_document', {
        path: 'notes/a.md',
        operation: 'replace_all',
        content: 'x',
      })

      expect(result.isError).toBe(true)
      expect(result.content).toContain('Blocked')
      expect(mockFs.writeText).not.toHaveBeenCalled()
    })

    it('blocks read tools (defense in depth)', async () => {
      const result = await executeTool('read_document', { path: 'notes/a.md' })

      expect(result.isError).toBe(true)
      expect(result.content).toContain('Blocked')
      expect(mockFs.readText).not.toHaveBeenCalled()
    })
  })
})
