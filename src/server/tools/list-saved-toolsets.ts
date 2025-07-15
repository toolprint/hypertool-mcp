/**
 * List Saved Toolsets - List all saved toolset configurations
 */

import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { ToolModuleFactory, ToolModule } from "./types.js";

export const listSavedToolsetsDefinition: Tool = {
  name: "list-saved-toolsets",
  description: "List all saved toolset configurations",
  inputSchema: {
    type: "object" as const,
    properties: {},
    additionalProperties: false,
  },
};

export const createListSavedToolsetsModule: ToolModuleFactory = (deps): ToolModule => {
  return {
    toolName: "list-saved-toolsets",
    definition: listSavedToolsetsDefinition,
    handler: async (_args: any) => {
      const listResult = await deps.toolsetManager.listSavedToolsets();
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(listResult)
          }
        ],
        structuredContent: listResult
      };
    }
  };
};