import { app } from '@typora-community-plugin/core'


/**
 * Render markdown into a DOM element using Typora's own renderer.
 * Keeps all rendering consistent with the host editor (code blocks, links, etc.).
 */
export function renderMarkdown(markdown: string, targetEl: HTMLElement): void {
  if (!markdown) {
    targetEl.innerHTML = ''
    return
  }
  try {
    app.features.markdownRenderer.renderTo(markdown, targetEl)
  } catch {
    targetEl.textContent = markdown
  }
}
