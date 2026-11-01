import { Plugin } from '@typora-community-plugin/core'
import type { WorkspaceParent } from '@typora-community-plugin/core'
import './ui/variables.scss'
import { ChatView } from './chat-view'
import { ChatSettingTab } from './ui/settings/chat-setting-tab'
import { chatStore } from './store/chat-store'
import { getActiveSession, initSessionStore, reloadSessionStore, saveActiveSession, setSessionTitle, setVaultScope } from './store/session-store'
import { captureAnchor, getSelection, isEditingNote } from './adapter/editor'
import { eventHotkey, needsKeydownFallback, normalizeHotkey } from './inline/hotkey'
import { InlineAssistant } from './inline/inline-assistant'
import { getCurrentFilePath } from './adapter/vault'
import { copyTranscript } from './utils/export'
import { basename } from './utils/helpers'
import { format, initI18n, t } from './i18n'
import { rescanSkills } from './agent/skills/store'


export default class extends Plugin {

  onload() {
    const { app } = this

    initI18n(this.manifest.dir!)
    chatStore.inputPlaceholder.set(t.chat.inputPlaceholder)
    setSessionTitle(t.chat.title)
    setVaultScope(app.vault.path)
    initSessionStore()

    // Skills: initial scan for /skill: autocomplete, plus a rescan whenever the
    // user switches vaults so project-level .agents/skills stay current. The
    // agent loop re-discovers on disk per turn regardless of this cache.
    void rescanSkills()
    this.register(app.vault.on('change', (path) => {
      setVaultScope(path)
      reloadSessionStore()
      void rescanSkills()
    }))

    this.registerSettingTab(new ChatSettingTab(this.app, this))

    this.register(
      app.viewManager.registerView(ChatView.type, (leaf) => new ChatView(leaf))
    )

    this.registerCommand({
      id: 'typora-community-plugin.chat',
      title: t.command.chatWithAI,
      scope: 'global',
      callback: () => {
        this.openChatView()
      }
    })

    this.registerCommand({
      id: 'typora-community-plugin.chat.chat-about-note',
      title: t.command.chatAboutNote,
      scope: 'global',
      callback: () => this.chatAboutActiveNote()
    })

    this.registerCommand({
      id: 'typora-community-plugin.chat.send-selection',
      title: t.command.sendSelectionToChat,
      scope: 'global',
      callback: () => this.sendSelectionToChat()
    })

    this.registerCommand({
      id: 'typora-community-plugin.chat.copy-transcript',
      title: t.command.copyTranscript,
      scope: 'global',
      callback: () => { void copyTranscript() }
    })

    this.registerCommand({
      id: 'typora-community-plugin.chat.clear-chat',
      title: t.command.clearConversation,
      scope: 'global',
      callback: () => {
        chatStore.clearMessages()
        this.getChatView()?.clearConversation()
        const current = getActiveSession()
        if (current) saveActiveSession([], [])
      }
    })

    // Inline assistant: ask AI at the caret (tables, Mermaid diagrams,
    // rewrites…) without leaving the editor.
    const inline = new InlineAssistant()
    this.register(() => inline.close())
    const isMac = /mac/i.test(navigator.platform || navigator.userAgent)
    const inlineCommand = {
      id: 'typora-community-plugin.chat.inline',
      title: t.command.askAIHere,
      // Editor scope: core binds it on the writing area, so typing in the
      // chat sidebar or Settings never triggers it.
      scope: 'editor' as const,
      hotkey: isMac ? 'Cmd+J' : 'Ctrl+J',
      callback: () => {
        if (inline.isOpen) return inline.close()
        const anchor = captureAnchor()
        if (anchor) inline.open(anchor)
      },
    }
    this.registerCommand(inlineCommand)
    // macOS: core matches hotkeys on `keyup`, which WebKit never dispatches
    // for a key released while ⌘ is held (verified on device: only `keydown`
    // arrives), so ⌘ hotkeys registered through core don't fire. Match those
    // on `keydown` instead — inside the writing area only, and using the
    // command's *current* hotkey so a binding changed in Settings → Hotkey
    // still applies (non-⌘ bindings are left to core). Capture phase is
    // needed because Typora stops ⌘-shortcut keydowns from bubbling; the
    // event is not stopped, only its default action is prevented.
    if (isMac) {
      const onKeydown = (event: KeyboardEvent) => {
        if (event.isComposing) return
        const current = app.commands.commandMap[inlineCommand.id]?.hotkey ?? null
        if (!needsKeydownFallback(current, true)) return
        if (eventHotkey(event) !== normalizeHotkey(current!)) return
        if (!isEditingNote()) return
        event.preventDefault()
        inlineCommand.callback()
      }
      document.addEventListener('keydown', onKeydown, true)
      this.register(() => document.removeEventListener('keydown', onKeydown, true))
    }
    this.register(
      app.workspace.on('editor-menu', ({ menu }) => {
        // Capture now: by the time the item is clicked focus may have moved.
        const anchor = captureAnchor()
        const build = (item: Parameters<Parameters<typeof menu.addItem>[0]>[0]) => item
          .setKey('typ-chat-inline')
          .setTitle(t.command.askAIHere)
          .onClick(() => (anchor ? inline.open(anchor) : undefined))
        // Next to Typora's own "Insert" submenu, like the file-menu entry.
        if (document.querySelector('#context-menu [data-key="insert"]')) menu.insertItemAfter('[data-key="insert"]', build)
        else menu.addItem(build)
      })
    )

    // File explorer context menu: right-click a note → chat about it.
    this.register(
      app.workspace.on('file-menu', ({ menu, path }) => {
        if (!/\.md$/i.test(path)) return
        menu.insertItemAfter('[data-action="search"]', item => item
          .setKey('typ-chat-about-note')
          .setTitle(t.command.chatAboutNote)
          .onClick(() => this.chatAboutNote(path)))
      })
    )

    setTimeout(() => this.setupChatView())
  }

  onunload() {
    const leaf = this.app.workspace.rightSplit.findLeaf(
      (leaf) => leaf.viewType === ChatView.type
    )
    if (leaf) leaf.detach()
  }

  private setupChatView() {
    this.app.commands.run('core.workspace.right-split:ensure-leaf', [`typ://${ChatView.type}/Chat`])
  }

  private getChatView(): ChatView | undefined {
    const leaf = this.app.workspace.rightSplit.findLeaf(
      (leaf) => leaf.viewType === ChatView.type
    )
    return leaf?.view instanceof ChatView ? leaf.view : undefined
  }

  private async chatAboutNote(filePath: string) {
    const view = this.getChatView() ?? this.openChatView()
    if (!view) return
    await view.handleSend(format(t.chat.summarizeNote, { file: basename(filePath) }))
  }

  private async chatAboutActiveNote() {
    const activeFile = getCurrentFilePath()
    if (!activeFile) return
    await this.chatAboutNote(activeFile)
  }

  private async sendSelectionToChat() {
    const selection = getSelection()
    if (!selection) return
    chatStore.setSelection(selection)
    this.openChatView()
  }

  private openChatView(): ChatView | undefined {
    const { workspace } = this.app

    const existing = this.getChatView()
    if (!existing) {
      this.setupChatView()
    }

    workspace.rightSplit.expand()

    return existing ?? this.getChatView()
  }
}
