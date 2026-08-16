<script>
  import { t } from '../../i18n'

  let {
    onSend,
    onStop,
    placeholder = t.chat.inputPlaceholder,
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
        title={t.chat.selectModelTitle}
        disabled={!enabled}
      >
        {#if !model}
          <option value="" disabled>{t.chat.selectModel}</option>
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
          title={t.chat.send}
        >➤</button>
      {:else}
        <button class="typ-stop-btn" onclick={onStop} title={t.chat.stop}>■</button>
      {/if}
    </div>
  </div>
</div>

<style lang="scss">
  :global {
    .typ-chat-inputbar {
      flex: 0 0 auto;
      display: flex;
      align-items: flex-end;
      padding: 12px 16px calc(12px + env(safe-area-inset-bottom, 0px));
      border-top: 1px solid rgb(var(--typ-border-color));
      background-color: var(--bg-color, #fff);

      .typ-input-wrap {
        flex: 1;
        display: flex;
        flex-direction: column;
        border: 1px solid rgb(var(--typ-border-color));
        border-radius: var(--typ-radius-m);
        background-color: var(--bg-color, #fff);

        &:focus-within {
          border-color: var(--primary-color, rgb(30, 136, 229));
        }
      }

      textarea {
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

    .typ-input-actions {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 8px;
      padding: 2px 10px 8px;
    }

    .typ-input-model {
      max-width: 150px;
      padding: 2px 6px 2px 8px;
      border: 1px solid rgb(var(--typ-border-color));
      border-radius: 6px;
      background-color: rgb(var(--typ-color-gray-1));
      color: var(--control-text-color, rgb(var(--typ-color-gray-3)));
      font-size: 12px;
      line-height: 1.4;
      cursor: pointer;
      outline: none;
      user-select: none;

      &:hover,
      &:focus {
        border-color: var(--primary-color, rgb(30, 136, 229));
      }

      &:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }
    }

    .typ-send-btn,
    .typ-stop-btn {
      flex: 0 0 auto;
      width: 34px;
      height: 34px;
      border: none;
      border-radius: 50%;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
    }

    .typ-send-btn {
      background-color: var(--primary-color, rgb(30, 136, 229));
      color: var(--primary-btn-text-color, #fff);

      &:hover {
        opacity: 0.9;
      }

      &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
    }

    .typ-stop-btn {
      background-color: rgb(var(--typ-color-red-3));
      color: #fff;

      &:hover {
        background-color: rgb(var(--typ-color-red-4));
      }
    }
  }
</style>
