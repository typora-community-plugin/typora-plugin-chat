<script>
  let {
    onClear,
    onToggleSettings,
  } = $props()
</script>

<div class="typ-chat-header">
  <span class="typ-chat-header__title">Chat</span>
  <div class="typ-chat-header__actions">
    <button class="typ-chat-btn" onclick={onToggleSettings} title="Settings">Settings</button>
    <button class="typ-chat-btn typ-chat-btn--danger" onclick={onClear} title="Clear conversation">Clear</button>
  </div>
</div>
