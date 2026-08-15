<script>
  import { markdown } from '../global'
  import ToolCallDetail from './ToolCallDetail.svelte'

  let { message } = $props()
</script>

{#if message.type === 'user'}
  <div class="typ-user-msg">{message.text}</div>

{:else if message.type === 'assistant'}
  <div
    class="typ-assistant-msg"
    class:typ-assistant-msg--question={message.isError === false && message.toolName === 'ask_user'}
  >
    <div class="typ-message-content" use:markdown={message.text}></div>
  </div>

{:else if message.type === 'tool_call' || message.type === 'tool_result'}
  <ToolCallDetail {message} />

{:else if message.type === 'error'}
  <div class="typ-error-msg">{message.text}</div>

{:else if message.type === 'thinking'}
  <div class="typ-thinking" aria-label="AI is thinking">
    <span></span>
    <span></span>
    <span></span>
  </div>
{/if}
