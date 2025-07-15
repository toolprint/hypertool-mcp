/**
 * Get Active Toolset - Get detailed information about the currently equipped toolset
 */

import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { ToolModuleFactory, ToolModule } from "./types.js";
import { getActiveToolsetResponseSchema, getActiveToolsetResponseZodSchema } from "./schemas.js";

export const getActiveToolsetDefinition: Tool = {
  name: "get-active-toolset",
  description: "Get detailed information about the currently equipped toolset including availability status",
  inputSchema: {
    type: "object" as const,
    properties: {},
    additionalProperties: false,
  },
  outputSchema: getActiveToolsetResponseSchema as any
};

export const createGetActiveToolsetModule: ToolModuleFactory = (deps): ToolModule => {
  return {
    toolName: "get-active-toolset",
    definition: getActiveToolsetDefinition,
    handler: async (_args: any) => {
      const activeToolset = deps.toolsetManager.getActiveToolset();
      if (activeToolset) {
        // Get all discovered tools and active tools from toolset manager
        const allDiscoveredTools = deps.discoveryEngine?.getAvailableTools(true) || [];
        const activeDiscoveredTools = deps.toolsetManager.getActiveDiscoveredTools();
        
        // Generate full toolset information using the helper method
        const toolsetInfo = await deps.toolsetManager.generateToolsetInfo(activeToolset);
        
        // Group active tools by server
        const toolsByServer: Record<string, string[]> = {};
        const serverNames = new Set<string>();
        
        for (const tool of activeDiscoveredTools) {
          if (!toolsByServer[tool.serverName]) {
            toolsByServer[tool.serverName] = [];
          }
          toolsByServer[tool.serverName].push(tool.name);
          serverNames.add(tool.serverName);
        }

        // Check server availability
        const availableServers = new Set(allDiscoveredTools.map((t: any) => t.serverName));
        const unavailableServers = Array.from(serverNames).filter(name => !availableServers.has(name));

        // Create structured response
        const structuredResponse = {
          equipped: true,
          toolset: toolsetInfo,
          serverStatus: {
            totalConfigured: serverNames.size,
            enabled: serverNames.size,
            available: serverNames.size - unavailableServers.length,
            unavailable: unavailableServers.length,
            disabled: 0 // No disabled servers in simplified structure
          },
          toolSummary: {
            currentlyExposed: activeDiscoveredTools.length,
            totalDiscovered: allDiscoveredTools.length,
            filteredOut: allDiscoveredTools.length - activeDiscoveredTools.length
          },
          exposedTools: toolsByServer,
          unavailableServers,
          warnings: [] // Simplified: no warnings in current system
        };

        // Validate response against schema
        try {
          const validatedResponse = getActiveToolsetResponseZodSchema.parse(structuredResponse);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(validatedResponse)
              },
            ],
            structuredContent: validatedResponse
          };
        } catch (validationError) {
          console.error('Schema validation failed for get-active-toolset response:', validationError);
          // Return original response if validation fails (for debugging)
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(structuredResponse)
              },
            ],
            structuredContent: structuredResponse
          };
        }
      } else {
        const noToolsetResponse = {
          equipped: false,
          toolset: null,
          serverStatus: null,
          toolSummary: null,
          exposedTools: {},
          unavailableServers: [],
          warnings: []
        };

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(noToolsetResponse)
            },
          ],
          structuredContent: noToolsetResponse
        };
      }
    }
  };
};