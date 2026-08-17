<script>
  import MessageBubble from './MessageBubble.svelte'
  import { t } from '../../i18n'

  let {
    messages = [],
    thinking = false,
  } = $props()

  let metaMessageIds = $derived.by(() => {
    const ids = new Set()
    let lastAssistantId = null

    for (const message of messages) {
      if (message.type === 'user') {
        if (lastAssistantId) ids.add(lastAssistantId)
        lastAssistantId = null
      } else if (message.type === 'assistant') {
        lastAssistantId = message.id
      }
    }

    if (lastAssistantId) ids.add(lastAssistantId)
    return ids
  })

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
    <MessageBubble {message} showMeta={metaMessageIds.has(message.id)} />
  {/each}

  {#if thinking}
    <div class="typ-thinking" aria-label={t.chat.thinking}>
      <span></span>
      <span></span>
      <span></span>
    </div>
  {/if}
</div>

<style lang="scss">
  :global {
    .typ-chat-messages {
      flex: 1 1 0;
      overflow-y: auto;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      scroll-behavior: auto;
    }

    .typ-thinking {
      align-self: flex-start;
      display: flex;
      gap: 4px;
      padding: 8px 0;
      border-radius: 2px 12px 12px 12px;
      background-color: var(--bg-color, #fff);

      span {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background-color: rgb(var(--typ-color-gray-3));
        animation: typ-pulse 1.4s infinite ease-in-out;

        &:nth-child(1) {
          animation-delay: 0s;
        }

        &:nth-child(2) {
          animation-delay: 0.2s;
        }

        &:nth-child(3) {
          animation-delay: 0.4s;
        }
      }
    }

    .typ-tool-call,
    .typ-tool-result {
      align-self: flex-start;
      max-width: 92%;
      width: 92%;
      border: 1px solid rgb(var(--typ-border-color));
      border-radius: var(--typ-radius-m);
      background-color: var(--bg-color, #fff);
      font-size: 12px;

      summary {
        display: flex;
        align-items: center;
        gap: 0.4rem;
        padding: 6px 10px;
        cursor: pointer;
        user-select: none;
        color: var(--control-text-color, rgb(var(--typ-color-gray-4)));
        list-style: none;

        &::-webkit-details-marker {
          display: none;
        }
      }

      &__body {
        padding: 6px 10px;
        border-top: 1px solid rgb(var(--typ-border-color));
        max-height: 260px;
        overflow-y: auto;

        pre {
          margin: 0;
          white-space: pre-wrap;
          word-break: break-word;
          font-family: var(--font-mono, Consolas, monospace);
          font-size: 11px;
          color: var(--text-color, rgb(var(--typ-text-color)));
        }
      }
    }

    .typ-tool-status {
      display: inline-block;
      width: 10px;
      height: 10px;
      border-radius: 50%;
      flex: 0 0 auto;

      &--thinking {
        background: #faad14;
      }
    }

    @keyframes typ-pulse {
      0%,
      80%,
      100% {
        opacity: 0.3;
        transform: scale(0.8);
      }

      40% {
        opacity: 1;
        transform: scale(1);
      }
    }
  }
</style>
