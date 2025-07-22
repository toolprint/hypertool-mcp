/**
 * Unequip Toolset - Unequip the currently equipped toolset and show all available tools
 */

import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { ToolModuleFactory, ToolModule } from "./types.js";

export const unequipToolsetDefinition: Tool = {
  name: "unequip-toolset",
  description:
    "Unequip the currently equipped toolset and show all available tools",
  inputSchema: {
    type: "object" as const,
    properties: {},
    additionalProperties: false,
  },
};

export const createUnequipToolsetModule: ToolModuleFactory = (
  deps
): ToolModule => {
  return {
    toolName: "unequip-toolset",
    definition: unequipToolsetDefinition,
    handler: async (
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      args: any
    ) => {
      await deps.toolsetManager.unequipToolset();
      // ToolsetManager will emit 'toolsetChanged' event which triggers notifyToolsChanged()

      return {
        content: [
          {
            type: "text",
            text: "✅ **Toolset Unequipped**\n\nAll discovered tools are now available. The server's tool list has been reset to show all tools from connected servers.",
          },
        ],
      };
    },
  };
};
