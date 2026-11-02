import { beforeEach, describe, expect, it, vi } from 'vitest'
import { sendMessage } from '../../src/api/client'
import { normalizeOpenAIBaseUrl } from '../../src/api/base-url'
import { DEFAULT_SETTINGS } from '../../src/config/settings'
import type { ApiMessage, PluginSettings, ToolDefinition } from '../../src/config/types'

/**
 * Contract tests: every built-in provider, with its DEFAULT base URL, through a
 * full tool round trip (request 1 → tool_use, request 2 replays it). Asserts
 * the endpoint, auth header and request shape each API actually expects.
 */

const tool: ToolDefinition = { name: 'read_document', description: 'Read a document', parameters: { type: 'object', properties: { path: { type: 'string' } } } }

const EXPECTED_ENDPOINT: Record<string, string> = {
  alibaba: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
  anthropic: 'https://api.anthropic.com/v1/messages',
  deepseek: 'https://api.deepseek.com/v1/chat/completions',
  google: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
  minimax: 'https://api.minimaxi.com/v1/chat/completions',
  moonshot: 'https://api.moonshot.cn/v1/chat/completions',
  openai: 'https://api.openai.com/v1/responses',
  spacexai: 'https://api.x.ai/v1/chat/completions',
  xiaomi: 'https://api.xiaomimimo.com/v1/chat/completions',
  'z.ai': 'https://api.z.ai/api/paas/v4/chat/completions',
  openrouter: 'https://openrouter.ai/api/v1/chat/completions',
  lmstudio: 'http://localhost:1234/v1/chat/completions',
  ollama: 'http://localhost:11434/v1/chat/completions',
}

function settingsFor(provider: string): PluginSettings {
  const base = DEFAULT_SETTINGS.providers[provider]
  return {
    ...DEFAULT_SETTINGS,
    provider,
    providers: { ...DEFAULT_SETTINGS.providers, [provider]: { ...base, enabled: true, model: 'm', apiKey: 'KEY' } },
  } as PluginSettings
}

/** Canned first response (a tool call) in each API family's wire format. */
function toolCallResponse(family: 'anthropic' | 'responses' | 'chat') {
  if (family === 'anthropic') {
    return { content: [{ type: 'thinking', thinking: 'plan', signature: 's' }, { type: 'tool_use', id: 'call_1', name: 'read_document', input: { path: 'a.md' } }], stop_reason: 'tool_use', usage: { input_tokens: 1, output_tokens: 1 } }
  }
  if (family === 'responses') {
    return { status: 'completed', output: [{ type: 'function_call', call_id: 'call_1', name: 'read_document', arguments: '{"path":"a.md"}' }] }
  }
  return {
    choices: [{
      finish_reason: 'tool_calls',
      message: {
        content: null,
        reasoning_content: 'plan',
        tool_calls: [{
          id: 'call_1', type: 'function',
          function: { name: 'read_document', arguments: '{"path":"a.md"}' },
          extra_content: { google: { thought_signature: 'SIG' } },
        }],
      },
    }],
  }
}

const family = (p: string) => (p === 'anthropic' ? 'anthropic' : p === 'openai' ? 'responses' : 'chat')

describe('provider matrix (default settings)', () => {
  beforeEach(() => { vi.restoreAllMocks() })

  for (const provider of Object.keys(EXPECTED_ENDPOINT)) {
    it(`${provider}: endpoint, auth, tool shape and tool round trip`, async () => {
      const fam = family(provider)
      const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, headers: new Headers(), json: async () => toolCallResponse(fam) })
      vi.stubGlobal('fetch', fetchMock)
      const settings = settingsFor(provider)
      const messages: ApiMessage[] = [{ role: 'system', content: 'sys' }, { role: 'user', content: 'read a.md' }]

      // Request 1 → tool call parsed into a unified tool_use block.
      const r1 = await sendMessage(settings, messages, [tool])
      const [url1, init1] = fetchMock.mock.calls[0]
      const body1 = JSON.parse(init1.body)
      expect(url1).toBe(EXPECTED_ENDPOINT[provider])
      const toolUse = r1.content.find(b => b.type === 'tool_use')
      expect(toolUse).toMatchObject({ id: 'call_1', name: 'read_document', input: { path: 'a.md' } })

      if (fam === 'anthropic') {
        expect(init1.headers['x-api-key']).toBe('KEY')
        expect(init1.headers['anthropic-dangerous-direct-browser-access']).toBe('true')
        expect(body1.tools[0]).toMatchObject({ name: 'read_document', input_schema: tool.parameters })
      } else {
        expect(init1.headers.Authorization).toBe('Bearer KEY')
        if (fam === 'responses') expect(body1.tools[0]).toMatchObject({ type: 'function', name: 'read_document' })
        else expect(body1.tools[0]).toEqual({ type: 'function', function: { name: 'read_document', description: 'Read a document', parameters: tool.parameters } })
      }

      // Request 2 → the loop replays the assistant turn (as the agent loop
      // stores it: thinking + tool_use) and the tool result.
      const thinking = r1.content.find(b => b.type === 'thinking')
      const history: ApiMessage[] = [
        ...messages,
        { role: 'assistant', content: [...(thinking ? [thinking] : []), toolUse!] },
        { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'call_1', content: '# A' }] },
      ]
      await sendMessage(settings, history, [tool])
      const body2 = JSON.parse(fetchMock.mock.calls[1][1].body)

      if (fam === 'anthropic') {
        const assistant = body2.messages.find((m: { role: string }) => m.role === 'assistant')
        expect(assistant.content).toEqual([{ type: 'tool_use', id: 'call_1', name: 'read_document', input: { path: 'a.md' } }])
        expect(body2.messages.at(-1).content[0]).toMatchObject({ type: 'tool_result', tool_use_id: 'call_1' })
      } else if (fam === 'responses') {
        expect(body2.input).toEqual(expect.arrayContaining([
          expect.objectContaining({ type: 'function_call', call_id: 'call_1', name: 'read_document' }),
          expect.objectContaining({ type: 'function_call_output', call_id: 'call_1', output: '# A' }),
        ]))
      } else {
        const assistant = body2.messages.find((m: { role: string }) => m.role === 'assistant')
        expect(assistant.tool_calls[0]).toMatchObject({ id: 'call_1', type: 'function', function: { name: 'read_document' } })
        // DeepSeek/Kimi: reasoning replayed. Gemini 3: thought signature replayed.
        if (provider !== 'ollama') {
          expect(assistant.reasoning_content).toBe('plan')
          expect(assistant.tool_calls[0].extra_content).toEqual({ google: { thought_signature: 'SIG' } })
        }
        expect(body2.messages.at(-1)).toMatchObject({ role: 'tool', tool_call_id: 'call_1', content: '# A' })
      }
    })
  }
})

describe('normalizeOpenAIBaseUrl', () => {
  it.each([
    ['https://api.deepseek.com', 'https://api.deepseek.com/v1'],
    ['https://api.deepseek.com/', 'https://api.deepseek.com/v1'],
    ['https://api.deepseek.com/v1', 'https://api.deepseek.com/v1'],
    ['https://api.z.ai/api/paas/v4', 'https://api.z.ai/api/paas/v4'],
    ['https://open.bigmodel.cn/api/paas/v4/', 'https://open.bigmodel.cn/api/paas/v4'],
    ['https://generativelanguage.googleapis.com/v1beta', 'https://generativelanguage.googleapis.com/v1beta/openai'],
    ['https://generativelanguage.googleapis.com', 'https://generativelanguage.googleapis.com/v1beta/openai'],
    ['https://generativelanguage.googleapis.com/v1beta/openai/', 'https://generativelanguage.googleapis.com/v1beta/openai'],
    ['https://ark.cn-beijing.volces.com/api/v3', 'https://ark.cn-beijing.volces.com/api/v3'],
    ['http://localhost:11434', 'http://localhost:11434/v1'],
  ])('%s → %s', (input, expected) => {
    expect(normalizeOpenAIBaseUrl(input)).toBe(expected)
  })

  it('uses the fallback when empty', () => {
    expect(normalizeOpenAIBaseUrl('', 'http://localhost:11434')).toBe('http://localhost:11434/v1')
  })
})
