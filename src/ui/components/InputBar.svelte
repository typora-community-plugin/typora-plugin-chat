<script>
  let {
    onSend,
    onStop,
    placeholder = '输入消息...',
    enabled = true,
    textAreaEl = null,
  } = $props()

  let value = $state('')
  let textarea = $state(null)

  $effect(() => {
    if (textAreaEl) textAreaEl(textarea)
    return () => { if (textAreaEl) textAreaEl(null) }
  })

  function autoResize() {
    if (!textarea) return
    textarea.style.height = 'auto'
    textarea.style.height = Math.min(textarea.scrollHeight, 300) + 'px'
  }

  function handleInput() {
    autoResize()
  }

  function handleKeydown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  function submit() {
    const text = value.trim()
    if (!text || !enabled) return
    value = ''
    requestAnimationFrame(autoResize)
    onSend(text)
  }
</script>

<div class="typ-chat-inputbar">
  <textarea
    bind:this={textarea}
    bind:value={value}
    rows="1"
    {placeholder}
    oninput={handleInput}
    onkeydown={handleKeydown}
  ></textarea>

  {#if enabled}
    <button
      class="typ-send-btn"
      onclick={submit}
      disabled={!value.trim()}
      title="Send (Enter)"
    >➤</button>
  {:else}
    <button class="typ-stop-btn" onclick={onStop} title="Stop">■</button>
  {/if}
</div>
