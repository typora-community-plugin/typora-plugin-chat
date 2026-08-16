<script>
  import { t } from '../../i18n'

  let {
    onClear,
  } = $props()
</script>

<div class="typ-chat-header">
  <span class="typ-chat-header__title">{t.chat.title}</span>
  <div class="typ-chat-header__actions">
    <button class="typ-chat-btn typ-chat-btn--danger" onclick={onClear} title={t.chat.clearConversationTitle}>{t.chat.clear}</button>
  </div>
</div>

<style lang="scss">
  :global {
    .typ-chat-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.5rem;
      padding: 10px 16px;
      border-bottom: 1px solid rgb(var(--typ-border-color));
      background-color: var(--bg-color, #fff);
      flex: 0 0 auto;

      &__title {
        font-weight: 600;
        font-size: 15px;
        color: var(--text-color, rgb(var(--typ-text-color)));
      }

      &__actions {
        display: flex;
        gap: 0.5rem;
      }
    }

    .typ-chat-btn {
      height: 28px;
      min-width: unset;
      padding: 0 0.6rem;
      border: 1px solid rgb(var(--typ-border-color));
      border-radius: var(--typ-radius-s);
      background: transparent;
      color: var(--control-text-color, rgb(var(--typ-color-gray-4)));
      font-size: 12px;
      cursor: pointer;

      &:hover {
        background: var(--item-hover-bg-color, rgba(0, 0, 0, 0.05));
      }

      &--danger {
        color: rgb(var(--typ-color-red-3));

        &:hover {
          background: rgba(var(--typ-color-red-1), 0.4);
        }
      }

      &--primary {
        background: var(--primary-color, rgb(30, 136, 229));
        color: var(--primary-btn-text-color, #fff);
        border-color: var(--primary-color, rgb(30, 136, 229));
        opacity: 0.9;

        &:hover {
          opacity: 1;
        }
      }
    }
  }
</style>
