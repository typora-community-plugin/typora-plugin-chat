<script lang="ts">
  import { t } from '@/i18n'
  import SlashCommandSuggestions from './SlashCommandSuggestions.svelte'
  import SessionPicker from './SessionPicker.svelte'
  import ContextUsageRing from './ContextUsageRing.svelte'
  import { scheduleContextUsageRefresh } from '@/store/context-usage-store'
  import { computeSuggestions, shouldCompleteSubcommand, suggestionsShouldBeOpen } from '@/slash-commands'
  import type { SessionSummary } from '@/store/session-store'

  let {
    onSend,
    onStop,
    placeholder = t.chat.inputPlaceholder,
    enabled = true,
    textAreaEl = null,
    model = '',
    models = [],
    skills = [],
    onModelChange = null,
    onModelRefresh = null,
    sessions = [],
    activeSessionId = null,
    onSwitchSession = null,
    onDeleteSession = null,
    mode = 'workspace-write',
    onModeChange = null,
    refill = $bindable(null),
  }: {
    onSend: (text: string) => void
    onStop: () => void
    placeholder?: string
    enabled?: boolean
    textAreaEl?: ((el: HTMLTextAreaElement | null) => void) | null
    model?: string
    models?: string[]
    skills?: string[]
    onModelChange?: ((model: string) => void) | null
    onModelRefresh?: (() => void) | null
    sessions?: SessionSummary[]
    activeSessionId?: string | null
    onSwitchSession?: ((id: string) => void) | null
    onDeleteSession?: ((s: SessionSummary) => void) | null
    mode?: 'read-only' | 'workspace-write'
    onModeChange?: ((mode: 'read-only' | 'workspace-write') => void) | null
    /** One-shot refill (e.g. /undo): when non-null, becomes editable draft text and is cleared. */
    refill?: string | null
  } = $props()

  let value = $state('')
  let textarea = $state<HTMLTextAreaElement | null>(null)

  // Keep the context-usage ring in sync with the draft being typed.
  $effect(() => {
    scheduleContextUsageRefresh(value)
  })

  // --- slash-command autocomplete -------------------------------------------
  const suggestions = $derived(computeSuggestions({ skills, value }))
  let suggestionsOpen = $state(false)
  let highlightedIndex = $state(0)

  // --- /sessions session picker ---------------------------------------------
  let sessionPickerOpen = $state(false)
  let sessionHighlightedIndex = $state(0)

  // Inline two-step delete confirmation. A native `window.confirm()` dialog is
  // rendered by the host and freezes the whole Typora UI for tens of seconds,
  // so it is replaced with this in-place prompt: first click arms the row, a
  // second click (or Enter) deletes, anything else dismisses after a timeout.
  let pendingDeleteId = $state<string | null>(null)
  let pendingDeleteTimer: ReturnType<typeof setTimeout> | null = null

  function clearPendingDelete() {
    if (pendingDeleteTimer != null) clearTimeout(pendingDeleteTimer)
    pendingDeleteTimer = null
    pendingDeleteId = null
  }

  function armDelete(id: string, title: string) {
    clearPendingDelete()
    pendingDeleteId = id
    pendingDeleteTimer = setTimeout(() => clearPendingDelete(), 3000)
  }

  $effect(() => {
    // Recompute visibility + reset highlight whenever the suggestion list changes.
    suggestionsOpen = suggestionsShouldBeOpen({ skills, value }, enabled)
    highlightedIndex = 0
    // The delete prompt belongs to one specific session: drop it when that
    // session disappears from the list (already deleted or picker re-rendered).
    if (pendingDeleteId && !sessions.some((s) => s.id === pendingDeleteId)) clearPendingDelete()
  })

  $effect(() => {
    return () => { if (pendingDeleteTimer != null) clearTimeout(pendingDeleteTimer) }
  })

  $effect(() => {
    if (textAreaEl) textAreaEl(textarea)
    return () => { if (textAreaEl) textAreaEl(null) }
  })

  const MAX_HEIGHT = 300

  function autoResize() {
    if (!textarea) return
    textarea.style.height = 'auto'
    const height = Math.min(textarea.scrollHeight, MAX_HEIGHT)
    textarea.style.height = height + 'px'
    textarea.style.overflowY = textarea.scrollHeight > MAX_HEIGHT ? 'auto' : 'hidden'
  }

  // A fresh non-empty `refill` replaces the current draft; clearing it back to
  // null afterwards lets the next /undo re-trigger even for identical text.
  $effect(() => {
    if (typeof refill === 'string' && refill.length > 0) {
      value = refill
      textarea?.focus()
      requestAnimationFrame(autoResize)
      refill = null
    }
  })

  function handleInput() {
    autoResize()
  }

  function handleBlur() {
    // Dismiss after a short delay so click events on the suggestion or session
    // list still fire before the list disappears.
    setTimeout(() => {
      suggestionsOpen = false
      sessionPickerOpen = false
      clearPendingDelete()
    }, 150)
  }

  function handleKeydown(e: KeyboardEvent) {
    if (sessionPickerOpen) {
      if (sessions.length) {
        if (e.key === 'ArrowDown') {
          e.preventDefault()
          sessionHighlightedIndex = (sessionHighlightedIndex + 1) % sessions.length
          return
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault()
          sessionHighlightedIndex = (sessionHighlightedIndex - 1 + sessions.length) % sessions.length
          return
        }
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault()
          const index = Math.min(sessionHighlightedIndex, sessions.length - 1)
          const s = sessions[index]
          // Enter acts as the confirmation for an armed delete prompt.
          if (onDeleteSession && pendingDeleteId === s.id) {
            clearPendingDelete()
            onDeleteSession(s)
          } else {
            pickSession(s.id)
          }
          return
        }
        // Delete / Backspace arms or confirms the highlighted session's delete,
        // so no native confirm dialog is ever shown.
        if (onDeleteSession && (e.key === 'Delete' || e.key === 'Backspace')) {
          e.preventDefault()
          const index = Math.min(sessionHighlightedIndex, sessions.length - 1)
          const s = sessions[index]
          if (pendingDeleteId === s.id) {
            clearPendingDelete()
            onDeleteSession(s)
          } else {
            armDelete(s.id, s.title)
          }
          return
        }
      }
      if (e.key === 'Escape') {
        sessionPickerOpen = false
        textarea?.focus()
        return
      }
    }

    if (suggestionsOpen && suggestions.length) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        highlightedIndex = (highlightedIndex + 1) % suggestions.length
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        highlightedIndex = (highlightedIndex - 1 + suggestions.length) % suggestions.length
        return
      }
      if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
        e.preventDefault()
        applySuggestion(suggestions[highlightedIndex])
        return
      }
      if (e.key === 'Escape') {
        suggestionsOpen = false
        return
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  function applySuggestion(suggested: string) {
    if (suggested === '/sessions') {
      value = ''
      suggestionsOpen = false
      sessionPickerOpen = true
      sessionHighlightedIndex = Math.max(0, sessions.findIndex((s) => s.id === activeSessionId))
      autoResize()
      textarea?.focus()
      return
    }
    if (shouldCompleteSubcommand(suggested)) {
      // `/skill` → `/skill:` and keep the list open for skill filtering.
      value = `${suggested}:`
      suggestionsOpen = true
      highlightedIndex = 0
      autoResize()
      textarea?.focus()
      return
    }
    const spaceIndex = value.search(/\s/)
    if (spaceIndex === -1) {
      value = `${suggested} `
    } else {
      value = `${suggested}${value.slice(spaceIndex)}`
    }
    suggestionsOpen = false
    autoResize()
    textarea?.focus()
  }

  function pickSession(id: string) {
    onSwitchSession?.(id)
    sessionPickerOpen = false
    value = ''
    autoResize()
    textarea?.focus()
  }

  function handleDeleteSession(s: SessionSummary) {
    // Two-step delete: the first click arms the confirmation prompt shown in
    // place of the row title; a second click on the same row actually deletes.
    if (pendingDeleteId === s.id) {
      clearPendingDelete()
      onDeleteSession?.(s)
    } else {
      armDelete(s.id, s.title)
    }
    sessionHighlightedIndex = Math.min(sessionHighlightedIndex, sessions.length - 2)
    if (!sessions.length) sessionPickerOpen = false
  }

  function handleRowPick(id: string) {
    // A click while another row's delete prompt is armed just dismisses it.
    if (pendingDeleteId && pendingDeleteId !== id) clearPendingDelete()
    pickSession(id)
  }

  function submit() {
    const text = value.trim()
    if (!text || !enabled) return
    if (text === '/sessions') {
      value = ''
      sessionPickerOpen = true
      sessionHighlightedIndex = Math.max(0, sessions.findIndex((s) => s.id === activeSessionId))
      autoResize()
      textarea?.focus()
      return
    }
    value = ''
    requestAnimationFrame(autoResize)
    onSend(text)
  }

  function handleModelChange(e: Event) {
    onModelChange?.((e.currentTarget as HTMLSelectElement).value)
  }

  function handleModeChange(e: Event) {
    onModeChange?.((e.currentTarget as HTMLSelectElement).value as 'read-only' | 'workspace-write')
  }

  function handleModelClick() {
    onModelRefresh?.()
  }
</script>

<div class="typ-chat-inputbar">
  <div class="typ-input-wrap">
    {#if sessionPickerOpen}
      <SessionPicker
        {sessions}
        {activeSessionId}
        highlightedIndex={Math.min(sessionHighlightedIndex, Math.max(0, sessions.length - 1))}
        onPick={handleRowPick}
        onDelete={handleDeleteSession}
        {pendingDeleteId}
      />
    {:else if suggestionsOpen}
      <SlashCommandSuggestions
        {suggestions}
        {highlightedIndex}
        onPick={applySuggestion}
      />
    {/if}

    <textarea
      bind:this={textarea}
      bind:value={value}
      rows="1"
      {placeholder}
      oninput={handleInput}
      onkeydown={handleKeydown}
      onblur={handleBlur}
    ></textarea>

    <div class="typ-input-actions">
      <select
        class="typ-input-mode"
        value={mode}
        onchange={handleModeChange}
        title={t.chat.modeTitle}
        disabled={!enabled}
      >
        <option value="read-only">{t.chat.modeReadOnly}</option>
        <option value="workspace-write">{t.chat.modeWorkspaceWrite}</option>
      </select>

      <select
        class="typ-input-model"
        value={model}
        onchange={handleModelChange}
        onclick={handleModelClick}
        title={t.chat.selectModelTitle}
        disabled={!enabled}
      >
        {#if !model}
          <option value="" disabled>{t.chat.selectModel}</option>
        {/if}
        {#if model && !models.includes(model)}
          <option value={model}>{model}</option>
        {/if}
        {#each models as m (m)}
          <option value={m}>{m}</option>
        {/each}
      </select>

      <ContextUsageRing size={16} />

      {#if enabled}
        <button
          class="typ-send-btn"
          onclick={submit}
          disabled={!value.trim()}
          title={t.chat.send}
        >➤</button>
      {:else}
        <button class="typ-stop-btn" onclick={onStop} title={t.chat.stop}>■</button>
      {/if}
    </div>
  </div>
</div>

<style lang="scss">
  :global {
    .typ-chat-inputbar {
      flex: 0 0 auto;
      display: flex;
      align-items: flex-end;
      padding: 12px 16px calc(12px + env(safe-area-inset-bottom, 0px));
      border-top: 1px solid rgb(var(--typ-border-color));
      background-color: var(--bg-color, #fff);

      .typ-input-wrap {
        flex: 1;
        position: relative; /* anchor for the skill suggestion list */
        display: flex;
        flex-direction: column;
        border: 1px solid rgb(var(--typ-border-color));
        border-radius: var(--typ-radius-m);
        background-color: var(--bg-color, #fff);

        &:focus-within {
          border-color: var(--primary-color, rgb(30, 136, 229));
        }
      }

      textarea {
        flex: none;
        width: 100%;
        min-height: 42px;
        max-height: 300px;
        padding: 10px 14px 2px;
        border: none;
        border-radius: 0;
        background: transparent;
        color: var(--text-color, rgb(var(--typ-text-color)));
        font-size: 14px;
        font-family: inherit;
        line-height: 1.4;
        resize: none;
        outline: none;
        overflow-y: hidden;

        &::placeholder {
          color: var(--control-text-color, rgb(var(--typ-color-gray-3)));
        }
      }
    }

    .typ-input-actions {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 8px;
      padding: 2px 10px 8px;
    }

    .typ-input-model,
    .typ-input-mode {
      max-width: 150px;
      padding: 2px 6px 2px 8px;
      border: 1px solid rgb(var(--typ-border-color));
      border-radius: 6px;
      color: var(--control-text-color, rgb(var(--typ-color-gray-3)));
      font-size: 12px;
      line-height: 1.4;
      cursor: pointer;
      outline: none;
      user-select: none;

      &:hover,
      &:focus {
        border-color: var(--primary-color, rgb(30, 136, 229));
      }

      &:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }
    }

    .typ-send-btn,
    .typ-stop-btn {
      flex: 0 0 auto;
      width: 34px;
      height: 34px;
      border: none;
      border-radius: 50%;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
    }

    .typ-send-btn {
      background-color: var(--primary-color, rgb(30, 136, 229));
      color: var(--primary-btn-text-color, #fff);

      &:hover {
        opacity: 0.9;
      }

      &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
    }

    .typ-stop-btn {
      background-color: rgb(var(--typ-color-red-3));
      color: #fff;

      &:hover {
        background-color: rgb(var(--typ-color-red-4));
      }
    }
  }
</style>
