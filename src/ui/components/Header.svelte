<script>
  let {
    model,
    onClear,
    onToggleSettings,
  } = $props()
</script>

<div class="typ-chat-header">
  <span class="typ-chat-header__title">Chat</span>
  <span class="typ-chat-header__model">Model: {model}</span>
  <div class="typ-chat-header__actions">
    <button class="typ-chat-btn" onclick={onToggleSettings} title="Settings">Settings</button>
    <button class="typ-chat-btn typ-chat-btn--danger" onclick={onClear} title="Clear conversation">Clear</button>
  </div>
</div>
