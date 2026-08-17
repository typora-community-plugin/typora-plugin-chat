<script>
  import Header from './components/Header.svelte'
  import Messages from './components/Messages.svelte'
  import SelectionPill from './components/SelectionPill.svelte'
  import InputBar from './components/InputBar.svelte'
  import {
    chatStore,
    messages,
    thinking,
    inputEnabled,
    selection,
    askUserQuestion,
    inputPlaceholder,
  } from '../store/chat-store'
  import { settings, settingsManager } from '../config/settings'
  import { availableModels, refreshModels } from '../store/models-store'
  import { skills as skillStore } from '../skills/store'

  let {
    onSend,
    onStop,
    onClear,
    onNew = null,
    onSkillInvoke = null,
  } = $props()

  const skillNames = $derived($skillStore.map((s) => s.name))

  function handleMainSend(text) {
    if ($askUserQuestion) {
      chatStore.answerAskUser(text)
      return
    }
    // /new [rest] — start a fresh conversation; any trailing text is sent as the first turn.
    const newMatch = text.match(/^\/new\s*([\s\S]*)$/)
    if (newMatch && onNew) {
      onNew(newMatch[1]?.trim() ?? '')
      return
    }
    // /skill:<name> [rest] — explicit, user-initiated skill invocation.
    const match = text.match(/^\/skill:([A-Za-z0-9_-]+)\s*([\s\S]*)$/i)
    if (match && onSkillInvoke) {
      onSkillInvoke(match[1], match[2] ?? '')
      return
    }
    onSend(text)
  }
</script>

<div class="typ-chat-view">
  <Header onClear={onClear} />

  <Messages messages={$messages} thinking={$thinking} />

  {#if $askUserQuestion}
    <div class="typ-ask-user">
      <div class="typ-ask-user__question">{$askUserQuestion}</div>
    </div>
  {/if}

  {#if $selection}
    <SelectionPill selection={$selection} onClear={() => chatStore.clearSelection()} />
  {/if}

  <InputBar
    placeholder={$inputPlaceholder}
    enabled={$inputEnabled}
    model={$settings.model}
    models={$availableModels}
    skills={skillNames}
    onModelChange={(model) => settingsManager.save({ model })}
    onModelRefresh={() => refreshModels()}
    onSend={handleMainSend}
    onStop={onStop}
  />
</div>

<style lang="scss">
  :global {
    .typ-chat-view {
      width: 100%;
      height: 100%;
      display: flex;
      flex: 1;
      flex-direction: column;
      overflow: hidden;
      background-color: var(--bg-color, #f5f5f5);
      color: var(--text-color, rgb(var(--typ-text-color)));
      font-size: 14px;
    }

    .typ-ask-user {
      flex: 0 0 auto;
      margin: 0 16px 8px;
      padding: 10px 14px;
      border: 1px solid rgb(var(--typ-border-color));
      border-left: 3px solid var(--primary-color, rgb(30, 136, 229));
      border-radius: 0 var(--typ-radius-m) var(--typ-radius-m) 0;
      background-color: var(--bg-color, #fff);
      display: flex;
      flex-direction: column;
      gap: 8px;

      &__question {
        font-weight: 500;
        font-size: 13px;
        color: var(--text-color, rgb(var(--typ-text-color)));
      }

      &__row {
        display: flex;
        gap: 8px;

        input {
          flex: 1;
          height: 32px;
          padding: 0 12px;
          border: 1px solid rgb(var(--typ-border-color));
          border-radius: var(--typ-radius-capsule);
          font-size: 14px;
          outline: none;
          background-color: var(--bg-color, #fff);
          color: var(--text-color, rgb(var(--typ-text-color)));

          &:focus {
            border-color: var(--primary-color, rgb(30, 136, 229));
          }
        }
      }
    }
  }
</style>
