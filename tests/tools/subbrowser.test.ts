import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { executeTool } from '../../src/agent/tools/executor'
import { allToolSchemas } from '../../src/agent/tools/executor'
import { summarizeSubBrowser, executeSubBrowser, normalizeSubBrowserUrl, subbrowserSchema } from '../../src/agent/tools/net/subbrowser'
import { attachSubBrowser, detachSubBrowser, _resetSubBrowserForTest } from '../../src/agent/tools/net/subbrowser'
import { SubBrowserManager } from '../../src/agent/tools/net/subbrowser/manager'
import { filterTools } from '../../src/agent/request'

// ---------------------------------------------------------------------------
// Minimal DOM stubs for the node test environment. Only what
// SubBrowserManager touches: document.createElement, appendChild, addEventListener,
// and a fake contentDocument/contentWindow.
// ---------------------------------------------------------------------------

interface FakeIframe {
  className: string
  sandbox: string
  referrerPolicy: string
  style: Record<string, string>
  src?: string
  listeners: Record<string, Array<() => void>>
  remove(): void
  appendChild(el: unknown): void
  addEventListener(type: string, fn: () => void): void
  contentDocument: { title: string; body: { innerText?: string; textContent?: string; querySelectorAll(sel: string): Array<{ textContent: string }> } } | null
  contentWindow: { document: unknown; location: { href: string } } | null
}

function createFakeIframe(): FakeIframe {
  return {
    className: '',
    sandbox: '',
    referrerPolicy: '',
    style: {},
    listeners: {},
    remove() { /* noop */ },
    appendChild() { /* noop */ },
    addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn) },
    contentDocument: null,
    contentWindow: null,
  }
}

function installDomStubs() {
  const container = { appendChild(el: unknown) { /* noop */ } } as unknown as HTMLElement
  ;(globalThis as Record<string, unknown>).document = {
    createElement(tag: string) { if (tag === 'iframe') return createFakeIframe(); throw new Error(`unexpected tag ${tag}`) },
  }
  return container
}

beforeEach(() => {
  _resetSubBrowserForTest()
})

describe('subbrowser url normalization', () => {
  it('accepts valid http(s) urls unchanged', () => {
    expect(normalizeSubBrowserUrl('https://example.com/a?b=1').url).toBe('https://example.com/a?b=1')
    expect(normalizeSubBrowserUrl('http://localhost:3000/x').url).toBe('http://localhost:3000/x')
  })

  it('auto-prefixes bare hostnames with https://', () => {
    expect(normalizeSubBrowserUrl('example.com/docs').url).toBe('https://example.com/docs')
  })

  it('rejects empty and non-string input', () => {
    expect(normalizeSubBrowserUrl('').error).toContain('required')
    expect(normalizeSubBrowserUrl(undefined as never).error).toContain('required')
  })

  it('rejects unparseable input', () => {
    const result = normalizeSubBrowserUrl('https://[bad-host')
    expect(result.url).toBeNull()
    expect(result.error).toContain('invalid URL')
  })

  it('rejects non-http(s) protocols', () => {
    expect(normalizeSubBrowserUrl('file:///etc/passwd').error).toContain('unsupported protocol')
    expect(normalizeSubBrowserUrl('ftp://example.com/x').error).toContain('unsupported protocol')
  })

  it('allows localhost and private addresses (documented risk, no SSRF block)', () => {
    expect(normalizeSubBrowserUrl('http://127.0.0.1:8080/').url).toBe('http://127.0.0.1:8080/')
  })
})

describe('subbrowser schema and permissions', () => {
  it('is registered in the tool registry with action required', () => {
    const entry = allToolSchemas.find(schema => schema.name === 'subbrowser')
    expect(entry).toBe(subbrowserSchema)
    expect(subbrowserSchema.parameters.required).toEqual(['action'])
    expect((subbrowserSchema.parameters.properties.action as { enum: string[] }).enum).toEqual(
      expect.arrayContaining(['open', 'extract', 'status', 'close']),
    )
  })

  it('is exposed to the model in both modes (not a write tool)', () => {
    for (const mode of ['read-only', 'workspace-write'] as const) {
      expect(filterTools(mode).map(tool => tool.name)).toContain('subbrowser')
    }
  })
})

describe('executeSubBrowser without a UI container', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('open falls back to web_fetch when the panel is not attached (still delivers content)', async () => {
    const html = '<html><head><title>Fallback Page</title></head><body>fallback body text</body></html>'
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'text/html' }),
      text: async () => html,
    })))
    const result = await executeTool('subbrowser', { action: 'open', url: 'https://example.com/page' })
    expect(result.isError).toBeUndefined()
    expect(result.content).toContain('fallback body text')
    expect(result.content).toContain('# Fallback Page')
  })

  it('open without a panel reports an error when web_fetch also fails (no fetch stub → node network error)', async () => {
    const result = await executeTool('subbrowser', { action: 'open', url: 'https://nonexistent.invalid/' })
    expect(result.isError).toBe(true)
    expect(result.content).toContain('web_fetch could not retrieve')
  })

  it('status reports the store state when no panel is attached (not a hard error)', async () => {
    const result = await executeTool('subbrowser', { action: 'status' })
    expect(result.isError).toBeUndefined()
    expect(result.content).toContain('state:')
  })

  it('close without a panel reports nothing to close (not an error)', async () => {
    const result = await executeTool('subbrowser', { action: 'close' })
    expect(result.isError).toBeUndefined()
    expect(result.content).toContain('nothing to close')
  })

  it('extract without a panel and no open page reports idle state with an error hint', async () => {
    const result = await executeTool('subbrowser', { action: 'extract' })
    expect(result.isError).toBe(true)
    expect(result.content).toContain('no live panel')
  })

  it('rejects an invalid action without throwing', async () => {
    const result = await executeTool('subbrowser', { action: 'fly' })
    expect(result.isError).toBe(true)
    expect(result.content).toContain('invalid or missing "action"')
  })

  it('requires url for the open action (before manager lookup)', async () => {
    const result = await executeTool('subbrowser', { action: 'open' })
    expect(result.isError).toBe(true)
    expect(result.content).toContain('url is required')
  })
})

describe('SubBrowserManager state machine', () => {
  it('transitions idle → loading → loaded and reads same-origin DOM', async () => {
    const container = installDomStubs() as unknown as HTMLElement
    // Capture every iframe created during this test, in order.
    const iframes: FakeIframe[] = []
    ;(globalThis.document as Record<string, unknown>).createElement = (tag: string) => {
      if (tag === 'iframe') { const f = createFakeIframe(); iframes.push(f); return f }
      throw new Error(`unexpected tag ${tag}`)
    }

    const manager = attachSubBrowser(container as HTMLElement)

    const openPromise = manager.open('https://example.com', 2000)
    expect(manager.getState()).toBe('loading')
    expect(iframes.length).toBe(1)
    const frame = iframes[0]!
    expect(frame.listeners['load']?.length ?? 0).toBeGreaterThan(0)

    // Make the page readable (same-origin).
    frame.contentDocument = { title: 'Example Page', body: { innerText: 'Hello world' } }
    frame.contentWindow = { document: null, location: { href: 'https://example.com/redirected' } }
    for (const fn of frame.listeners['load'] ?? []) fn()

    const result = await openPromise
    expect(result.status).toBe('loaded')
    expect(result.title).toBe('Example Page')
    expect(manager.getState()).toBe('loaded')

    // extract reads the same DOM and truncates when asked.
    const extracted = await manager.extract(undefined, 8)
    expect(extracted.status).toBe('loaded')
    expect(extracted.content).toContain('truncated')
    expect(extracted.truncated).toBe(true)

    // selector-scoped extraction uses querySelectorAll
    frame.contentDocument!.body.querySelectorAll = (sel: string) => [{ textContent: `matched:${sel}` }]
    const scoped = await manager.extract('.lead', 1000)
    expect(scoped.content).toContain('matched:.lead')
  })

  it('reports cross-origin pages as unreadable instead of throwing', async () => {
    const container = installDomStubs() as unknown as HTMLElement
    const iframes: FakeIframe[] = []
    ;(globalThis.document as Record<string, unknown>).createElement = (tag: string) => {
      if (tag === 'iframe') { const f = createFakeIframe(); iframes.push(f); return f }
      throw new Error(`unexpected tag ${tag}`)
    }

    const manager = attachSubBrowser(container as HTMLElement)
    const openPromise = manager.open('https://cross-origin.example.com', 2000)
    const frame = iframes[0]!
    // contentDocument access throws → treated as cross-origin unreadable.
    Object.defineProperty(frame, 'contentDocument', { get() { throw new Error('SecurityError') }, configurable: true })
    for (const fn of frame.listeners['load'] ?? []) fn()

    const result = await openPromise
    expect(result.status).toBe('error')
    expect(result.error).toContain('not readable')
  })

  it('close() rejects pending calls and resets state', () => {
    const container = installDomStubs() as unknown as HTMLElement
    const manager = attachSubBrowser(container as HTMLElement)
    expect(manager.getState()).toBe('idle')
    const closed = manager.close()
    expect(closed.status).toBe('closed')
    expect(manager.getState()).toBe('idle')
  })

  it('status() reports idle when no page is open', () => {
    const container = installDomStubs() as unknown as HTMLElement
    const manager = attachSubBrowser(container as HTMLElement)
    const status = manager.status()
    expect(status.status).toBe('idle')
  })
})

describe('summarizeSubBrowser', () => {
  it('shows action + url only, never the page body', () => {
    const summary = summarizeSubBrowser(
      { action: 'extract', url: 'https://example.com/a' },
      { content: 'secret body text'.repeat(50) },
    )
    expect(summary).toContain('extract')
    expect(summary).toContain('https://example.com/a')
    expect(summary).not.toContain('secret body text')
  })

  it('marks failed calls', () => {
    expect(summarizeSubBrowser({ action: 'open' }, { content: 'boom', isError: true })).toBe('open — failed')
  })

  it('falls back to a placeholder when url is missing', () => {
    expect(summarizeSubBrowser({ action: 'status' }, undefined)).toBe('status')
  })
})
