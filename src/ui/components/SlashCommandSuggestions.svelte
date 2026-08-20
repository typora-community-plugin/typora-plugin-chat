<script lang="ts">
  import type { Suggestion } from '@/slash-commands'

  let { suggestions, highlightedIndex, onPick }: {
    /** Slash command entries to render (`/new`, `/sessions`, `/skill`, `/skill:<name>`). */
    suggestions: Suggestion[]
    /** Index of the currently highlighted entry. */
    highlightedIndex: number
    /** Called with an entry when it is clicked (mousedown). */
    onPick: (suggestion: Suggestion) => void
  } = $props()
</script>

<ul class="typ-skill-suggestions" role="listbox">
  {#each suggestions as s, i (s.text)}
    <li
      role="option"
      aria-selected={i === highlightedIndex}
      class:typ-suggestion-highlighted={i === highlightedIndex}
      onmousedown={(e) => { e.preventDefault(); onPick(s); }}
    >
      <span class="typ-suggestion-text">{s.text}</span>
      {#if s.description}
        <span class="typ-suggestion-desc" aria-hidden="true">{s.description}</span>
      {/if}
    </li>
  {/each}
</ul>

<style lang="scss">
  :global {
    .typ-skill-suggestions {
      position: absolute;
      bottom: calc(100% + 4px);
      left: 0;
      right: 0;
      margin: 0;
      padding: 4px;
      list-style: none;
      max-height: 208px;
      overflow-y: auto;
      border: 1px solid rgb(var(--typ-border-color));
      border-radius: var(--typ-radius-m);
      background-color: var(--bg-color, #fff);
      box-shadow: 0 -4px 12px rgba(0, 0, 0, 0.12);
      z-index: 20;

      li {
        padding: 5px 10px;
        border-radius: 4px;
        cursor: pointer;

        .typ-suggestion-text {
          display: block;
          font-size: 13px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .typ-suggestion-desc {
          display: block;
          font-size: 11px;
          color: rgb(var(--typ-text-color-gray));
          opacity: 0.7;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        &:hover,
        &.typ-suggestion-highlighted {
          background-color: rgb(var(--typ-color-gray-1));
        }
      }
    }
  }
</style>
