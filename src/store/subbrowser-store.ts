import { writable, get } from 'svelte/store'

export type SubBrowserUiStatus = 'idle' | 'loading' | 'loaded' | 'error'

export interface SubBrowserUiState {
  state: SubBrowserUiStatus
  url?: string
  error?: string
  /** Content cached when open fell back to web_fetch (no live panel). */
  fallbackContent?: string
  /** Title from the fallback fetch result. */
  fallbackTitle?: string
}

/** Live sub-browser panel state shared between the manager and Svelte UI. */
export const subbrowserStore = writable<SubBrowserUiState>({ state: 'idle' })

export function setSubBrowserState(state: SubBrowserUiStatus, info: { url?: string; error?: string; fallbackContent?: string; fallbackTitle?: string } = {}): void {
  subbrowserStore.set({ state, url: info.url, error: info.error, fallbackContent: info.fallbackContent, fallbackTitle: info.fallbackTitle })
}

export function getSubBrowserState(): SubBrowserUiState {
  return get(subbrowserStore)
}
