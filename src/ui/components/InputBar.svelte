<script lang="ts">
  import { t } from '@/i18n'
  import DraftTextarea from './DraftTextarea.svelte'
  import InputToolbar from './InputToolbar.svelte'
  import SlashCommandSuggestions from './SlashCommandSuggestions.svelte'
  import SessionPicker from './SessionPicker.svelte'
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

  // --- slash-command autocomplete -------------------------------------------
  const suggestions = $derived(computeSuggestions({ skills, value }))
  let suggestionsOpen = $state(false)
  let highlightedIndex = $state(0)

  // --- /sessions session picker ---------------------------------------------
  let sessionPickerOpen = $state(false)
  let sessionHighlightedIndex = $state(0)

  // Inline two-step delete confirmation: first click arms the row, a second
  // click (or Enter) deletes — replaces native window.confirm(), which freezes
  // the host Typora UI for tens of seconds. Dismissed after a timeout.
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
    // Recompute visibility + reset highlight whenever the suggestion list changes;
    // drop a pending delete prompt if its session disappeared from the list.
    suggestionsOpen = suggestionsShouldBeOpen({ skills, value }, enabled)
    highlightedIndex = 0
    if (pendingDeleteId && !sessions.some((s) => s.id === pendingDeleteId)) clearPendingDelete()
  })

  $effect(() => {
    return () => { if (pendingDeleteTimer != null) clearTimeout(pendingDeleteTimer) }
  })

  function autoResize() {
    textarea?.dispatchEvent(new Event('input')) // DraftTextarea owns the sizing.
  }

  // --- key handling ----------------------------------------------------------
  function handleKeydown(e: KeyboardEvent) {
    if (sessionPickerOpen && sessions.length) {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault(); sessionHighlightedIndex = (sessionHighlightedIndex + 1) % sessions.length; return
        case 'ArrowUp':
          e.preventDefault(); sessionHighlightedIndex = (sessionHighlightedIndex - 1 + sessions.length) % sessions.length; return
      }
      const index = Math.min(sessionHighlightedIndex, sessions.length - 1)
      if ((e.key === 'Enter' && !e.shiftKey) || (onDeleteSession && (e.key === 'Delete' || e.key === 'Backspace'))) {
        e.preventDefault()
        const s = sessions[index]
        // Enter / Delete confirm an armed delete prompt; Enter otherwise picks.
        if (pendingDeleteId === s.id) {
          clearPendingDelete()
          onDeleteSession?.(s)
        } else {
          if (e.key === 'Enter') pickSession(s.id)
          else armDelete(s.id, s.title)
        }
        return
      }
    }

    if (sessionPickerOpen && e.key === 'Escape') {
      sessionPickerOpen = false
      textarea?.focus()
      return
    }

    if (suggestionsOpen && suggestions.length) {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault(); highlightedIndex = (highlightedIndex + 1) % suggestions.length; return
        case 'ArrowUp':
          e.preventDefault(); highlightedIndex = (highlightedIndex - 1 + suggestions.length) % suggestions.length; return
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

  // --- actions ----------------------------------------------------------------
  function applySuggestion(suggested: string) {
    if (suggested === '/sessions') return openSessionsPicker()
    if (shouldCompleteSubcommand(suggested)) {
      // `/skill` → `/skill:` and keep the list open for skill filtering.
      value = `${suggested}:`
      suggestionsOpen = true
      highlightedIndex = 0
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
    // Two-step delete: first click arms the prompt, second click deletes.
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

  function openSessionsPicker() {
    value = '' // /sessions: swap suggestions for the picker, starting on active session.
    suggestionsOpen = false
    sessionPickerOpen = true
    sessionHighlightedIndex = Math.max(0, sessions.findIndex((s) => s.id === activeSessionId))
    textarea?.focus()
  }

  function submit() {
    const text = value.trim()
    if (!text || !enabled) return
    if (text === '/sessions') return openSessionsPicker()
    value = ''
    onSend(text)
  }

  function handleBlur() {
    // Delay so click events on the suggestion/session list fire first.
    setTimeout(() => {
      suggestionsOpen = false
      sessionPickerOpen = false
      clearPendingDelete()
    }, 150)
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

    <DraftTextarea
      bind:value
      {placeholder}
      disabled={!enabled}
      textAreaEl={(el) => { textarea = el; if (textAreaEl) textAreaEl(el) }}
      {refill}
      onKeydown={handleKeydown}
      onBlur={handleBlur}
    />

    <InputToolbar
      {enabled}
      {model}
      {models}
      {mode}
      canSend={!!value.trim()}
      {onModelChange}
      {onModelRefresh}
      {onModeChange}
      onSend={submit}
      {onStop}
    />
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
    }
  }
</style>
