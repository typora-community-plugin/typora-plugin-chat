import { renderMarkdown } from '@/utils/markdown-renderer'


interface MarkdownAction {
  update?: (text: string) => void
  destroy?: () => void
}

/**
 * Svelte action that renders markdown into the bound element using
 * Typora's native markdown renderer.
 *
 * @example
 * <div class="typ-message-content" use:markdown={message.text}></div>
 */
export function markdown(container: Element, text: string): MarkdownAction {
  renderMarkdown(text || '', container as HTMLElement)
  return {
    update(next: string) {
      renderMarkdown(next || '', container as HTMLElement)
    },
    destroy() {
      ;(container as HTMLElement).innerHTML = ''
    },
  }
}
