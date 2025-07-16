/**
 * List Saved Toolsets - List all saved toolset configurations
 */

import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { ToolModuleFactory, ToolModule } from "./types.js";
import { toolsetInfoSchema } from "./schemas.js";

export const listSavedToolsetsDefinition: Tool = {
  name: "list-saved-toolsets",
  description:
    "List all saved toolset configurations with detailed information including server configurations and tool counts",
  inputSchema: {
    type: "object" as const,
    properties: {},
    additionalProperties: false,
  },
  outputSchema: {
    type: "object" as const,
    properties: {
      success: {
        type: "boolean",
        description: "Whether the operation was successful",
      },
      toolsets: {
        type: "array",
        description: "Array of toolset information",
        items: toolsetInfoSchema as any,
      },
      error: {
        type: "string",
        description: "Error message if the operation failed",
      },
    },
    required: ["success", "toolsets"],
  },
};

export const createListSavedToolsetsModule: ToolModuleFactory = (
  deps
): ToolModule => {
  return {
    toolName: "list-saved-toolsets",
    definition: listSavedToolsetsDefinition,
    handler: async (_args: any) => {
      const listResult = await deps.toolsetManager.listSavedToolsets();
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(listResult),
          },
        ],
        structuredContent: listResult,
      };
    },
  };
};
