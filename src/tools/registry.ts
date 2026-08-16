import type { ToolDefinition } from '../config/types'
import { allToolSchemas } from './executor'


/**
 * The 14 vault tools exposed to the AI providers.
 * Schemas are now defined alongside their executors in src/tools/implements/*.ts (kebab-case)
 */
export const toolDefinitions: ToolDefinition[] = [...allToolSchemas]

export const toolNames = toolDefinitions.map(tool => tool.name)

export function getToolDefinition(name: string): ToolDefinition | undefined {
  return toolDefinitions.find(tool => tool.name === name)
}
