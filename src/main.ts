import { ChatView } from './chat-view'
import './style.scss'
import { Plugin } from '@typora-community-plugin/core'


export default class extends Plugin {

  onload() {
    const { app } = this

    this.register(
      app.viewManager.registerView(ChatView.type, (leaf) => new ChatView(leaf))
    )

    this.register(
      this.app.commands.register({
        id: 'typora-community-plugin.chat',
        title: 'Chat with AI',
        scope: 'global',
        callback: () => {
          app.commands.run('core.workspace:split-right', [`typ://${ChatView.type}/Chat`])
        }
      })
    )
  }

  onunload() {
  }
}
