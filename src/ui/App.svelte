<script lang="ts">
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
  } from '@/store/chat-store'
  import {
    activeSessionId as sessionActiveSessionId,
    initSessionStore,
    getActiveSession,
    saveActiveSession,
    sessionSummaries,
    switchSession,
  } from '@/store/session-store'
  import { getAgentHistory, popLastAgentTurn, setAgentHistory } from '@/agent/loop'
  import { refreshContextUsage } from '@/store/context-usage-store'
  import { settings, settingsManager } from '@/config/settings'
  import { writable } from 'svelte/store'
  import { availableModels, refreshModels } from '@/store/models-store'
  import { skills as skillStore } from '@/agent/skills/store'

  import { undoStore } from '@/store/undo-store'
  import { executeUndo } from '@/agent/tools/system/undo'

  import { t } from '@/i18n'

  let {
    onSend,
    onStop,
    onNew = null,
    onSkillInvoke = null,
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
    // /undo is session-scoped: dropping the stack here guarantees switching to
    // another session cannot undo mutations made in a different one.
    undoStore.clear()
    const target = switchSession(id)
    if (target) {
      chatStore.replaceMessages(target.messages)
      chatStore.clearSelection()
      setAgentHistory(target.history)
      void refreshContextUsage({ refreshStatic: true })
    }
  }

  async function handleMainSend(text: string) {
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
    // /undo — reverse ALL write-tool calls from the most recent agent turn in
    // this session (see undo.ts). No args, no agent loop. On success it also
    // removes that whole turn from the transcript + agent history and refills
    // its user message into the input box; on failure only an error is shown.
    if (/^\/undo\s*$/.test(text)) {
      const result = await executeUndo()
      if (result.isError) {
        chatStore.addError(result.content)
      } else {
        // Remove the rolled-back turn from both stores, keeping their removals
        // in sync so a later /sessions save or reload stays consistent.
        const userText = chatStore.popLastUserTurn() ?? popLastAgentTurn()
        if (userText) inputPlaceholder.set(userText)
      }
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
    sessions={sessionList}
    activeSessionId={activeSessionId}
    onSwitchSession={handleSwitchSession}
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
