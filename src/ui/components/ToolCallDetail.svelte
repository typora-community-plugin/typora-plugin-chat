<script>
  import { truncate } from '../../utils/helpers'

  let { message } = $props()

  const isCall = $derived(message.type === 'tool_call')
  const status = $derived(
    isCall ? 'loading' : (message.toolResult?.isError || message.isError ? 'error' : 'success')
  )
  const statusLabel = $derived(isCall ? 'running' : (status === 'error' ? 'failed' : 'done'))
  const paramsJson = $derived(JSON.stringify(message.toolInput ?? {}, null, 2))
  const resultText = $derived(truncate(message.toolResult?.content ?? '', 2000))
</script>

<div class="typ-tool-call">
  <details>
    <summary>
      <span class="typ-tool-status typ-tool-status--{status}"></span>
      <strong>{message.toolName}</strong>
      <span>({statusLabel})</span>
    </summary>

    <div class="typ-tool-call__body">
      <div><strong>Parameters</strong></div>
      <pre>{paramsJson}</pre>

      {#if !isCall}
        <div><strong>{status === 'error' ? 'Error' : 'Result'}</strong></div>
        <pre>{resultText}</pre>
      {/if}
    </div>
  </details>
</div>
