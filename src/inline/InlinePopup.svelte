<script lang="ts">
  import { format, t } from '@/i18n'
  import InlineOutput from './InlineOutput.svelte'
  import type { InlineSession, InsertMode } from './inline-session.svelte'
  import type { InlineActionId } from './inline-prompts'

  /** One row of quick-action pills; groups are separated by a thin divider. */
  interface InlineActionGroup {
    id: InlineActionId
    label: string
  }

  let {
    session,
    selectedText = '',
    actionGroups = [],
    hasSelection = false,
    canInsert = () => false,
    onRoot,
    onRun,
    onAction,
    onApply,
    onRetry,
    onAbort,
    onCopy,
    onClose,
  }: {
    session: InlineSession
    selectedText?: string
    actionGroups?: InlineActionGroup[][]
    /** Whether the anchor still carries a text selection (frozen at open). */
    hasSelection?: boolean
    /** Re-checked on every render: the anchor can go stale while the popup lives. */
    canInsert?: () => boolean
    onRoot?: (element: HTMLElement) => void
    onRun: (instruction: string) => void
    onAction: (id: InlineActionId) => void
    onApply: (mode: InsertMode) => void
    onRetry: () => void
    onAbort: () => void
    onCopy: () => Promise<boolean>
    onClose: () => void
  } = $props()

  let draft = $state('')
  let inputEl: HTMLTextAreaElement | undefined = $state()
  let copyLabel = $state<string | null>(null)

  const view = $derived(session.state)
  const preview = $derived(selectedText.length > 60 ? `${selectedText.slice(0, 60)}…` : selectedText)

  // A new reply invalidates the previous "Copied" confirmation.
  $effect(() => {
    void view.result
    void view.phase
    copyLabel = null
  })

  $effect(() => {
    inputEl?.focus()
  })

  function attachRoot(node: HTMLElement) {
    onRoot?.(node)
  }

  function autosize() {
    if (!inputEl) return
    inputEl.style.height = 'auto'
    inputEl.style.height = `${Math.min(inputEl.scrollHeight, 120)}px`
  }

  function submit() {
    if (!draft.trim()) return
    onRun(draft)
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && e.keyCode !== 229) {
      e.preventDefault()
      submit()
    }
  }

  async function copy() {
    copyLabel = null
    const ok = await onCopy()
    copyLabel = ok ? t.inline.copied : t.inline.copyFailed
  }
</script>

<div class="typ-inline-ai" {@attach attachRoot}>
  {#if selectedText}
    <div class="typ-inline-ai__selection">
      {format(t.inline.selected, { count: selectedText.length })}: {preview}
    </div>
  {/if}

  <div class="typ-inline-ai__row">
    <textarea
      class="typ-inline-ai__input"
      rows="1"
      bind:this={inputEl}
      bind:value={draft}
      placeholder={selectedText ? t.inline.askSelectionPlaceholder : t.inline.askPlaceholder}
      oninput={autosize}
      onkeydown={onKeydown}
    ></textarea>
    <button class="typ-inline-ai__send" onclick={submit}>↵</button>
  </div>

  <div class="typ-inline-ai__actions">
    {#each actionGroups as group, i (i)}
      {#if i > 0}<span class="typ-inline-ai__sep"></span>{/if}
      {#each group as action (action.id)}
        <button class="typ-inline-ai__pill" onclick={() => onAction(action.id)}>{action.label}</button>
      {/each}
    {/each}
  </div>

  <InlineOutput phase={view.phase} result={view.result} error={view.error} />

  {#if view.phase !== 'idle'}
    <div class="typ-inline-ai__bar">
      {#if view.phase === 'running'}
        <button class="typ-inline-ai__ghost" onclick={onAbort}>{t.inline.stop}</button>
      {:else}
        {#if view.phase === 'done'}
          {@const insertable = canInsert()}
          {#if insertable && hasSelection}
            <button class="typ-inline-ai__primary" onclick={() => onApply('replace')}>{t.inline.replace}</button>
            <button class="typ-inline-ai__ghost" onclick={() => onApply('after')}>{t.inline.insertAfter}</button>
          {:else if insertable}
            <button class="typ-inline-ai__primary" onclick={() => onApply('replace')}>{t.inline.insert}</button>
          {/if}
          <button
            class={insertable ? 'typ-inline-ai__ghost' : 'typ-inline-ai__primary'}
            onclick={() => void copy()}
          >{copyLabel ?? t.inline.copy}</button>
        {/if}
        <button class="typ-inline-ai__ghost" onclick={onRetry}>{t.inline.retry}</button>
        <button class="typ-inline-ai__ghost" onclick={onClose}>{t.inline.close}</button>
      {/if}
    </div>
  {/if}
</div>

<style lang="scss">
  .typ-inline-ai {
    position: fixed;
    z-index: var(--typ-layer-popover, 1000);
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px;
    border-radius: var(--typ-chat-radius-m, 0.5rem);
    border: 1px solid rgba(128, 128, 128, 0.3);
    background: var(--bg-color, #fff);
    color: var(--text-color, #333);
    box-shadow: 0 8px 28px rgba(0, 0, 0, 0.18);
    font-size: 13px;
    overflow: hidden;

    * { box-sizing: border-box; }

    &__selection {
      font-size: 12px;
      opacity: 0.65;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    &__row {
      display: flex;
      gap: 6px;
      align-items: flex-end;
    }

    &__input {
      flex: 1;
      min-width: 0;
      max-height: 120px;
      resize: none;
      padding: 6px 8px;
      font: inherit;
      line-height: 1.5;
      color: inherit;
      background: transparent;
      border: 1px solid rgba(128, 128, 128, 0.35);
      border-radius: 6px;

      &:focus {
        outline: none;
        border-color: var(--primary-color, #4a7cf7);
      }
    }

    &__send,
    &__primary {
      flex: none;
      padding: 4px 12px;
      border: none;
      border-radius: 6px;
      background: var(--primary-color, #4a7cf7);
      color: #fff;
      cursor: pointer;
      white-space: nowrap;
    }

    &__actions,
    &__bar {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }

    &__actions { align-items: center; }

    /** Divider between the always-on document actions and the mode's actions. */
    &__sep {
      width: 1px;
      align-self: stretch;
      margin: 2px 2px;
      background: rgba(128, 128, 128, 0.3);
    }

    &__bar { justify-content: flex-end; }

    &__pill {
      padding: 2px 10px;
      border-radius: 12px;
      border: 1px solid rgba(128, 128, 128, 0.35);
      background: transparent;
      color: inherit;
      font-size: 12px;
      cursor: pointer;

      &:hover {
        border-color: var(--primary-color, #4a7cf7);
        color: var(--primary-color, #4a7cf7);
      }
    }

    &__ghost {
      padding: 3px 10px;
      border-radius: 5px;
      border: 1px solid rgba(128, 128, 128, 0.35);
      background: transparent;
      color: inherit;
      font-size: 12px;
      cursor: pointer;
      white-space: nowrap;
    }
  }
</style>

