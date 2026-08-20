import type { ToolDefinition } from '@/config/types'
import { allToolSchemas } from './executor'


/**
 * All tool definitions exposed to the AI providers.
 * Schemas are defined alongside their executors in src/agent/tools/{editor,vault,system}/*.ts (kebab-case).
 */
export const toolDefinitions: ToolDefinition[] = [...allToolSchemas]

export const toolNames = toolDefinitions.map(tool => tool.name)

export function getToolDefinition(name: string): ToolDefinition | undefined {
  return toolDefinitions.find(tool => tool.name === name)
}
