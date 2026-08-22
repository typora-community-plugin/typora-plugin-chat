<script lang="ts">
  import { basename, truncateMiddle } from '@/utils/helpers'
  import { format, t } from '@/i18n'

  let { selection, onClear } = $props()

  const fileName = $derived(selection?.filePath ? basename(selection.filePath) : t.chat.editor)
  const title = $derived(selection?.filePath
    ? format(t.chat.selectionFrom, { fileName })
    : t.chat.selectionFromEditor)
  const preview = $derived(truncateMiddle(selection?.text ?? '', 80))
</script>

<div class="typ-selection-pill">
  <div class="typ-selection-pill__content">
    <div class="typ-selection-pill__content__title">{title}</div>
    <div class="typ-selection-pill__content__preview">{preview}</div>
  </div>
  <button class="typ-selection-pill__clear" onclick={onClear} title={t.chat.clearSelection}>×</button>
</div>

<style lang="scss">
  :global {
    .typ-selection-pill {
      flex: 0 0 auto;
      margin: 0 16px 8px;
      padding: 8px 10px;
      border: 1px solid rgb(var(--typ-border-color));
      border-radius: var(--typ-radius-m);
      background-color: var(--bg-color, #fff);
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;

      &__content {
        flex: 1;
        min-width: 0;

        &__title {
          color: var(--control-text-color, rgb(var(--typ-color-gray-3)));
          margin-bottom: 2px;
        }

        &__preview {
          color: var(--text-color, rgb(var(--typ-text-color)));
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
      }

      &__clear {
        border: none;
        background: transparent;
        color: var(--control-text-color, rgb(var(--typ-color-gray-4)));
        cursor: pointer;
        font-size: 14px;
        padding: 2px 6px;
        border-radius: 50%;

        &:hover {
          background: var(--item-hover-bg-color, rgba(0, 0, 0, 0.06));
          color: rgb(var(--typ-color-red-3));
        }
      }
    }
  }
</style>
