import type { ToolDefinition, ToolResult, ToolSummary } from '../../config/types'


export const getCurrentDatetimeSchema: ToolDefinition = {
  name: 'get_current_datetime',
  description: "Get the current date and time in the user's local timezone.",
  parameters: {
    type: 'object',
    properties: {},
    required: [],
  },
}

export const summarizeGetCurrentDatetime: ToolSummary = () => '(no parameters)'

export async function executeGetCurrentDatetime(): Promise<ToolResult> {
  const now = new Date()
  return { content: now.toString() }
}
