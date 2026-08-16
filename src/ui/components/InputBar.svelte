<script>
  let {
    onSend,
    onStop,
    placeholder = '输入消息...',
    enabled = true,
    textAreaEl = null,
    model = '',
    models = [],
    onModelChange = null,
    onModelRefresh = null,
  } = $props()

  let value = $state('')
  let textarea = $state(null)

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

  function handleModelChange(e) {
    onModelChange?.(e.currentTarget.value)
  }

  function handleModelClick() {
    onModelRefresh?.()
  }
</script>

<div class="typ-chat-inputbar">
  <div class="typ-input-wrap">
    <textarea
      bind:this={textarea}
      bind:value={value}
      rows="1"
      {placeholder}
      oninput={handleInput}
      onkeydown={handleKeydown}
    ></textarea>

    <div class="typ-input-actions">
      <select
        class="typ-input-model"
        value={model}
        onchange={handleModelChange}
        onclick={handleModelClick}
        title="Select model"
        disabled={!enabled}
      >
        {#if !model}
          <option value="" disabled>Select model</option>
        {/if}
        {#if model && !models.includes(model)}
          <option value={model}>{model}</option>
        {/if}
        {#each models as m (m)}
          <option value={m}>{m}</option>
        {/each}
      </select>

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
  </div>
</div>
