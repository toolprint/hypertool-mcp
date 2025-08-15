/**
 * Delete Toolset - Delete a saved toolset configuration
 */

import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { ToolModuleFactory, ToolModule } from "../../types.js";

export const deleteToolsetDefinition: Tool = {
  name: "delete-toolset",
  description: "Delete a saved toolset configuration",
  inputSchema: {
    type: "object" as const,
    properties: {
      name: {
        type: "string",
        description: "Name of the toolset to delete",
      },
      confirm: {
        type: "boolean",
        description: "Confirm deletion (required to actually delete)",
      },
    },
    required: ["name"],
    additionalProperties: false,
  },
};

export const createDeleteToolsetModule: ToolModuleFactory = (
  deps
): ToolModule => {
  return {
    toolName: "delete-toolset",
    definition: deleteToolsetDefinition,
    handler: async (args: any) => {
      const deleteResult = await deps.toolsetManager.deleteToolset(args?.name, {
        confirm: args?.confirm,
      });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(deleteResult),
          },
        ],
        structuredContent: deleteResult,
      };
    },
  };
};
