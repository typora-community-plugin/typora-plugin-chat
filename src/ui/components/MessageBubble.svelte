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

{:else if message.type === 'thinking'}
  <div class="typ-tool-call">
    <details>
      <summary>
        <span class="typ-tool-status typ-tool-status--thinking"></span>
        <strong>Thinking</strong>
      </summary>
      <div class="typ-tool-call__body" use:markdown={message.text}></div>
    </details>
  </div>

{:else if message.type === 'error'}
  <div class="typ-error-msg">{message.text}</div>
{/if}

<style lang="scss">
  :global {
    .typ-user-msg {
      align-self: flex-end;
      max-width: 85%;
      padding: 8px 14px;
      border-radius: 12px 2px 12px 12px;
      background-color: var(--primary-color, rgb(30, 136, 229));
      color: var(--primary-btn-text-color, #fff);
      white-space: pre-wrap;
      word-break: break-word;
      font-size: 14px;
      line-height: 1.5;
    }

    .typ-assistant-msg {
      align-self: flex-start;
      max-width: 92%;
      padding: 8px 0;
      border-radius: 2px 12px 12px 12px;
      background-color: var(--bg-color, #fff);
      color: var(--text-color, rgb(var(--typ-text-color)));
      font-size: 14px;
      line-height: 1.55;
      word-break: break-word;

      &--question {
        border-left: 3px solid var(--primary-color, rgb(30, 136, 229));
        font-weight: 500;
      }

      .typ-markdown-preview {
        padding: 0;
      }
    }

    .typ-error-msg {
      align-self: flex-start;
      max-width: 92%;
      padding: 8px 14px;
      border-left: 3px solid rgb(var(--typ-color-red-3));
      border-radius: 0 var(--typ-radius-m) var(--typ-radius-m) 0;
      background-color: rgba(var(--typ-color-red-1), 0.25);
      color: var(--text-color, rgb(var(--typ-text-color)));
      font-size: 13px;
      line-height: 1.5;
      word-break: break-word;
    }
  }
</style>
