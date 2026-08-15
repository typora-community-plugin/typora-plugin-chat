import type { ToolDefinition } from '../config/types'
import { fileIoSchemas } from './file-io-schema'
import { editSchemas } from './edit-schema'
import { searchSchemas } from './search-schema'
import { fileOpsSchemas } from './file-ops-schema'
import { fmSchemas } from './fm-schema'
import { supplyToolSchemas } from './supply-tools-schema'
import { interactionSchemas } from './interaction-schema'


/**
 * The 14 vault tools exposed to the AI providers.
 * Schemas are split by responsibility so each file stays well under 300 lines.
 */
export const toolDefinitions: ToolDefinition[] = [
  ...fileIoSchemas,
  ...editSchemas,
  ...searchSchemas,
  ...fileOpsSchemas,
  ...fmSchemas,
  ...supplyToolSchemas,
  ...interactionSchemas,
]

export const toolNames = toolDefinitions.map(tool => tool.name)

export function getToolDefinition(name: string): ToolDefinition | undefined {
  return toolDefinitions.find(tool => tool.name === name)
}
