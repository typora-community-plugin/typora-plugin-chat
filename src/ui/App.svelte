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

  let {
    onSend,
    onStop,
    onClear,
  } = $props()

  function handleMainSend(text) {
    if ($askUserQuestion) {
      chatStore.answerAskUser(text)
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
    onModelChange={(model) => settingsManager.save({ model })}
    onModelRefresh={() => refreshModels()}
    onSend={handleMainSend}
    onStop={onStop}
  />
</div>
