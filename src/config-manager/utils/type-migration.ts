/**
 * Migration utility to add missing type fields to MCP server configurations
 */

import { MCPConfig, MCPServerConfig } from "../types/index.js";

/**
 * Add missing type fields to server configurations
 * @param config The MCP configuration to migrate
 * @returns Updated configuration with type fields added
 */
export function addMissingTypeFields(config: MCPConfig): MCPConfig {
  if (!config.mcpServers) {
    return config;
  }

  let modified = false;
  const updatedServers: Record<string, MCPServerConfig> = {};

  for (const [name, server] of Object.entries(config.mcpServers)) {
    if (!server || typeof server !== "object") {
      updatedServers[name] = server as any;
      continue;
    }

    if (!server.type) {
      // Determine type based on configuration
      if (server.command) {
        // Has command field, must be stdio type
        updatedServers[name] = {
          ...server,
          type: "stdio",
        } as MCPServerConfig;
        modified = true;
        console.log(`Added type "stdio" to server "${name}"`);
      } else if (server.url) {
        // Has url field, determine if http or sse based on other indicators
        // Default to http unless there are SSE-specific indicators
        const inferredType =
          server.url.includes("sse") || server.events ? "sse" : "http";
        updatedServers[name] = {
          ...server,
          type: inferredType,
        } as MCPServerConfig;
        modified = true;
        console.log(`Added type "${inferredType}" to server "${name}"`);
      } else {
        // Unknown configuration, skip
        console.warn(
          `Server "${name}" has no recognizable fields (command or url), skipping type migration`
        );
        updatedServers[name] = server as any;
      }
    } else {
      updatedServers[name] = server as MCPServerConfig;
    }
  }

  if (modified) {
    console.info("Added missing type fields to MCP server configurations");
  }

  return {
    ...config,
    mcpServers: updatedServers,
  };
}

/**
 * Check if a configuration needs type migration
 * @param config The MCP configuration to check
 * @returns True if migration is needed
 */
export function needsTypeMigration(config: MCPConfig): boolean {
  if (!config.mcpServers) {
    return false;
  }

  for (const server of Object.values(config.mcpServers)) {
    if (server && typeof server === "object" && !server.type) {
      return true;
    }
  }

  return false;
}
