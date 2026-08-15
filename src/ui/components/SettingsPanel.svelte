<script>
  let {
    app,
    settings,
    onSave,
    onClose,
  } = $props()

  let draft = $state({ ...settings })
  let models = $state([])
  let modelsLoading = $state(false)
  let modelsError = $state('')

  const FALLBACK_MODELS = {
    anthropic: ['claude-sonnet-4-6', 'claude-opus-4-1', 'claude-haiku-4-5'],
    openai: ['gpt-5.3-codex', 'gpt-5.2', 'gpt-4.1-mini'],
    ollama: ['qwen3.6-35b-a3b', 'llama3.1', 'deepseek-r1'],
    custom: ['deepseek-chat', 'deepseek-reasoner'],
  }

  async function fetchModels() {
    modelsLoading = true
    modelsError = ''
    try {
      const provider = draft.provider
      const baseUrl = (draft.baseUrl || '').replace(/\/+$/, '')
      const endpoint = `${baseUrl}/models`
      const headers = {}
      if (provider === 'anthropic') {
        headers['x-api-key'] = draft.apiKey
        headers['anthropic-version'] = '2023-06-01'
      } else if (draft.apiKey) {
        headers['Authorization'] = `Bearer ${draft.apiKey}`
      }
      const response = await fetch(endpoint, { headers })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const data = await response.json()
      const rawList = Array.isArray(data) ? data : (data.data ?? [])
      const filtered = rawList
        .map(m => (typeof m === 'string' ? m : m.id ?? m.name))
        .filter(Boolean)
        .filter(id => {
          if (provider !== 'openai') return true
          return /(chat|gpt|o1|o3|codex)/i.test(id) && !/(realtime|audio|transcri|search|embedding|moderation)/i.test(id)
        })
      models = filtered.slice(0, 100)
    } catch (e) {
      modelsError = `Failed to fetch models: ${e.message || e}`
      models = FALLBACK_MODELS[draft.provider] ?? []
    } finally {
      modelsLoading = false
    }
  }

  function save() {
    onSave({ ...draft, maxIterations: Number(draft.maxIterations) || 20 })
    onClose()
  }
</script>

<div class="typ-chat-settings">
  <div class="typ-chat-settings__row">
    <label for="typ-provider">Provider</label>
    <select id="typ-provider" bind:value={draft.provider}>
      <option value="anthropic">Anthropic</option>
      <option value="openai">OpenAI</option>
      <option value="ollama">Ollama / OpenAI-compatible</option>
      <option value="custom">Custom</option>
    </select>
  </div>

  <div class="typ-chat-settings__row">
    <label for="typ-apikey">API Key</label>
    <input id="typ-apikey" type="password" placeholder="sk-..." bind:value={draft.apiKey} />
  </div>

  <div class="typ-chat-settings__row">
    <label for="typ-model">Model</label>
    <input id="typ-model" list="typ-model-list" placeholder="model id" bind:value={draft.model} />
    <datalist id="typ-model-list">
      {#each models as model}
        <option value={model}></option>
      {/each}
    </datalist>
  </div>

  <div class="typ-chat-settings__row">
    <label for="typ-baseurl">Base URL</label>
    <input id="typ-baseurl" placeholder="https://api.example.com/v1" bind:value={draft.baseUrl} />
  </div>

  {#if draft.provider === 'openai'}
    <div class="typ-chat-settings__row">
      <label for="typ-openaimode">OpenAI API mode</label>
      <select id="typ-openaimode" bind:value={draft.openaiApiMode}>
        <option value="responses">Responses API (primary)</option>
        <option value="chat">Chat Completions (fallback)</option>
      </select>
    </div>
  {/if}

  <div class="typ-chat-settings__row">
    <label for="typ-maxiter">Max tool iterations</label>
    <input id="typ-maxiter" type="number" min="1" max="100" bind:value={draft.maxIterations} />
  </div>

  {#if modelsError}
    <div class="typ-error-msg">{modelsError}</div>
  {/if}

  <div class="typ-chat-settings__actions">
    <button class="typ-chat-btn" onclick={fetchModels} disabled={modelsLoading}>
      {modelsLoading ? 'Loading...' : 'Refresh models'}
    </button>
    <button class="typ-chat-btn" onclick={onClose}>Cancel</button>
    <button class="typ-chat-btn typ-chat-btn--primary" onclick={save}>Save</button>
  </div>
</div>
