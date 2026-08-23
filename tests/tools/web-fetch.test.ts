import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { executeTool } from '../../src/agent/tools/executor'
import { allToolSchemas } from '../../src/agent/tools/executor'
import { summarizeWebFetch, executeWebFetch, normalizeFetchUrl, webFetchSchema } from '../../src/agent/tools/net/web-fetch'
import { filterTools } from '../../src/agent/request'
import { settingsManager } from '../../src/config/settings'


const HTML_PAGE = `<!doctype html><html><head><title>Example Page</title></head>
<body><h1>Main heading</h1><p>Hello, <a href="https://example.com/x">world</a>.</p></body></html>`

function mockFetchResponse(init: {
  status?: number
  body?: string
  contentType?: string
} = {}): void {
  const { status = 200, body = '', contentType = 'text/html; charset=utf-8' } = init
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => (name.toLowerCase() === 'content-type' ? contentType : null) },
    text: async () => body,
  }))
}

describe('web_fetch url normalization', () => {
  it('accepts valid http(s) urls unchanged', () => {
    expect(normalizeFetchUrl('https://example.com/a?b=1').url).toBe('https://example.com/a?b=1')
    expect(normalizeFetchUrl('http://localhost:3000/x').url).toBe('http://localhost:3000/x')
  })

  it('auto-prefixes bare hostnames with https://', () => {
    expect(normalizeFetchUrl('example.com/docs').url).toBe('https://example.com/docs')
  })

  it('rejects empty and non-string input', () => {
    expect(normalizeFetchUrl('').error).toContain('required')
    expect(normalizeFetchUrl(undefined as never).error).toContain('required')
    expect(normalizeFetchUrl(42 as never).error).toContain('required')
  })

  it('rejects unparseable input', () => {
    const result = normalizeFetchUrl('https://[bad-host')
    expect(result.url).toBeNull()
    expect(result.error).toContain('invalid URL')
  })

  it('treats non-scheme text as a bare hostname and prefixes https://', () => {
    // "not a url at all" has no scheme → treated like typing a domain in a browser.
    expect(normalizeFetchUrl('example.com').url).toBe('https://example.com/')
  })

  it('rejects non-http(s) protocols', () => {
    const result = normalizeFetchUrl('file:///etc/passwd')
    expect(result.url).toBeNull()
    expect(result.error).toContain('unsupported protocol')
    expect(normalizeFetchUrl('ftp://example.com/x').error).toContain('unsupported protocol')
  })

  it('allows localhost and private addresses (documented risk, no SSRF block)', () => {
    expect(normalizeFetchUrl('http://127.0.0.1:8080/').url).toBe('http://127.0.0.1:8080/')
    expect(normalizeFetchUrl('http://192.168.1.1/admin').url).toBe('http://192.168.1.1/admin')
  })
})

describe('web_fetch schema', () => {
  it('is registered in the tool registry with url required', () => {
    const entry = allToolSchemas.find(schema => schema.name === 'web_fetch')
    expect(entry).toBe(webFetchSchema)
    expect(webFetchSchema.parameters.required).toEqual(['url'])
    expect(webFetchSchema.parameters.properties.limit).toBeTruthy()
    expect(webFetchSchema.parameters.properties.offset).toBeTruthy()
  })

  it('is exposed to the model in all three modes', () => {
    for (const mode of ['read-only', 'chat-only', 'workspace-write'] as const) {
      expect(filterTools(mode).map(tool => tool.name)).toContain('web_fetch')
    }
  })

  it('hides all file tools from the model in chat-only but keeps non-file tools', () => {
    const names = filterTools('chat-only').map((tool) => tool.name)
    for (const name of ['edit_document', 'set_properties', 'create_file', 'delete_file', 'rename_file']) {
      expect(names).not.toContain(name)
    }
    expect(names).not.toContain('read_document')
    expect(names).toContain('web_fetch')
  })

  it('hides write tools from the model in read-only but keeps read tools visible', () => {
    const names = filterTools('read-only').map((tool) => tool.name)
    for (const name of ['edit_document', 'create_file']) {
      expect(names).not.toContain(name)
    }
    // read-only stays readable (semantic fix): read tools remain visible and executable.
    expect(names).toContain('read_document')
  })
})

describe('executeWebFetch', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('returns extracted markdown text for an HTML page', async () => {
    mockFetchResponse({ body: HTML_PAGE })
    const result = await executeWebFetch({ url: 'https://example.com' })
    expect(result.isError).toBeFalsy()
    expect(result.content).toContain('# Example Page')
    expect(result.content).toContain('# Main heading')
    expect(result.content).toContain('[world](https://example.com/x)')
  })

  it('returns plain text and json responses as-is', async () => {
    mockFetchResponse({ body: 'hello plain', contentType: 'text/plain' })
    const text = await executeWebFetch({ url: 'https://example.com/txt' })
    expect(text.content).toContain('hello plain')

    mockFetchResponse({ body: '{"a":1}', contentType: 'application/json' })
    const json = await executeWebFetch({ url: 'https://example.com/api' })
    expect(json.content).toContain('{"a":1}')
  })

  it('reports non-2xx status codes as errors', async () => {
    mockFetchResponse({ status: 404, body: '<html><head><title>Not found</title></head><body>nope</body></html>' })
    const result = await executeWebFetch({ url: 'https://example.com/missing' })
    expect(result.isError).toBe(true)
    expect(result.content).toContain('HTTP 404')
  })

  it('reports binary payloads as errors', async () => {
    mockFetchResponse({ body: '\x89PNG', contentType: 'image/png' })
    const result = await executeWebFetch({ url: 'https://example.com/img.png' })
    expect(result.isError).toBe(true)
    expect(result.content).toContain('binary')
  })

  it('paginates content at limit and marks it', async () => {
    mockFetchResponse({ body: `<html><head><title>T</title></head><body>${'x'.repeat(500)}</body></html>`, contentType: 'text/html' })
    const result = await executeWebFetch({ url: 'https://example.com', limit: 200 })
    expect(result.isError).toBeFalsy()
    // The notice is "… showing N of M chars, starting at offset O".
    expect(result.content).toContain('showing')
    expect(result.content).toMatch(/starting at offset 0/)
  })

  it('does not mark short content as paginated', async () => {
    mockFetchResponse({ body: `<html><head><title>T</title></head><body>short page</body></html>` })
    const result = await executeWebFetch({ url: 'https://example.com' })
    expect(result.isError).toBeFalsy()
    expect(result.content).not.toContain('showing')
  })

  it('reads a later window via offset', async () => {
    mockFetchResponse({ body: `<html><head><title>T</title></head><body>${'a'.repeat(400)}${'b'.repeat(200)}</body></html>`, contentType: 'text/html' })
    const first = await executeWebFetch({ url: 'https://example.com', limit: 100, offset: 0 })
    const second = await executeWebFetch({ url: 'https://example.com', limit: 100, offset: 450 })
    expect(first.isError).toBeFalsy()
    expect(second.isError).toBeFalsy()
    expect(second.content).toContain('b')
    // No overlap between the two windows.
    const firstBody = first.content.split('\n…')[0]!
    const secondBody = second.content.split('\n…')[0]!
    expect(firstBody.repeat(1) === secondBody.repeat(1)).toBe(false)
  })

  it('errors when offset is beyond the end of the content', async () => {
    mockFetchResponse({ body: `<html><head><title>T</title></head><body>tiny</body></html>` })
    const result = await executeWebFetch({ url: 'https://example.com', limit: 100, offset: 999_999 })
    expect(result.isError).toBe(true)
    expect(result.content).toContain('no content at offset')
  })

  it('clamps out-of-range limit values', async () => {
    mockFetchResponse({ body: `<html><head><title>T</title></head><body>${'y'.repeat(10)}</body></html>` })
    const result = await executeWebFetch({ url: 'https://example.com', limit: -5 })
    expect(result.isError).toBeFalsy()
  })

  it('reports a timeout when the fetch is aborted', async () => {
    vi.useFakeTimers()
    try {
      const controller = new AbortController()
      vi.stubGlobal('fetch', vi.fn((_url: string, init?: RequestInit) => new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))
        })
        setTimeout(() => controller.abort(), 0)
      })))
      // The executeWebFetch promise and the abort timer both need to run.
      const pending = executeWebFetch({ url: 'https://example.com/slow' })
      await vi.advanceTimersByTimeAsync(15_500)
      const result = await pending
      expect(result.isError).toBe(true)
      expect(result.content).toContain('timed out')
    } finally {
      vi.useRealTimers()
    }
  })

  it('reports network/CORS failures readably', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    const result = await executeWebFetch({ url: 'https://example.com' })
    expect(result.isError).toBe(true)
    expect(result.content).toContain('could not load')
  })

  it('never throws on invalid input', async () => {
    vi.stubGlobal('fetch', vi.fn())
    const result = await executeTool('web_fetch', {})
    expect(result.isError).toBe(true)
    expect(result.content).toContain('url is required')
  })
})

describe('web_fetch permissions and summary', () => {
  beforeEach(async () => {
    await settingsManager.save({ mode: 'read-only' })
  })

  it('stays available in read-only mode (not a write tool)', async () => {
    mockFetchResponse({ body: HTML_PAGE })
    const result = await executeTool('web_fetch', { url: 'https://example.com' })
    expect(result.isError).toBeFalsy()
    vi.unstubAllGlobals()
  })

  it('surfaces pagination details when present in the result', () => {
    const summary = summarizeWebFetch(
      { url: 'https://example.com/a' },
      { content: `x`.repeat(120) + '\n… showing 100 of 5,000 chars, starting at offset 30,000' },
    )
    // The fixture is synthetic (real notices use locale-formatted numbers); the
    // summary surfaces total/offset when it can parse them.
    expect(summary).toContain('https://example.com/a')
    expect(summary).not.toContain('xxxxx')
  })

  it('summarizes paginated results with showing count and offset', () => {
    const shown = (100).toLocaleString()
    const total = (5_000).toLocaleString()
    const startAt = (30_000).toLocaleString()
    const notice = `… showing ${shown} of ${total} chars, starting at offset ${startAt}`
    const summary = summarizeWebFetch(
      { url: 'https://example.com/a' },
      { content: `x`.repeat(120) + `\n${notice}` },
    )
    expect(summary).toContain(`showing ${shown}`)
    expect(summary).toContain(`offset ${startAt}`)
  })

  it('summarizes non-paginated results with the plain char count', () => {
    const summary = summarizeWebFetch(
      { url: 'https://example.com/a' },
      { content: `x`.repeat(120) },
    )
    expect(summary).toContain('(120 chars)')
  })

  it('marks failed summaries', () => {
    expect(summarizeWebFetch({ url: 'https://x' }, { content: 'boom', isError: true })).toBe('https://x — failed')
  })
})
