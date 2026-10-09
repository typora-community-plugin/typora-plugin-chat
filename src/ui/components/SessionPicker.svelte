<script lang="ts">
  import { t } from '@/i18n'
  import type { SessionSummary } from '@/store/session-store'

  let {
    sessions,
    activeSessionId,
    highlightedIndex,
    onPick,
    onDelete = null,
    pendingDeleteId = null,
  }: {
    /** Session summaries to display. */
    sessions: SessionSummary[]
    /** Id of the session currently shown in the chat view. */
    activeSessionId: string | null
    /** Index of the currently highlighted entry. */
    highlightedIndex: number
    /** Called with a session id when it is clicked (mousedown). */
    onPick: (id: string) => void
    /** Optional delete handler; when present, rows show a delete button. */
    onDelete?: ((s: SessionSummary) => void) | null
    /** Id of the session whose inline "confirm delete?" prompt is armed. */
    pendingDeleteId?: string | null
  } = $props()

  function handleDelete(e: MouseEvent, s: SessionSummary) {
    e.preventDefault()
    e.stopPropagation()
    onDelete?.(s)
  }
</script>

<div class="typ-session-picker" role="listbox" aria-label={t.chat.sessionPickerTitle}>
  {#if sessions.length}
    <div class="typ-session-picker__title">{t.chat.sessionPickerTitle}</div>
    <ul>
      {#each sessions as s, i (s.id)}
        <li
          role="option"
          aria-selected={s.id === activeSessionId || i === highlightedIndex}
          class:typ-session-active={s.id === activeSessionId}
          class:typ-session-highlighted={i === highlightedIndex}
          class:typ-session-delete-armed={pendingDeleteId === s.id}
          onmousedown={(e) => { e.preventDefault(); onPick(s.id); }}
        >
          <span class="typ-session-title" data-typ-session-delete={onDelete ? '' : undefined}>
            {#if pendingDeleteId === s.id}
              <em class="typ-session-delete-prompt">{typeof t.chat.confirmDelete === 'string' ? t.chat.confirmDelete : 'Confirm delete'}?</em>
            {:else}
              {s.title}
            {/if}
          </span>
          {#if s.id === activeSessionId}
            <span class="typ-session-badge">{t.chat.currentSession}</span>
          {/if}
          {#if onDelete}
            <button
              type="button"
              class="typ-session-delete"
              title={typeof t.chat.deleteSessionTitle === 'string' ? t.chat.deleteSessionTitle : 'Delete session'}
              onmousedown={(e) => handleDelete(e, s)}
            >×</button>
          {/if}
        </li>
      {/each}
    </ul>
  {:else}
    <div class="typ-session-picker__empty">{t.chat.sessionPickerEmpty}</div>
  {/if}
</div>

<style lang="scss">
  :global {
    .typ-session-picker {
      position: absolute;
      bottom: calc(100% + 4px);
      left: 0;
      right: 0;
      max-height: 240px;
      overflow-y: auto;
      padding: 6px;
      border: 1px solid rgb(var(--typ-border-color));
      border-radius: var(--typ-chat-radius-m);
      background-color: var(--bg-color, #fff);
      box-shadow: 0 -4px 12px rgba(0, 0, 0, 0.12);
      z-index: 20;

      &__title {
        padding: 4px 10px 6px;
        font-size: 12px;
        font-weight: 600;
        color: var(--control-text-color, rgb(var(--typ-color-gray-3)));
        user-select: none;
      }

      &__empty {
        padding: 12px 10px;
        font-size: 13px;
        color: var(--control-text-color, rgb(var(--typ-color-gray-3)));
      }

      ul {
        margin: 0;
        padding: 0;
        list-style: none;
      }

      li {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 7px 10px;
        border-radius: 4px;
        font-size: 13px;
        cursor: pointer;
        white-space: nowrap;
        overflow: hidden;

        &:hover,
        &.typ-session-highlighted {
          background-color: rgb(var(--typ-color-gray-1));
        }

        &.typ-session-active {
          color: var(--primary-color, rgb(30, 136, 229));
        }
      }

      .typ-session-title {
        flex: 1 1 auto;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      /* Two-step delete confirmation, shown in place of the row title. */
      li.typ-session-delete-armed {
        color: rgb(var(--typ-color-red-3));

        .typ-session-title {
          cursor: default;
        }
      }

      .typ-session-delete-prompt {
        font-style: normal;
        font-weight: 600;
        white-space: nowrap;
      }

      /* Title spans the whole row (except the badge) so a click anywhere picks it. */
      [data-typ-session-delete] {
        flex-grow: 999;
      }

      .typ-session-delete {
        flex: 0 0 auto;
        width: 18px;
        height: 18px;
        margin: 0 -4px 0 2px;
        padding: 0;
        border: none;
        border-radius: 4px;
        background-color: transparent;
        color: var(--control-text-color, rgb(var(--typ-color-gray-3)));
        font-size: 14px;
        line-height: 18px;
        text-align: center;
        cursor: pointer;

        &:hover {
          background-color: rgba(var(--typ-color-red-3), 0.15);
          color: rgb(var(--typ-color-red-3));
        }
      }

      .typ-session-badge {
        flex: 0 0 auto;
        padding: 1px 6px;
        border: 1px solid var(--primary-color, rgb(30, 136, 229));
        border-radius: 999px;
        font-size: 11px;
        line-height: 1.4;
        color: var(--primary-color, rgb(30, 136, 229));
      }
    }
  }
</style>
