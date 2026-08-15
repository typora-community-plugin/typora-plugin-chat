<script>
  import { basename, truncateMiddle } from '../../utils/helpers'

  let { selection, onClear } = $props()

  const fileName = $derived(selection?.filePath ? basename(selection.filePath) : 'editor')
  const preview = $derived(truncateMiddle(selection?.text ?? '', 80))
</script>

<div class="typ-selection-pill">
  <div class="typ-selection-pill__content">
    <div class="typ-selection-pill__content__title">Selection from {fileName}</div>
    <div class="typ-selection-pill__content__preview">{preview}</div>
  </div>
  <button class="typ-selection-pill__clear" onclick={onClear} title="Clear selection">×</button>
</div>
