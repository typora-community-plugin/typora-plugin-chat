<script lang="ts">
  import type { AgentMode } from '@/config/types'
  import { listModes } from '@/agent/modes'
  import { t } from '@/i18n'

  const modes = listModes()

  function label(key: string): string {
    return (t.chat as Record<string, unknown>)[key] as string ?? key
  }
  import ContextUsageRing from './ContextUsageRing.svelte'

  let {
    enabled,
    model = '',
    models = [],
    modelSelectDisabled = false,
    mode = 'workspace-write' as AgentMode,
    canSend = false,
    onModelChange = null,
    onModelRefresh = null,
    onModeChange = null,
    onSend,
    onStop,
  }: {
    /** Whether the agent is idle (send button shown) or running (stop button). */
    enabled: boolean
    model?: string
    models?: string[]
    /** Disables the model dropdown (e.g. active provider is disabled). */
    modelSelectDisabled?: boolean
    mode?: AgentMode
    /** True when the current draft text would submit. */
    canSend?: boolean
    onModelChange?: ((model: string) => void) | null
    onModelRefresh?: (() => void) | null
    onModeChange?: ((mode: AgentMode) => void) | null
    onSend: () => void
    onStop: () => void
  } = $props()

  function handleModelChange(e: Event) {
    onModelChange?.((e.currentTarget as HTMLSelectElement).value)
  }

  function handleModeChange(e: Event) {
    onModeChange?.((e.currentTarget as HTMLSelectElement).value as AgentMode)
  }

  function handleModelClick() {
    onModelRefresh?.()
  }
</script>

<div class="typ-input-actions">
  <select
    class="typ-input-mode"
    value={mode}
    onchange={handleModeChange}
    title={t.chat.modeTitle}
    disabled={!enabled}
  >
    {#each modes as m (m.id)}
      <option value={m.id}>{label(m.labelKey.split('.').pop()!)}</option>
    {/each}
  </select>

  <select
    class="typ-input-model"
    value={model}
    onchange={handleModelChange}
    onclick={handleModelClick}
    title={t.chat.selectModelTitle}
    disabled={!enabled || modelSelectDisabled}
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

  <ContextUsageRing size={16} />

  {#if enabled}
    <button class="typ-send-btn" onclick={onSend} disabled={!canSend} title={t.chat.send}>➤</button>
  {:else}
    <button class="typ-stop-btn" onclick={onStop} title={t.chat.stop}>■</button>
  {/if}
</div>

<style lang="scss">
  :global {
    .typ-input-actions {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 8px;
      padding: 2px 10px 8px;
    }

    .typ-input-model,
    .typ-input-mode {
      width: calc(var(--typ-sidedock-width) / 3.8);
      padding: 2px 6px 2px 8px;
      border: 1px solid rgb(var(--typ-border-color));
      border-radius: 6px;
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
