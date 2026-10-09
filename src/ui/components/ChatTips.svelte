<script lang="ts">
  import { t } from '@/i18n'

  const tips = [
    t.chat.tipReadOnly,
    t.chat.tipChatOnly,
    t.chat.tipWorkspaceWrite,
    t.chat.tipModeSelector,
    t.chat.tipNew,
    t.chat.tipSessions,
    t.chat.tipSkill,
    t.chat.tipUndo,
    t.chat.tipRedo,
    t.chat.tipSelection,
  ]

  let tipIndex = Math.floor(Math.random() * tips.length)
</script>

<p class="typ-chat-tip"><b>{t.chat.tipPrefix}</b>{tips[tipIndex]}</p>

<style lang="scss">
  :global {
    .typ-chat-tip {
      margin: 0;
      max-width: 32em;
      font-size: 12px;
      line-height: 1.5;
      color: rgb(var(--typ-color-gray-3));
      text-align: center;
      user-select: none;
    }
  }
</style>
