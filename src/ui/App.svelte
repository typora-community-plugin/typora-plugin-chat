<script>
  import Header from './components/Header.svelte'
  import Messages from './components/Messages.svelte'
  import SelectionPill from './components/SelectionPill.svelte'
  import InputBar from './components/InputBar.svelte'
  import SettingsPanel from './components/SettingsPanel.svelte'
  import {
    chatStore,
    messages,
    thinking,
    inputEnabled,
    selection,
    askUserQuestion,
    inputPlaceholder,
  } from '../store/chat-store'
  import { settings } from '../config/settings'

  let {
    app,
    onSend,
    onStop,
    onClear,
    onSaveSettings,
  } = $props()

  let showSettings = $state(false)

  function handleMainSend(text) {
    if ($askUserQuestion) {
      chatStore.answerAskUser(text)
      return
    }
    onSend(text)
  }
</script>

<div class="typ-chat-view">
  <Header
    model={$settings.model || 'No model'}
    onToggleSettings={() => (showSettings = !showSettings)}
    onClear={onClear}
  />

  {#if showSettings}
    <SettingsPanel
      app={app}
      settings={$settings}
      onSave={(next) => onSaveSettings(next)}
      onClose={() => (showSettings = false)}
    />
  {/if}

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
    onSend={handleMainSend}
    onStop={onStop}
  />
</div>
