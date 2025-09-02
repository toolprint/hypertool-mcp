/**
 * Get Active Toolset - Get detailed information about the currently equipped toolset
 */

import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { ToolModuleFactory, ToolModule } from "../../types.js";
import {
  getActiveToolsetResponseSchema,
} from "../../schemas.js";

export const getActiveToolsetDefinition: Tool = {
  name: "get-active-toolset",
  description:
    "Get detailed information about the currently equipped toolset including availability status",
  inputSchema: {
    type: "object" as const,
    properties: {},
    additionalProperties: false,
  },
  outputSchema: getActiveToolsetResponseSchema as any,
};

export const createGetActiveToolsetModule: ToolModuleFactory = (
  deps
): ToolModule => {
  return {
    toolName: "get-active-toolset",
    definition: getActiveToolsetDefinition,
    handler: async (
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      args: any
    ) => {
      // Route to appropriate delegate based on persona activation state
      const activePersona = deps.personaManager?.getActivePersona();
      
      let result;
      if (activePersona && deps.personaManager) {
        // PersonaManager is active, use it as delegate
        result = await deps.personaManager.getActiveToolset();
      } else {
        // Use ToolsetManager as delegate
        result = await deps.toolsetManager.getActiveToolset();
      }
      
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify(result),
        }],
        structuredContent: result,
      };
    },
  };
};