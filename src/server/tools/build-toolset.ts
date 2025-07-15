/**
 * Build Toolset - Build and save a custom toolset by selecting specific tools
 */

import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { ToolModuleFactory, ToolModule } from "./types.js";

export const buildToolsetDefinition: Tool = {
  name: "build-toolset",
  description: "Build and save a custom toolset by selecting specific tools. Like assembling tools from a workshop - pick the exact tools you need for a specific task or workflow. You must specify which tools to include. Each tool must specify either namespacedName or refId for identification. Example: {name: 'dev-essentials', tools: [{namespacedName: 'git.status'}, {namespacedName: 'docker.ps'}], autoEquip: true} creates and immediately equips a development toolset.",
  inputSchema: {
    type: "object" as const,
    properties: {
      name: {
        type: "string",
        description: "Name for the new toolset. Use lowercase with hyphens (e.g., 'dev-essentials', 'git-workflow', 'debug-kit')",
        pattern: "^[a-z0-9-]+$",
        minLength: 2,
        maxLength: 50
      },
      tools: {
        type: "array",
        description: "Array of tools to include in the toolset. Each tool must specify either namespacedName or refId for identification. Use list-available-tools to see available options.",
        minItems: 1,
        maxItems: 100,
        items: {
          type: "object",
          properties: {
            namespacedName: {
              type: "string",
              description: "Tool reference by namespaced name (e.g., 'git.status', 'docker.ps')"
            },
            refId: {
              type: "string",
              description: "Tool reference by unique hash identifier (e.g., 'abc123def456...')"
            }
          },
          oneOf: [
            { required: ["namespacedName"] },
            { required: ["refId"] }
          ],
          additionalProperties: false
        }
      },
      description: {
        type: "string",
        description: "Optional description of what this toolset is for (e.g., 'Essential tools for web development')",
        maxLength: 200
      },
      autoEquip: {
        type: "boolean",
        description: "Automatically equip this toolset after creation (default: false)"
      }
    },
    required: ["name", "tools"],
    additionalProperties: false,
  },
  outputSchema: {
    type: "object" as const,
    properties: {
      success: {
        type: "boolean",
        description: "Whether the toolset was successfully created"
      },
      toolsetName: {
        type: "string",
        description: "Name of the created toolset"
      },
      location: {
        type: "string",
        description: "File path where the toolset configuration is stored"
      },
      configuration: {
        type: "object",
        description: "Summary of the toolset configuration",
        properties: {
          totalServers: {
            type: "number",
            description: "Total number of servers included in the toolset"
          },
          enabledServers: {
            type: "number",
            description: "Number of enabled servers in the toolset"
          },
          totalTools: {
            type: "number",
            description: "Total number of tools included in the toolset"
          },
          servers: {
            type: "array",
            description: "Server configurations in the toolset",
            items: {
              type: "object",
              properties: {
                name: {
                  type: "string",
                  description: "Server name"
                },
                enabled: {
                  type: "boolean",
                  description: "Whether the server is enabled"
                },
                toolCount: {
                  type: "number",
                  description: "Number of tools from this server"
                }
              },
              required: ["name", "enabled", "toolCount"]
            }
          }
        },
        required: ["totalServers", "enabledServers", "totalTools", "servers"]
      },
      createdAt: {
        type: "string",
        description: "ISO timestamp when the toolset was created"
      },
      autoEquipped: {
        type: "boolean",
        description: "Whether the toolset was automatically equipped after creation"
      }
    },
    required: ["success", "toolsetName", "location", "configuration", "createdAt", "autoEquipped"]
  },
};

export const createBuildToolsetModule: ToolModuleFactory = (deps): ToolModule => {
  return {
    toolName: "build-toolset",
    definition: buildToolsetDefinition,
    handler: async (args: any) => {
      if (deps.discoveryEngine) {
        const result = await deps.toolsetManager.buildToolset(
          args?.name || '',
          args?.tools || [],
          {
            description: args?.description,
            autoEquip: args?.autoEquip
          }
        );

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result)
            }
          ],
          structuredContent: result
        };
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
    }
  };
};