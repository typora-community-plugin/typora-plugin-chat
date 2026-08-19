<script lang="ts">
  import Messages from './components/Messages.svelte'
  import SelectionPill from './components/SelectionPill.svelte'
  import InputBar from './components/InputBar.svelte'
  import AskUserPanel from './components/AskUserPanel.svelte'
  import {
    chatStore,
    messages,
    thinking,
    inputEnabled,
    selection,
    askUserQuestion,
    inputPlaceholder,
  } from '@/store/chat-store'
  import {
    activeSessionId as sessionActiveSessionId,
    initSessionStore,
    getActiveSession,
    saveActiveSession,
    sessionSummaries,
    switchSession,
    deleteSession,
  } from '@/store/session-store'
  import { getAgentHistory, setAgentHistory } from '@/agent/history'
  import { refreshContextUsage } from '@/store/context-usage-store'
  import { settings, settingsManager } from '@/config/settings'
  import { writable } from 'svelte/store'
  import { availableModels, refreshModels } from '@/store/models-store'
  import { skills as skillStore } from '@/agent/skills/store'

  import { undoStore } from '@/store/undo-store'
  import { executeSlashCommand } from '@/slash-commands/executor'
  import { t } from '@/i18n'

  let {
    onSend,
    onStop,
    runTurn = null,
  } = $props()

  const skillNames = $derived($skillStore.map((s) => s.name))

  // One-shot channel: /undo writes the rolled-back user message here and App's
  // reactive effect hands it to InputBar as editable draft text.
  const inputRefill = writable<string | null>(null)

  // Initialize session persistence and load the active session into the UI.
  initSessionStore()
  const activeSession = getActiveSession()
  if (activeSession) {
    chatStore.replaceMessages(activeSession.messages)
    setAgentHistory(activeSession.history)
  }
  void refreshContextUsage({ refreshStatic: true })
  const sessionList = $derived($sessionSummaries)
  const activeSessionId = $derived($sessionActiveSessionId)

  // A non-empty inputPlaceholder that is NOT one of the built-in prompts (e.g.
  // "Type your answer…") means /undo just refilled a rolled-back user message:
  // hand it to InputBar as editable draft text and restore the default prompt.
  $effect(() => {
    const p = $inputPlaceholder
    if (!p) return
    if (p === t.chat.inputPlaceholder || p === t.chat.typeYourAnswer) return
    inputRefill.set(p)
    inputPlaceholder.set(t.chat.inputPlaceholder)
  })

  function handleSwitchSession(id: string) {
    const current = getActiveSession()
    if (current && ($messages.length > 0 || getAgentHistory().length > 0)) {
      saveActiveSession(chatStore.getMessages(), getAgentHistory())
    }
    // /undo and /redo are session-scoped: dropping both stacks guarantees
    // switching sessions cannot reach across boundaries.
    undoStore.clear()
    undoStore.clearRedo()
    const target = switchSession(id)
    if (target) {
      chatStore.replaceMessages(target.messages)
      chatStore.clearSelection()
      setAgentHistory(target.history)
      void refreshContextUsage({ refreshStatic: true })
    }
  }

  function handleDeleteSession(s: { id: string; title: string }) {
    // Confirmation happens inline in the picker (InputBar's two-step prompt);
    // a native window.confirm() would freeze the whole Typora UI for seconds.
    const target = deleteSession(s.id)
    // Drop the undo/redo stacks of the deleted session so they can never be
    // replayed across a boundary, then load whatever is now active.
    undoStore.clear()
    undoStore.clearRedo()
    if (target) {
      chatStore.replaceMessages(target.messages)
      chatStore.clearSelection()
      setAgentHistory(target.history)
      void refreshContextUsage({ refreshStatic: true })
    }
  }

  async function handleMainSend(text: string) {
    if ($askUserQuestion) return // AskUserPanel handles its own submit
    if (!runTurn) return
    await executeSlashCommand(text, {
      skills: skillNames,
      runTurn,
      onSend: (t) => onSend(t),
    })
  }
</script>

<div class="typ-chat-view">
  <Messages messages={$messages} thinking={$thinking} />

  {#if $askUserQuestion}
    <AskUserPanel questions={$askUserQuestion} onAnswer={(answers) => chatStore.answerAskUser(answers)} />
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
    sessions={sessionList}
    activeSessionId={activeSessionId}
    onSwitchSession={handleSwitchSession}
    onDeleteSession={handleDeleteSession}
    onModelChange={(model) => settingsManager.save({ model })}
    onModelRefresh={() => refreshModels()}
    mode={$settings.mode ?? 'workspace-write'}
    onModeChange={(mode) => settingsManager.save({ mode })}
    onSend={handleMainSend}
    onStop={onStop}
    refill={$inputRefill}
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
  }
</style>
