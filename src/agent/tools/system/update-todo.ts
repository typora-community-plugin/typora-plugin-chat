import type { ToolDefinition, ToolResult, ToolSummary } from '@/config/types'


export const TodoStatus = ['pending', 'in_progress', 'completed'] as const
export type TodoStatus = (typeof TodoStatus)[number]

export interface TodoItem {
  content: string
  status: TodoStatus
}

/** Parse a raw model input into validated todo items; returns an error message when invalid. */
function parseTodos(input: Record<string, unknown>): { todos?: TodoItem[]; error?: string } {
  const raw = input.todos
  if (!Array.isArray(raw) || raw.length === 0) {
    return { error: 'update_todo failed: "todos" must be a non-empty array' }
  }

  const todos: TodoItem[] = []
  for (let i = 0; i < raw.length; i++) {
    const item = (raw[i] ?? {}) as Record<string, unknown>
    const content = typeof item.content === 'string' ? item.content.trim() : ''
    if (!content) return { error: `update_todo failed: todos[${i}].content must be a non-empty string` }

    const statusRaw = typeof item.status === 'string' ? item.status.toLowerCase().trim() : ''
    const status = (TodoStatus as readonly string[]).includes(statusRaw)
      ? (statusRaw as TodoStatus)
      : undefined
    if (!status) {
      return { error: `update_todo failed: todos[${i}].status must be one of ${TodoStatus.join(', ')}` }
    }

    todos.push({ content, status })
  }

  return { todos }
}

export const updateTodoSchema: ToolDefinition = {
  name: 'update_todo',
  description:
    'Update the task list for the current work. Send the ENTIRE list on every call — it replaces the previous one (no partial updates). ' +
    'Use it to plan multi-step work and show progress; mark a task "in_progress" while working on it and "completed" as soon as it is done.',
  parameters: {
    type: 'object',
    properties: {
      todos: {
        type: 'array',
        description: 'The complete task list, replacing any previous one.',
        items: {
          type: 'object',
          properties: {
            content: { type: 'string', description: 'What the task is — a short imperative line.' },
            status: {
              type: 'string',
              enum: [...TodoStatus],
              description: 'pending (not started) | in_progress (being worked on now) | completed (finished).',
            },
          },
          required: ['content', 'status'],
        },
      },
    },
    required: ['todos'],
  },
}

export const summarizeUpdateTodo: ToolSummary = (input, result?) => {
  const todos = (input.todos as TodoItem[] | undefined) ?? []
  if (!todos.length) return '(no tasks)'
  const completed = todos.filter((t) => t.status === 'completed').length
  const inProgressTask = todos.filter((t) => t.status === 'in_progress')
  const inProgress = inProgressTask.length
  const pending = todos.length - completed - inProgress
  return `${completed}/${pending + inProgress} compeleted${inProgress ? ' · ' + inProgressTask[0].content : ''}`
}

export async function executeUpdateTodo(input: Record<string, unknown>): Promise<ToolResult> {
  const { todos, error } = parseTodos(input)
  if (error || !todos) return { content: error ?? 'update_todo failed', isError: true }

  const pending = todos.filter((t) => t.status === 'pending').length
  const inProgress = todos.filter((t) => t.status === 'in_progress').length
  const completed = todos.filter((t) => t.status === 'completed').length

  return {
    content: `Updated todo list: ${pending} pending, ${inProgress} in progress, ${completed} completed.`,
  }
}
