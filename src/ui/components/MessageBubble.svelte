<script lang="ts">
  import { markdown } from '@/ui/global'
  import ToolCallDetail from './ToolCallDetail.svelte'
  import { t } from '@/i18n'
  import type { AssistantMeta } from '@/config/types'

  let {
    message,
    showMeta = false,
  } = $props()

  function formatDuration(ms: number) {
    const totalSeconds = ms / 1000
    if (totalSeconds < 1) return `${Math.round(ms)}ms`
    if (totalSeconds < 60) return `${totalSeconds.toFixed(1)}s`
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = Math.round(totalSeconds % 60)
    return `${minutes}m ${seconds}s`
  }

  function formatSpeed(meta: AssistantMeta) {
    const value = meta.speed ?? 0
    const unit = meta.speedUnit === 'tokens' ? t.chat.speedTokensPerSecond : t.chat.speedCharsPerSecond
    return `${value.toFixed(1)} ${unit}`
  }
</script>

{#if message.type === 'user'}
  <div class="typ-user-msg">{message.text}</div>

{:else if message.type === 'assistant'}
  <div
    class="typ-assistant-msg"
    class:typ-assistant-msg--question={message.isError === false && message.toolName === 'ask_user'}
  >
    <div class="typ-message-content" use:markdown={message.text}></div>
    {#if showMeta && message.meta}
      <div class="typ-assistant-meta">
        {#if message.meta.aborted}
          <span class="typ-assistant-meta__item" title={t.chat.metaInterrupted}>
            <span class="typ-assistant-meta__icon" aria-hidden="true">⏸</span>
            <span>{t.chat.metaInterrupted}</span>
          </span>
        {/if}
        <span class="typ-assistant-meta__item" title={t.chat.metaModel}>
          <span class="typ-assistant-meta__icon" aria-hidden="true">🤖</span>
          <span>{message.meta.model}</span>
        </span>
        <span class="typ-assistant-meta__item" title={t.chat.metaDuration}>
          <span class="typ-assistant-meta__icon" aria-hidden="true">🕐</span>
          <span>{formatDuration(message.meta.durationMs)}</span>
        </span>
        {#if message.meta.speed != null && message.meta.speed > 0}
          <span class="typ-assistant-meta__item" title={t.chat.metaSpeed}>
            <span class="typ-assistant-meta__icon" aria-hidden="true">⚡</span>
            <span>{formatSpeed(message.meta)}</span>
          </span>
        {/if}
      </div>
    {/if}
  </div>

{:else if message.type === 'tool_call' || message.type === 'tool_result'}
  <ToolCallDetail {message} />

{:else if message.type === 'thinking'}
  <div class="typ-tool-call">
    <details>
      <summary>
        <span class="typ-tool-status typ-tool-status--thinking"></span>
        <strong>{t.chat.thinkingLabel}</strong>
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
      margin-top: 16px;
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

      .typ-assistant-meta {
        display: flex;
        flex-wrap: wrap;
        gap: 4px 12px;
        margin-top: 6px;
        padding-top: 6px;
        border-top: 1px solid rgb(var(--typ-border-color));
        font-size: 11px;
        line-height: 1.4;
        color: var(--control-text-color, rgb(var(--typ-color-gray-4)));
      }

      .typ-assistant-meta__item {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        cursor: default;
      }

      .typ-assistant-meta__icon {
        filter: grayscale(1);
        opacity: 0.8;
        font-size: 12px;
        line-height: 1;
      }

      .typ-markdown-preview {
        padding: 0;
      }
    }

    .typ-error-msg {
      align-self: flex-start;
      max-width: 92%;
      padding: 8px 14px;
      border-radius: 0 var(--typ-radius-m) var(--typ-radius-m);
      background-color: rgba(var(--typ-color-red-1), 0.25);
      color: rgb(var(--typ-color-red-3));
      font-size: 13px;
      line-height: 1.5;
      word-break: break-word;
    }
  }
</style>
