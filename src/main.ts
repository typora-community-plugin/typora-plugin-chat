import { Plugin } from '@typora-community-plugin/core'
import type { WorkspaceParent } from '@typora-community-plugin/core'
import './ui/variables.scss'
import { ChatView } from './chat-view'
import { ChatSettingTab } from './ui/settings/chat-setting-tab'
import { chatStore } from './store/chat-store'
import { getActiveSession, initSessionStore, saveActiveSession } from './store/session-store'
import { getSelection } from './adapter/editor'
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
    initSessionStore()

    // Skills: initial scan for /skill: autocomplete, plus a rescan whenever the
    // user switches vaults so project-level .agents/skills stay current. The
    // agent loop re-discovers on disk per turn regardless of this cache.
    void rescanSkills()
    this.register(app.vault.on('change', () => { void rescanSkills() }))

    this.registerSettingTab(new ChatSettingTab(this.app, this))

    this.register(
      app.viewManager.registerView(ChatView.type, (leaf) => new ChatView(leaf))
    )

    this.register(
      app.commands.register({
        id: 'typora-community-plugin.chat',
        title: t.command.chatWithAI,
        scope: 'global',
        callback: () => {
          this.openChatView()
        }
      })
    )

    this.register(
      app.commands.register({
        id: 'typora-community-plugin.chat.chat-about-note',
        title: t.command.chatAboutNote,
        scope: 'global',
        callback: () => this.chatAboutActiveNote()
      })
    )

    this.register(
      app.commands.register({
        id: 'typora-community-plugin.chat.send-selection',
        title: t.command.sendSelectionToChat,
        scope: 'global',
        callback: () => this.sendSelectionToChat()
      })
    )

    this.register(
      app.commands.register({
        id: 'typora-community-plugin.chat.copy-transcript',
        title: t.command.copyTranscript,
        scope: 'global',
        callback: () => { void copyTranscript() }
      })
    )

    this.register(
      app.commands.register({
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

  private setupChatView() {
    const { workspace } = this.app

    const tabs = workspace.rightSplit.children.find((child) => child.type === 'tabs') as WorkspaceParent | undefined
    const leaf = workspace.createLeaf({
      type: ChatView.type,
      state: { path: `typ://${ChatView.type}/Chat` },
    })

    tabs?.appendChild(leaf)
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
