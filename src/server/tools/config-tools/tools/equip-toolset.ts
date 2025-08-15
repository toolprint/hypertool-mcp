/**
 * Equip Toolset - Equip a saved toolset configuration to filter available tools
 */

import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { ToolModuleFactory, ToolModule } from "../../types.js";

export const equipToolsetDefinition: Tool = {
  name: "equip-toolset",
  description: "Equip a saved toolset configuration to filter available tools",
  inputSchema: {
    type: "object" as const,
    properties: {
      name: {
        type: "string",
        description: "Name of the toolset to equip",
      },
    },
    required: ["name"],
    additionalProperties: false,
  },
};

export const createEquipToolsetModule: ToolModuleFactory = (
  deps,
  onModeChangeRequest?: () => void
): ToolModule => {
  return {
    toolName: "equip-toolset",
    definition: equipToolsetDefinition,
    handler: async (args: any) => {
      if (deps.discoveryEngine) {
        // Refresh discovery cache before applying toolset to ensure latest tools
        await deps.discoveryEngine.refreshCache();

        const equipResult = await deps.toolsetManager.equipToolset(args?.name);
        if (equipResult.success) {
          // Auto-exit to normal mode on successful equip
          if (onModeChangeRequest) {
            onModeChangeRequest();
          }
          
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  success: true,
                  message: `✅ Toolset "${args?.name}" equipped successfully. The server's tool list has been updated.`,
                }),
              },
            ],
            structuredContent: {
              success: true,
              toolsetName: args?.name,
              message: "Toolset equipped successfully",
            },
          };
        } else {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  success: false,
                  error: equipResult.error,
                }),
              },
            ],
            structuredContent: {
              success: false,
              error: equipResult.error,
            },
          };
        }
      } else {
        return {
          content: [
            {
              type: "text",
              text: "❌ **Tool discovery not available**\n\nDiscovery engine is not initialized. Server may not be fully started.",
            },
          ],
        };
      }
    },
  };
};
