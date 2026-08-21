import type { SubBrowserResult } from '@/config/types'
import { getSubBrowserState, setSubBrowserState } from '@/store/subbrowser-store'

/**
 * SubBrowserManager — owns a single in-panel iframe that renders web pages for
 * the `subbrowser` tool.
 *
 * Design notes (plan 2026-08-21_subbrowser.md):
 * - The executor can never read the iframe DOM synchronously; every operation
 *   returns a Promise resolved from load/error/timeout events.
 * - Cross-origin pages cannot be read via `contentDocument` (same-origin
 *   policy). We detect this and return an explicit hint instead of trying to
 *   bypass SOP. Callers may then fall back to `web_fetch`.
 * - Single-instance state machine: idle → loading → loaded | error; any new
 *   `open` while busy rejects with a clear message until closed/reopened.
 */

export type SubBrowserState = 'idle' | 'loading' | 'loaded' | 'error' | 'closed'

export interface SubBrowserOpenResult {
  status: SubBrowserState
  title?: string
  url: string
  finalUrl?: string
  error?: string
}

interface PendingCall {
  resolve: (result: SubBrowserResult) => void
  reject: (error: Error) => void
}

export interface SubBrowserManagerOptions {
  /** Element the iframe is appended to. */
  container: HTMLElement
  /** Called on every state change so Svelte UI can react. */
  onChange?: (state: SubBrowserState, info: { url?: string; error?: string }) => void
  /**
   * Called whenever the mounted frame changes (null when none). Lets a panel
   * render a placeholder bar before any iframe exists — e.g. after an `open`
   * fell back to web_fetch while no panel was attached yet.
   */
  onFrameChange?: (frame: HTMLIFrameElement | null, url: string | null) => void
}

export class SubBrowserManager {
  private frame: HTMLIFrameElement | null = null
  private container: HTMLElement
  private state: SubBrowserState = 'idle'
  private currentUrl: string | null = null
  private loadToken = 0
  private pending = new Map<number, PendingCall>()
  private onChange?: (state: SubBrowserState, info: { url?: string; error?: string }) => void
  private onFrameChange?: (frame: HTMLIFrameElement | null, url: string | null) => void

  constructor(options: SubBrowserManagerOptions) {
    this.container = options.container
    this.onChange = options.onChange
    this.onFrameChange = options.onFrameChange
    // A fresh manager may be created while the shared store already holds a
    // non-idle state (e.g. `open` fell back to web_fetch before any panel was
    // mounted, then the panel mounts and creates this manager). Restore that
    // state so the bar shows the pending url/error; an iframe will only be
    // created on the next explicit open.
    const stored = getSubBrowserState()
    if (stored.state !== 'idle') {
      this.currentUrl = stored.url ?? null
      this.setState(stored.state, { url: stored.url, error: stored.error })
    }
  }

  getState(): SubBrowserState {
    return this.state
  }

  getUrl(): string | null {
    return this.currentUrl
  }

  /** Open a URL in the iframe and wait for load (or timeout/error). */
  open(url: string, timeoutMs = 15_000): Promise<SubBrowserOpenResult> {
    if (this.state === 'loading' || this.state === 'loaded') {
      return Promise.resolve({ status: this.state, url, error: `subbrowser is busy (${this.state}); call close first` })
    }

    const token = ++this.loadToken
    this.currentUrl = url
    this.setState('loading', { url })

    const frame = document.createElement('iframe')
    frame.className = 'typ-subbrowser-frame'
    // sandbox: allow scripts + same-origin so pages behave, but block forms and
    // top-navigation. We do NOT inject JS into the page (security constraint).
    frame.sandbox = 'allow-scripts allow-same-origin'
    frame.referrerPolicy = 'no-referrer'
    frame.style.width = '100%'
    frame.style.height = '320px'
    frame.style.border = 'none'

    this.frame?.remove()
    this.frame = frame
    this.container.appendChild(frame)
    this.onFrameChange?.(frame, url)

    return new Promise<SubBrowserOpenResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(token)
        if (this.loadToken !== token) return // superseded by a newer open/close
        this.setState('error', { url, error: `timed out after ${timeoutMs}ms` })
        resolve({ status: 'error', url, error: `subbrowser timed out loading ${url} after ${timeoutMs / 1000}s` })
      }, timeoutMs)

      frame.addEventListener('load', () => {
        clearTimeout(timer)
        if (this.loadToken !== token) return
        const result = this.readPage()
        this.setState(result.status, { url: this.currentUrl ?? undefined, error: result.error })
        resolve({ status: result.status, title: result.title, url: this.currentUrl!, finalUrl: result.finalUrl, error: result.error })
      })

      frame.addEventListener('error', () => {
        clearTimeout(timer)
        if (this.loadToken !== token) return
        this.setState('error', { url, error: 'load failed' })
        resolve({ status: 'error', url, error: `subbrowser could not load ${url} — the site may be blocking embedding (X-Frame-Options / CSP frame-ancestors)` })
      })

      this.pending.set(token, {
        resolve: r => { clearTimeout(timer); resolve(r as unknown as SubBrowserOpenResult) },
        reject,
      })
    })
  }

  /** Extract page text (whole body or selector-scoped). */
  extract(selector?: string, maxChars = 30_000): Promise<SubBrowserResult> {
    if (!this.frame || this.state !== 'loaded') {
      return Promise.resolve({ status: this.state, error: `subbrowser has no loaded page (state: ${this.state}); call open first` })
    }
    const result = this.readPage(selector, maxChars)
    return Promise.resolve(result)
  }

  /** Query current browsing state. */
  status(): SubBrowserResult {
    if (!this.frame || !this.currentUrl) {
      return { status: 'idle', error: 'no page open' }
    }
    const readable = this.readPage()
    return {
      status: this.state,
      title: readable.title,
      url: this.currentUrl,
      finalUrl: readable.finalUrl,
      isError: this.state === 'error',
      error: this.state === 'error' ? readable.error : undefined,
    }
  }

  /** Remove the iframe and release all pending calls. */
  close(): SubBrowserResult {
    const url = this.currentUrl ?? undefined
    this.loadToken++ // invalidate in-flight handlers
    for (const [token, call] of this.pending) {
      call.resolve({ status: 'closed', url, error: 'subbrowser closed while waiting' })
      this.pending.delete(token)
    }
    this.frame?.remove()
    this.frame = null
    this.currentUrl = null
    this.onFrameChange?.(null, null)
    this.setState('idle')
    return { status: 'closed', url }
  }

  /** Agent stopped / panel unmounted: close and reject pending calls. */
  dispose(): void {
    const url = this.currentUrl ?? undefined
    this.loadToken++
    for (const [token, call] of this.pending) {
      call.reject(new Error('subbrowser disposed'))
      this.pending.delete(token)
    }
    this.frame?.remove()
    this.frame = null
    this.currentUrl = null
    this.onFrameChange?.(null, null)
    this.state = 'closed'
  }

  // ------------------------------------------------------------------ private

  private setState(state: SubBrowserState, info: { url?: string; error?: string } = {}): void {
    this.state = state
    const url = info.url ?? this.currentUrl ?? undefined
    if (state !== 'closed') setSubBrowserState(state, { url, error: info.error })
    this.onChange?.(state, { url, error: info.error })
  }

  /** Read the iframe DOM when same-origin readable; never throws. */
  private readPage(selector?: string, maxChars = 30_000): SubBrowserResult & { finalUrl?: string } {
    const url = this.currentUrl ?? undefined
    if (!this.frame) return { status: 'idle', error: 'no iframe mounted' }

    let doc: Document | null = null
    try {
      doc = this.frame.contentDocument ?? this.frame.contentWindow?.document ?? null
    } catch {
      // cross-origin access throws SecurityError
      doc = null
    }

    if (!doc || !doc.body) {
      return {
        status: 'error',
        url,
        error: `page content is not readable (cross-origin site). Use web_fetch as a fallback.`,
      }
    }

    const title = doc.title ?? ''
    let finalUrl: string | undefined
    try {
      finalUrl = this.frame.contentWindow?.location?.href || url
    } catch {
      finalUrl = url
    }

    let text = ''
    if (selector) {
      try {
        const nodes = doc.body.querySelectorAll(selector)
        text = Array.from(nodes).map(n => n.textContent ?? '').join('\n').trim()
      } catch {
        return { status: 'error', url, title, error: `invalid CSS selector: ${selector}` }
      }
    } else {
      text = doc.body.innerText?.trim() ?? ''
    }

    const budget = Math.max(1, maxChars)
    const truncated = text.length > budget
    if (truncated) text = `${text.slice(0, budget)}\n… (truncated — show ${budget.toLocaleString()} of ${text.length.toLocaleString()} chars)`

    return { status: 'loaded', title, url, finalUrl, content: text, truncated }
  }
}
