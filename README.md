# Typora Plugin Chat

English | [中文](./README.zh-CN.md)

An AI-powered chat assistant embedded in Typora that can access your vault: read, edit, create and delete files; fetch web content; run sub-agents for delegated tasks; and use reusable skills.

> **WARNING**
>
> LLM automated operations may accidentally modify or delete your files. Please back up your versions in advance (e.g., using git).

## Preview

![](./docs/assets/base.gif)

## Features

### Chat & Conversation
- **AI Chat Panel** — Full conversational UI in Typora's right sidebar with auto-resizing input, model/mode pickers, and slash command autocomplete
- **Multi-session Management** — Create, switch between, and delete independent chat sessions; transcripts persist across restarts
- **"Chat About This Note"** — Send the current note's content to the AI for summarization or discussion (also available via right-click in file explorer)
- **"Send Selection to Chat"** — Send selected text into the chat with a scope constraint ("work only within this selection")

### Agent Capabilities
- **3 Access Modes**: Workspace Write (full access), Read Only, Chat Only (no file tools)
- **17+ Tools** across 4 categories: Editor, Vault, System, and Network
- **Sub-Agent System** — Delegate independent tasks to nested agent loops with inherited permissions and turn-scoped undo/redo
- **Skills System** — Auto-discover and invoke reusable SKILL.md instruction sets from your vault or global directories

### Smart Features
- **Slash Commands**: `/new`, `/sessions`, `/skill:<name>`, `/undo`, `/redo` with keyboard-navigable autocomplete
- **Undo/Redo** — Turn-scoped atomic undo *within the current session*: all file changes from one agent turn are rolled back together
- **Context Window Usage Ring** — Real-time visual indicator of token usage vs. context window size (estimated or API-reported)

### AI Providers
- **Anthropic** — `/v1/messages` endpoint with tool use, thinking blocks, and token reporting
- **OpenAI** — Responses API (default) or Chat Completions fallback
- **Ollama / OpenAI-Compatible** — Standard `/v1/chat/completions` format

## Settings

| Setting | Description |
|---------|-------------|
| **Provider** | Anthropic, OpenAI, Ollama/OpenAI-compatible, or Custom |
| **Base URL** | API endpoint (e.g., `https://api.openai.com/v1`) |
| **API Key** | Stored obfuscated in vault config / localStorage |
| **Model** | Model ID with refresh button to fetch from provider's `/models` endpoint |
| **Context Window** | Token limit for context window estimation (auto-detected if empty) |
| **Per-model Context Windows** | Override per model: `model-id: 128000` per line |
| **Max Tool Iterations** | Max tool-call rounds in one agent loop (default 20, range 1-100) |

## Install

1. Install [typora-community-plugin][core]
2. Open "Settings -> Community Plugins" search "Chat" then install it.

[core]: https://github.com/typora-community-plugin/typora-community-plugin
