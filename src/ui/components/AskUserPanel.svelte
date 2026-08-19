<script lang="ts">
  import { t } from '@/i18n'
  import type { AskUserQuestionItem, AskUserAnswerItem } from '@/agent/tools/system/ask-user'

  let {
    questions = [],
    onAnswer,
  }: {
    /** The questions to display. */
    questions: AskUserQuestionItem[]
    /** Called with the structured answers when the user submits. */
    onAnswer: (answers: AskUserAnswerItem[]) => void
  } = $props()

  // Per-question state: selected option labels + free-form custom text.
  interface QState {
    selected: string[]
    custom: string
  }
  let states = $state<QState[]>(questions.map(() => ({ selected: [], custom: '' })))

  function toggleOption(qi: number, label: string) {
    const q = questions[qi]
    if (!q?.options?.length) return // single-select for options; no-op guard
    states = states.map((s, i) => {
      if (i !== qi) return s
      const has = s.selected.includes(label)
      return { ...s, selected: has ? s.selected.filter(l => l !== label) : [...s.selected, label] }
    })
  }

  function setCustom(qi: number, text: string) {
    states = states.map((s, i) => (i === qi ? { ...s, custom: text } : s))
  }

  function submit() {
    const answers: AskUserAnswerItem[] = questions.map((q, i) => ({
      id: q.id,
      selected: states[i]?.selected ?? [],
      custom: (states[i]?.custom ?? '').trim() || undefined,
    }))
    onAnswer(answers)
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }
</script>

<div class="typ-ask-user">
  {#each questions as q, qi (q.id)}
    <div class="typ-ask-user__block">
      <div class="typ-ask-user__question">{q.question}</div>

      {#if q.options && q.options.length}
        <div class="typ-ask-user__options" role="group" aria-label={q.question}>
          {#each q.options as opt (opt.label)}
            <label class="typ-ask-user__option">
              <input
                type="radio"
                name={`ask-q-${q.id}`}
                checked={states[qi]?.selected.includes(opt.label) ?? false}
                onchange={() => toggleOption(qi, opt.label)}
                onkeydown={handleKeydown}
              />
              <span>{opt.label}</span>
            </label>
          {/each}
        </div>
      {/if}

      <input
        type="text"
        class="typ-ask-user__custom"
        placeholder={typeof t.chat.typeYourAnswer === 'string' ? t.chat.typeYourAnswer : 'Type your answer...'}
        value={states[qi]?.custom ?? ''}
        oninput={(e) => setCustom(qi, (e.currentTarget as HTMLInputElement).value)}
        onkeydown={handleKeydown}
      />
    </div>
  {/each}

  <button type="button" class="typ-ask-user__submit" onclick={submit}>
    {typeof t.chat.askUserSubmit === 'string' ? t.chat.askUserSubmit : 'Submit'}
  </button>
</div>

<style lang="scss">
  :global {
    .typ-ask-user {
      flex: 0 0 auto;
      margin: 0 16px 8px;
      padding: 12px 14px;
      border: 1px solid rgb(var(--typ-border-color));
      border-left: 3px solid var(--primary-color, rgb(30, 136, 229));
      border-radius: 0 var(--typ-radius-m) var(--typ-radius-m) 0;
      background-color: var(--bg-color, #fff);
      display: flex;
      flex-direction: column;
      gap: 14px;

      &__block {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      &__question {
        font-weight: 500;
        font-size: 13px;
        color: var(--text-color, rgb(var(--typ-text-color)));
      }

      &__options {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      &__option {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 6px 10px;
        border-radius: var(--typ-radius-s, 4px);
        cursor: pointer;
        font-size: 13px;
        color: var(--text-color, rgb(var(--typ-text-color)));

        &:hover {
          background-color: rgba(30, 136, 229, 0.08);
        }

        input[type='radio'] {
          margin: 0;
          accent-color: var(--primary-color, rgb(30, 136, 229));
          flex-shrink: 0;
        }
      }

      &__custom {
        width: 100%;
        height: 32px;
        padding: 0 12px;
        border: 1px solid rgb(var(--typ-border-color));
        border-radius: var(--typ-radius-capsule);
        font-size: 13px;
        outline: none;
        background-color: var(--bg-color, #fff);
        color: var(--text-color, rgb(var(--typ-text-color)));

        &:focus {
          border-color: var(--primary-color, rgb(30, 136, 229));
        }
      }

      &__submit {
        align-self: flex-end;
        padding: 6px 18px;
        border: none;
        border-radius: var(--typ-radius-capsule);
        background-color: var(--primary-color, rgb(30, 136, 229));
        color: #fff;
        font-size: 13px;
        cursor: pointer;

        &:hover {
          opacity: 0.85;
        }
      }
    }
  }
</style>
