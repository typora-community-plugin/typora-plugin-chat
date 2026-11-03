<script lang="ts">
  import { t } from '@/i18n'
  import { renderMarkdown } from '@/utils/markdown-renderer'
  import type { InlinePhase } from './inline-session.svelte'

  let {
    phase,
    result = '',
    error = '',
  }: {
    phase: InlinePhase
    result?: string
    error?: string
  } = $props()

  /**
   * Typora's renderer owns this node's children and fills them asynchronously
   * (Mermaid, math…), so Svelte must never diff inside it. `{#key result}` in
   * the markup gives every reply a fresh node, which is also what stops a slow
   * render from painting over a newer one.
   */
  function attachMarkdown(node: HTMLElement) {
    void renderMarkdown(result, node)
    return () => { node.innerHTML = '' }
  }
</script>

<div class="typ-inline-ai__output" hidden={phase === 'idle'}>
  {#if phase === 'done'}
    {#key result}
      <div class="typ-inline-ai__md" {@attach attachMarkdown}></div>
    {/key}
  {:else if phase === 'running'}
    <div class="typ-inline-ai__pending">{t.inline.thinking}</div>
  {:else if phase === 'aborted'}
    <div class="typ-inline-ai__pending">{t.inline.stopped}</div>
  {:else if phase === 'empty'}
    <div class="typ-inline-ai__error">{t.inline.emptyReply}</div>
  {:else if phase === 'error'}
    <div class="typ-inline-ai__error">{error}</div>
  {/if}
</div>

<style lang="scss">
  .typ-inline-ai__output {
    flex: 1 1 auto;
    min-height: 0;
    max-height: 50vh;
    overflow: auto;
    padding: 8px 10px;
    border-radius: 6px;
    background: rgba(128, 128, 128, 0.08);
    line-height: 1.6;
    overflow-wrap: anywhere;
  }

  /** Attachment target: takes no box of its own, so markdown keeps the layout
   * it had when rendered straight into the output area. */
  .typ-inline-ai__md { display: contents; }

  .typ-inline-ai__pending { opacity: 0.6; }

  .typ-inline-ai__error {
    color: #d33;
    white-space: pre-wrap;
  }
</style>
