import { app } from '@typora-community-plugin/core'


/**
 * Render markdown into a DOM element using Typora's own renderer.
 * Waits for asynchronous blocks (Mermaid, diagrams, math) to finish.
 */
export async function renderMarkdown(markdown: string, targetEl: HTMLElement): Promise<void> {
  if (!markdown) {
    targetEl.innerHTML = ''
    return
  }
  try {
    await app.features.markdownRenderer.renderTo(markdown, targetEl, { async: true })
  } catch (error) {
    console.error('[chat] markdown render failed', error)
  }
}
