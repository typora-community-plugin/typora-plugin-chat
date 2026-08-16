<script>
  import { summarizeToolInput } from '../../tools/summary'
  import { truncate } from '../../utils/helpers'
  import { t } from '../../i18n'

  let { message } = $props()

  const isCall = $derived(message.type === 'tool_call')
  const status = $derived(
    isCall ? 'loading' : (message.toolResult?.isError || message.isError ? 'error' : 'success')
  )
  const summary = $derived(
    message.toolName ? summarizeToolInput(message.toolName, message.toolInput ?? {}) : ''
  )
  const paramsJson = $derived(JSON.stringify(message.toolInput ?? {}, null, 2))
  const resultText = $derived(truncate(message.toolResult?.content ?? '', 2000))
</script>

<div class="typ-tool-call">
  <details>
    <summary>
      <span class="typ-tool-status typ-tool-status--{status}"></span>
      <strong>{message.toolName}</strong>
      {#if summary}
        <span class="typ-tool-call__summary" title={summary}>{summary}</span>
      {/if}
    </summary>

    <div class="typ-tool-call__body">
      <div><strong>{t.chat.parameters}</strong></div>
      <pre>{paramsJson}</pre>

      {#if !isCall}
        <div><strong>{status === 'error' ? t.chat.error : t.chat.result}</strong></div>
        <pre>{resultText}</pre>
      {/if}
    </div>
  </details>
</div>

<style lang="scss">
  :global {
    .typ-tool-call__summary {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: var(--text-color, rgb(var(--typ-text-color)));
      opacity: 0.75;
    }

    .typ-tool-status {
      &--loading {
        border: 2px solid rgb(var(--typ-color-gray-3));
        border-top-color: transparent;
        animation: typ-rotate 0.6s linear infinite;
      }

      &--success {
        background: #27ae60;
      }

      &--error {
        background: rgb(var(--typ-color-red-3));
      }
    }

    @keyframes typ-rotate {
      to {
        transform: rotate(360deg);
      }
    }
  }
</style>
