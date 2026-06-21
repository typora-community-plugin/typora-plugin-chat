import { app, WorkspaceView } from "@typora-community-plugin/core"
import { getAIResponse } from "./ai-proxy"


export class ChatView extends WorkspaceView {

  containerEl = $(`<div class="typ-chatview">
<div class="header">
    <div class="title">AI Copilot</div>
</div>

<div class="chat-container" id="chatContainer">
    <div class="typing-indicator" id="typingIndicator">
        <span class="typing-dot"></span>
        <span class="typing-dot"></span>
        <span class="typing-dot"></span>
    </div>
</div>

<div class="input-container">
    <textarea class="input-box" id="messageInput" placeholder="输入消息..." rows="1"></textarea>
    <select class="model-selector" id="modelSelector">
        <option value="qwen3.6-35b-a3b">Qwen 3.6 35B A3B</option>
    </select>
    <button class="send-button" id="sendButton">发送</button>
</div>
</div>`)[0]

  static type = 'typora-plugin.chat'

  onOpen() {
    setTimeout(() => {
      const chatContainer = document.getElementById('chatContainer')!
      const messageInput = document.getElementById('messageInput')! as HTMLInputElement
      const sendButton = document.getElementById('sendButton')!
      const modelSelector = document.getElementById('modelSelector')! as HTMLSelectElement
      const typingIndicator = document.getElementById('typingIndicator')!

      // 自动调整输入框高度
      messageInput.addEventListener('input', function () {
        this.style.height = 'auto'
        this.style.height = (this.scrollHeight) + 'px'
      })

      // 发送消息
      function sendMessage() {
        const message = messageInput.value.trim()
        if (message === '') return

        // 添加用户消息
        addMessage('user', message)
        messageInput.value = ''
        messageInput.style.height = 'auto'

        // 显示AI正在输入
        typingIndicator.style.display = 'block'
        chatContainer.scrollTop = chatContainer.scrollHeight

        // 模拟AI回复
        setTimeout(() => {
          const el = addMessage('ai')
          let md = ''
          el.style.display = 'none'
          const options = {
            model: modelSelector.value,
            callback: (chunck: string) => {
              typingIndicator.style.display = 'none'
              el.style.display = 'block'
              md += chunck
              app.features.markdownRenderer.renderTo(md, el)
            },
          }
          getAIResponse(message, options)
        }, 1500)
      }

      // 添加消息到聊天界面
      function addMessage(sender: string, content = '') {
        const messageDiv = document.createElement('div')
        messageDiv.className = `message ${sender}-message`

        const contentDiv = document.createElement('div')
        contentDiv.className = 'message-content'
        if (content) contentDiv.textContent = content

        messageDiv.appendChild(contentDiv)
        chatContainer.insertBefore(messageDiv, typingIndicator)

        // 滚动到底部
        chatContainer.scrollTop = chatContainer.scrollHeight
        return contentDiv
      }

      // 点击发送按钮
      sendButton.addEventListener('click', sendMessage)

      // 按Enter键发送消息 (Shift+Enter换行)
      messageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault()
          sendMessage()
        }
      })

      // 初始欢迎消息
      addMessage('ai', '您好！我是AI助手，请问有什么可以帮您的吗？')
    })
  }
}
