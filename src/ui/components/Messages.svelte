<script>
  import MessageBubble from './MessageBubble.svelte'

  let {
    messages = [],
    thinking = false,
  } = $props()

  let messagesEl = $state(null)

  $effect(() => {
    // track both message count and thinking state so new content triggers scroll
    messages.length
    thinking
    requestAnimationFrame(() => {
      if (messagesEl) messagesEl.scrollTop = messagesEl.scrollHeight
    })
  })
</script>

<div class="typ-chat-messages" bind:this={messagesEl}>
  {#each messages as message (message.id)}
    <MessageBubble {message} />
  {/each}

  {#if thinking}
    <div class="typ-thinking" aria-label="AI is thinking">
      <span></span>
      <span></span>
      <span></span>
    </div>
  {/if}
</div>
