import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ApiMessage } from '../../src/config/types'


describe('buildSystemMessage with AGENTS.md', () => {
  let loadAgentsMdMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    // request.ts captures `loadAgentsMd` at module-load time, so the mock must
    // be registered before each fresh import of request.
    loadAgentsMdMock = vi.fn().mockResolvedValue('')
    vi.doMock('../../src/agent/agents-md', async () => {
      const actual = await vi.importActual<typeof import('../../src/agent/agents-md')>(
        '../../src/agent/agents-md',
      )
      return { ...actual, loadAgentsMd: loadAgentsMdMock }
    })
  })

  it('keeps the prompt byte-identical to the legacy version when AGENTS.md is absent', async () => {
    vi.resetModules()
    const { buildSystemMessage } = await import('../../src/agent/request')
    loadAgentsMdMock.mockClear().mockResolvedValue('')
    const message: ApiMessage = await buildSystemMessage('', 'workspace-write')
    expect(message.role).toBe('system')
    expect(String(message.content)).not.toContain('Project instructions')
  })

  it('appends the AGENTS.md section when the vault has one', async () => {
    vi.resetModules()
    const { buildSystemMessage } = await import('../../src/agent/request')
    loadAgentsMdMock.mockResolvedValue('- follow repo conventions')
    const message: ApiMessage = await buildSystemMessage('', 'workspace-write')
    expect(String(message.content)).toContain('## Project instructions (AGENTS.md)\n- follow repo conventions')
  })

  it('uses the explicitly passed agentsMd without hitting the loader', async () => {
    vi.resetModules()
    const { buildSystemMessage } = await import('../../src/agent/request')
    loadAgentsMdMock.mockClear().mockResolvedValue('should not be used')
    const message: ApiMessage = await buildSystemMessage('', 'workspace-write', '- injected directly')
    expect(String(message.content)).toContain('- injected directly')
    expect(loadAgentsMdMock).not.toHaveBeenCalled()
  })
})
