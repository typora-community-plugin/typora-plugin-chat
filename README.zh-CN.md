# Typora Plugin Chat

[English](./README.md) | 中文

这是一个基于 [typora-community-plugin][core] 的 Typora AI 聊天助手插件。

嵌入在 Typora 中的 AI 聊天助手，可以访问你的笔记库：读取、编辑、创建和删除文件；抓取网页内容；运行子 Agent 执行委派任务；使用可复用的技能（Skills）。

> **WARNING**
> 
> LLM 自动操作可能意外改变或删除你的文件，请提前做好版本备份（如使用 git）。

## Preview

![](./docs/assets/base.gif)

## 功能特性

### 聊天与对话
- **AI 聊天面板** — Typora 右侧边栏中的完整对话界面，支持自动调整大小的输入框、模型/模式选择器、斜杠命令自动补全
- **多会话管理** — 创建、切换和删除独立的聊天会话；聊天记录在重启后持久保存；会话按笔记库隔离
- **"关于当前笔记提问"** — 将当前笔记内容发送给 AI 进行总结或讨论（也可通过文件资源管理器右键菜单使用）
- **"发送选中内容到 Chat"** — 将选中的文本发送到聊天中，并限制 AI "仅在此范围内操作"

### Agent 能力
- **3 种访问模式**：工作区写（完全访问）、只读、仅聊天（无文件工具）
- **17+ 工具**，覆盖 4 个类别：编辑器、笔记库、系统、网络
- **子 Agent 系统** — 委派独立任务给嵌套的 Agent 循环，继承权限并支持按轮次撤销/重做
- **技能（Skills）系统** — 自动发现并调用来自笔记库或全局目录的可复用 SKILL.md 指令集

### 智能特性
- **斜杠命令**：`/new`、`/sessions`、`/skill:<名称>`、`/undo`、`/redo`，支持键盘导航的自动补全
- **撤销/重做** — *当前会话中*按轮次原子化撤销：一次 Agent 轮次中的所有文件修改会被一起回滚
- **上下文窗口占用圆环** — 实时可视化显示 token 使用量与上下文窗口大小的比例（估算值或 API 上报值）

### 工具增强
- **分页支持** — `list_files`、`web_fetch` 等工具支持 limit/offset 分页，避免单次返回过多内容
- **禁止路径策略** — 配置 Glob 模式阻止 Agent 访问敏感目录和文件（`.git`、`node_modules`、`*.apikey` 始终禁止）
- **list_files 返回目录** — 非递归模式下 `list_files` 同时返回文件和目录列表

### AI 提供商支持
- **Anthropic** — `/v1/messages` 端点，支持工具调用、思考块和 token 统计
- **OpenAI** — Responses API（默认）或 Chat Completions 备用模式
- **Ollama / OpenAI 兼容** — 标准 `/v1/chat/completions` 格式

## 设置项

| 设置项 | 说明 |
|--------|------|
| **提供商配置** | Anthropic、OpenAI、Ollama/OpenAI 兼容；支持添加/移除自定义提供商，每个提供商独立配置 API Key、Base URL、模型和上下文窗口 |
| **禁止路径** | Glob 模式（每行一条），阻止 Agent 访问指定笔记库路径（`.git`、`node_modules`、`*.apikey` 始终禁止） |
| **最大工具迭代次数** | 单次 Agent 循环中工具调用的最大轮数（默认 20，范围 1-100） |
| **技能（Skills）** | 从指定目录自动加载 SKILL.md；在聊天中使用 `/skill:<名称>` 显式调用，或让模型自动匹配 |

## 安装方法

1. 安装 [typora-community-plugin][core]
2. 打开"设置 -> 社区插件"搜索 "Chat" 然后安装。

[core]: https://github.com/typora-community-plugin/typora-community-plugin
