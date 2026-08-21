/** Actions supported by the `subbrowser` tool. */
export type SubBrowserAction = 'open' | 'extract' | 'status' | 'close'

/** Options accepted by the `subbrowser` tool. */
export interface SubBrowserOptions {
  /** Which action to perform (required). */
  action: SubBrowserAction
  /** The http(s) URL to open (`open` requires this). */
  url?: string
  /** CSS selector for scoped extraction; omitted = whole body (`extract`). */
  selector?: string
  /** Max characters returned by `extract` (default 30000, clamped 1..200000). */
  max_chars?: number
  /** Load/extract timeout in ms (default 15000). */
  timeout_ms?: number
}

/** Structured result of a `subbrowser` call. */
export interface SubBrowserResult {
  status: 'idle' | 'loading' | 'loaded' | 'error' | 'closed'
  title?: string
  url?: string
  /** Final URL after redirects (when readable). */
  finalUrl?: string
  /** Extracted page body text (whole or selector-scoped), truncated. */
  content?: string
  /** Whether the extracted content was truncated to max_chars. */
  truncated?: boolean
  isError?: boolean
  error?: string
}
