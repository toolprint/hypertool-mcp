/**
 * Get Active Toolset - Get detailed information about the currently equipped toolset
 */

import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { ToolModuleFactory, ToolModule } from "./types.js";

export const getActiveToolsetDefinition: Tool = {
  name: "get-active-toolset",
  description: "Get detailed information about the currently equipped toolset including availability status",
  inputSchema: {
    type: "object" as const,
    properties: {},
    additionalProperties: false,
  },
  outputSchema: {
    type: "object" as const,
    properties: {
      equipped: { type: "boolean" },
      toolset: {
        type: "object",
        properties: {
          name: { type: "string" },
          description: { type: "string" },
          version: { type: "string" },
          createdAt: { type: "string" },
          conflictResolution: { type: "string" }
        }
      },
      serverStatus: {
        type: "object",
        properties: {
          totalConfigured: { type: "number" },
          enabled: { type: "number" },
          available: { type: "number" },
          unavailable: { type: "number" },
          disabled: { type: "number" }
        }
      },
      toolSummary: {
        type: "object",
        properties: {
          currentlyExposed: { type: "number" },
          totalDiscovered: { type: "number" },
          filteredOut: { type: "number" }
        }
      },
      exposedTools: { type: "object" },
      unavailableServers: { type: "array", items: { type: "string" } },
      warnings: { type: "array", items: { type: "string" } }
    }
  }
};

export const createGetActiveToolsetModule: ToolModuleFactory = (deps): ToolModule => {
  return {
    toolName: "get-active-toolset",
    definition: getActiveToolsetDefinition,
    handler: async (_args: any) => {
      const activeToolsetInfo = deps.toolsetManager.getActiveToolsetInfo();
      if (activeToolsetInfo) {
        // Get all discovered tools and active tools from toolset manager
        const allDiscoveredTools = deps.discoveryEngine?.getAvailableTools(true) || [];
        const activeDiscoveredTools = deps.toolsetManager.getActiveDiscoveredTools();
        
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
          toolset: {
            name: activeToolsetInfo.name,
            description: activeToolsetInfo.description || '',
            version: activeToolsetInfo.version || '1.0.0',
            createdAt: activeToolsetInfo.createdAt instanceof Date 
              ? activeToolsetInfo.createdAt.toISOString() 
              : activeToolsetInfo.createdAt || '',
            toolCount: activeToolsetInfo.toolCount
          },
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

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(structuredResponse)
            },
          ],
          structuredContent: structuredResponse
        };
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