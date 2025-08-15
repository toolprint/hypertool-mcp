/**
 * List Available Tools - Discover all tools available from connected MCP servers
 */

import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { ToolModuleFactory, ToolModule } from "../../types.js";

export const listAvailableToolsDefinition: Tool = {
  name: "list-available-tools",
  description:
    "Discover all tools available from connected MCP servers. Returns structured data showing tools grouped by server for toolset creation. Tools can be referenced by 'namespacedName' (e.g., 'git.status') or 'refId' (unique hash). Example: Call with no parameters to see all tools organized by server with detailed metadata for each tool.",
  inputSchema: {
    type: "object" as const,
    properties: {},
    additionalProperties: false,
  },
  outputSchema: {
    type: "object" as const,
    properties: {
      summary: {
        type: "object",
        description: "High-level statistics about available tools",
        properties: {
          totalTools: {
            type: "number",
            description: "Total number of tools across all servers",
          },
          totalServers: {
            type: "number",
            description: "Number of connected MCP servers",
          },
        },
        required: ["totalTools", "totalServers"],
      },
      toolsByServer: {
        type: "array",
        description: "Tools organized by their source server",
        items: {
          type: "object",
          properties: {
            serverName: {
              type: "string",
              description: "Name of the MCP server",
            },
            toolCount: {
              type: "number",
              description: "Number of tools from this server",
            },
            tools: {
              type: "array",
              description: "List of tools from this server",
              items: {
                type: "object",
                properties: {
                  name: {
                    type: "string",
                    description: "Original tool name",
                  },
                  description: {
                    type: "string",
                    description: "Tool description (optional)",
                  },
                  namespacedName: {
                    type: "string",
                    description:
                      "Namespaced name for unambiguous reference (serverName.toolName)",
                  },
                  serverName: {
                    type: "string",
                    description: "Source server name",
                  },
                  refId: {
                    type: "string",
                    description: "Unique hash identifier for this tool",
                  },
                },
                required: ["name", "namespacedName", "serverName", "refId"],
              },
            },
          },
          required: ["serverName", "toolCount", "tools"],
        },
      },
    },
    required: ["summary", "toolsByServer"],
  },
  annotations: {
    title: "List Available Tools",
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
};

export const createListAvailableToolsModule: ToolModuleFactory = (
  deps
): ToolModule => {
  return {
    toolName: "list-available-tools",
    definition: listAvailableToolsDefinition,
    handler: async (
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      args: any
    ) => {
      if (deps.discoveryEngine) {
        const structured = deps.toolsetManager.formatAvailableTools();

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(structured),
            },
          ],
          structuredContent: structured,
        };
      } else {
        return {
          content: [
            {
              type: "text",
              text: "❌ **Tool discovery not available**\n\nDiscovery engine is not initialized. Server may not be fully started.",
            },
          ],
          isError: true,
        };
      }
    },
  };
};
