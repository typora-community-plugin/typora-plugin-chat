<script lang="ts">
  import { scheduleContextUsageRefresh } from '@/store/context-usage-store'

  let {
    value = $bindable(''),
    placeholder,
    disabled = false,
    textAreaEl = null,
    refill = $bindable(null),
    onKeydown = null,
    onBlur = null,
  }: {
    /** Draft text (two-way bound to the parent). */
    value: string
    placeholder?: string
    disabled?: boolean
    /** Optional callback receiving the textarea element (null on unmount). */
    textAreaEl?: ((el: HTMLTextAreaElement | null) => void) | null
    /** One-shot refill (e.g. /undo): when non-null, becomes editable draft text and is cleared. */
    refill: string | null
    onKeydown?: ((e: KeyboardEvent) => void) | null
    onBlur?: (() => void) | null
  } = $props()

  let textarea = $state<HTMLTextAreaElement | null>(null)

  // Keep the context-usage ring in sync with the draft being typed.
  $effect(() => {
    scheduleContextUsageRefresh(value)
  })

  const MAX_HEIGHT = 300

  function autoResize() {
    if (!textarea) return
    textarea.style.height = 'auto'
    const height = Math.min(textarea.scrollHeight, MAX_HEIGHT)
    textarea.style.height = height + 'px'
    textarea.style.overflowY = textarea.scrollHeight > MAX_HEIGHT ? 'auto' : 'hidden'
  }

  $effect(() => {
    if (textAreaEl) textAreaEl(textarea)
    return () => { if (textAreaEl) textAreaEl(null) }
  })

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
</script>

<textarea
  class="typ-draft-textarea"
  bind:this={textarea}
  bind:value={value}
  rows="1"
  {placeholder}
  {disabled}
  oninput={handleInput}
  onkeydown={(e) => onKeydown?.(e)}
  onblur={() => onBlur?.()}
></textarea>

<style lang="scss">
  :global {
    .typ-draft-textarea {
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
</style>
