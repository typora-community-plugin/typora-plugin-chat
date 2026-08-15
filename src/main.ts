import { Plugin } from '@typora-community-plugin/core'
import './ui/styles.scss'
import { ChatView } from './chat-view'
import { chatStore } from './store/chat-store'
import { getSelection } from './adapter/editor'
import { getCurrentFilePath } from './adapter/vault'
import { copyTranscript } from './utils/export'
import { basename } from './utils/helpers'


export default class extends Plugin {

  onload() {
    const { app } = this

    this.register(
      app.viewManager.registerView(ChatView.type, (leaf) => new ChatView(leaf))
    )

    this.register(
      app.commands.register({
        id: 'typora-community-plugin.chat',
        title: 'Chat with AI',
        scope: 'global',
        callback: () => {
          app.commands.run('core.workspace:split-right', [`typ://${ChatView.type}/Chat`])
        }
      })
    )

    this.register(
      app.commands.register({
        id: 'typora-community-plugin.chat.chat-about-note',
        title: 'Chat about this note',
        scope: 'global',
        callback: () => this.chatAboutActiveNote()
      })
    )

    this.register(
      app.commands.register({
        id: 'typora-community-plugin.chat.send-selection',
        title: 'Send selection to Chat',
        scope: 'global',
        callback: () => this.sendSelectionToChat()
      })
    )

    this.register(
      app.commands.register({
        id: 'typora-community-plugin.chat.copy-transcript',
        title: 'Copy chat transcript',
        scope: 'global',
        callback: () => { void copyTranscript() }
      })
    )

    this.register(
      app.commands.register({
        id: 'typora-community-plugin.chat.clear-chat',
        title: 'Clear conversation',
        scope: 'global',
        callback: () => {
          chatStore.clearMessages()
          this.getChatView()?.clearConversation()
        }
      })
    )

    // File explorer context menu: right-click a note → chat about it.
    this.register(
      app.workspace.on('file-menu', ({ menu, path }) => {
        if (!/\.md$/i.test(path)) return
        menu.addItem(item => item
          .setTitle('Chat about this note')
          .onClick(() => this.chatAboutNote(path)))
      })
    )
  }

  private getChatView(): ChatView | undefined {
    return this.app.workspace.getViewByType(ChatView)
  }

  private async chatAboutNote(filePath: string) {
    const view = this.getChatView() ?? this.openChatView()
    if (!view) return
    await view.handleSend(`Summarize this note: ${basename(filePath)}`)
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
    this.app.commands.run('core.workspace:split-right', [`typ://${ChatView.type}/Chat`])
    return this.getChatView()
  }
}
