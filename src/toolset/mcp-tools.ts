/**
 * MCP tools for toolset configuration management
 */

import { promises as fs } from "fs";
import { homedir } from "os";
import path from "path";
import { DiscoveredTool } from "../discovery/types";
import { 
  ToolsetManager, 
  ToolsetConfig, 
  generateDefaultToolsetConfig,
  validateToolsetConfig 
} from "./index";

// Configuration directory for storing toolsets
const TOOLSET_CONFIG_DIR = path.join(homedir(), ".toolprint-meta-mcp");
const TOOLSETS_FILE = path.join(TOOLSET_CONFIG_DIR, "toolsets.json");

/**
 * Ensure config directory exists
 */
async function ensureConfigDir(): Promise<void> {
  try {
    await fs.mkdir(TOOLSET_CONFIG_DIR, { recursive: true });
  } catch {
    // Directory might already exist, that's fine
  }
}

/**
 * Load stored toolsets from config file
 */
export async function loadStoredToolsets(): Promise<Record<string, ToolsetConfig>> {
  try {
    await ensureConfigDir();
    const content = await fs.readFile(TOOLSETS_FILE, "utf-8");
    return JSON.parse(content);
  } catch {
    // File doesn't exist or is invalid, return empty object
    return {};
  }
}

/**
 * Save toolsets to config file
 */
async function saveStoredToolsets(toolsets: Record<string, ToolsetConfig>): Promise<void> {
  await ensureConfigDir();
  await fs.writeFile(TOOLSETS_FILE, JSON.stringify(toolsets, null, 2), "utf-8");
}

/**
 * Format discovered tools for user-friendly display
 */
export function formatAvailableTools(discoveredTools: DiscoveredTool[]): {
  summary: {
    totalTools: number;
    totalServers: number;
  };
  toolsByServer: Array<{
    serverName: string;
    toolCount: number;
    tools: Array<{
      name: string;
      description?: string;
      namespacedName: string;
      serverName: string;
      refId: string;
    }>;
  }>;
} {
  // Group tools by server
  const serverToolsMap: Record<string, Array<{
    name: string;
    description?: string;
    namespacedName: string;
    serverName: string;
    refId: string;
  }>> = {};

  // Track server name conflicts (multiple servers with same name)
  const serverNameCounts: Record<string, number> = {};

  for (const tool of discoveredTools) {
    // Initialize server group if needed
    if (!serverToolsMap[tool.serverName]) {
      serverToolsMap[tool.serverName] = [];
    }

    // Add tool to server group
    serverToolsMap[tool.serverName].push({
      name: tool.name,
      description: tool.description,
      namespacedName: tool.namespacedName,
      serverName: tool.serverName,
      refId: tool.fullHash, // Use the full hash as refId
    });

    // Track server name occurrences for conflict detection
    serverNameCounts[tool.serverName] = (serverNameCounts[tool.serverName] || 0) + 1;
  }

  // Sort tools within each server alphabetically
  Object.values(serverToolsMap).forEach(tools => {
    tools.sort((a, b) => a.name.localeCompare(b.name));
  });

  // Convert to array format
  const toolsByServer = Object.entries(serverToolsMap)
    .map(([serverName, tools]) => ({
      serverName,
      toolCount: tools.length,
      tools
    }))
    .sort((a, b) => a.serverName.localeCompare(b.serverName));

  return {
    summary: {
      totalTools: discoveredTools.length,
      totalServers: toolsByServer.length,
    },
    toolsByServer,
  };
}

/**
 * Validate tool references against available tools
 */
export function validateToolReferences(
  references: string[],
  discoveredTools: DiscoveredTool[]
): {
  valid: boolean;
  validReferences: string[];
  invalidReferences: string[];
  resolvedTools: DiscoveredTool[];
} {
  const validReferences: string[] = [];
  const invalidReferences: string[] = [];
  const resolvedTools: DiscoveredTool[] = [];

  // Create lookup maps for quick reference checking
  const toolNameMap = new Map<string, DiscoveredTool[]>();
  const namespacedMap = new Map<string, DiscoveredTool>();

  for (const tool of discoveredTools) {
    // Map by tool name (might have multiple servers with same tool)
    if (!toolNameMap.has(tool.name)) {
      toolNameMap.set(tool.name, []);
    }
    toolNameMap.get(tool.name)!.push(tool);

    // Map by namespaced name (unique)
    namespacedMap.set(tool.namespacedName, tool);
  }

  for (const ref of references) {
    // Try to resolve reference
    let resolved = false;

    // First, try exact namespaced match (e.g., "git.status")
    if (namespacedMap.has(ref)) {
      validReferences.push(ref);
      resolvedTools.push(namespacedMap.get(ref)!);
      resolved = true;
    }
    // Then try tool name match (e.g., "status")
    else if (toolNameMap.has(ref)) {
      const tools = toolNameMap.get(ref)!;
      if (tools.length === 1) {
        // Unambiguous reference
        validReferences.push(ref);
        resolvedTools.push(tools[0]);
        resolved = true;
      } else {
        // Ambiguous reference - multiple servers have this tool
        invalidReferences.push(ref);
      }
    }

    if (!resolved && !invalidReferences.includes(ref)) {
      invalidReferences.push(ref);
    }
  }

  return {
    valid: invalidReferences.length === 0,
    validReferences,
    invalidReferences,
    resolvedTools,
  };
}

/**
 * MCP Tool: List Available Tools
 */
export async function listAvailableTools(
  discoveredTools: DiscoveredTool[]
): Promise<{
  content: Array<{
    type: "text";
    text: string;
  }>;
}> {
  const formatted = formatAvailableTools(discoveredTools);

  let output = `# Available Tools Summary\n\n`;
  output += `**Total:** ${formatted.summary.totalTools} tools across ${formatted.summary.totalServers} servers\n\n`;

  // Server breakdown
  output += `## Tools by Server\n\n`;
  for (const serverGroup of formatted.toolsByServer) {
    output += `### ${serverGroup.serverName} (${serverGroup.toolCount} tools)\n`;
    for (const tool of serverGroup.tools) {
      output += `- **${tool.name}**`;
      if (tool.description) {
        output += `: ${tool.description}`;
      }
      output += ` → \`${tool.namespacedName}\`\n`;
    }
    output += `\n`;
  }

  // Usage help
  output += `## Usage\n\n`;
  output += `To reference tools in a toolset:\n`;
  output += `- Use **namespacedName** for clarity: \`"git.status"\`, \`"docker.ps"\`\n`;
  output += `- Use **refId** for exact identification: \`"abc123def456..."\`\n`;
  output += `- Use **patterns** for multiple tools: \`"git.*"\` or \`"^list"\`\n\n`;

  // Return structured JSON for LLM consumption
  const structuredResult = formatAvailableTools(discoveredTools);
  
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(structuredResult),
      },
    ],
  };
}

/**
 * MCP Tool: Generate Toolset
 */
export async function generateToolset(
  args: {
    name: string;
    toolReferences?: string[];
    serverConfigs?: Array<{
      serverName: string;
      enabled?: boolean;
      tools?: {
        include?: string[];
        exclude?: string[];
        includePattern?: string;
        excludePattern?: string;
        includeAll?: boolean;
      };
    }>;
    options?: {
      enableNamespacing?: boolean;
      conflictResolution?: "namespace" | "prefix-server" | "error";
    };
  },
  discoveredTools: DiscoveredTool[]
): Promise<{
  content: Array<{
    type: "text";
    text: string;
  }>;
}> {
  try {
    let config: ToolsetConfig;

    if (args.toolReferences && args.toolReferences.length > 0) {
      // Validate all tool references first
      const validation = validateToolReferences(args.toolReferences, discoveredTools);
      
      if (!validation.valid) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: false,
                error: "Invalid tool references",
                invalidReferences: validation.invalidReferences,
                validReferences: validation.validReferences,
                suggestion: "Use list-available-tools to see all available tools and their correct names"
              }),
            },
          ],
        };
      }

      // Create toolset config from tool references
      config = createToolsetFromReferences(args.name, validation.resolvedTools, args.options);
    } 
    else if (args.serverConfigs && args.serverConfigs.length > 0) {
      // Create toolset config from server configurations
      config = {
        name: args.name,
        description: `Custom toolset created with server configurations`,
        version: "1.0.0",
        createdAt: new Date(),
        servers: args.serverConfigs.map(serverConfig => ({
          serverName: serverConfig.serverName,
          enabled: serverConfig.enabled !== false,
          tools: serverConfig.tools || { includeAll: true },
          enableNamespacing: args.options?.enableNamespacing !== false,
        })),
        options: {
          enableNamespacing: args.options?.enableNamespacing !== false,
          conflictResolution: args.options?.conflictResolution || "namespace",
          autoResolveConflicts: true,
        },
      };
    } 
    else {
      // Generate default toolset
      config = generateDefaultToolsetConfig(discoveredTools, {
        name: args.name,
        description: `Auto-generated toolset including all available tools`,
      });
    }

    // Validate the generated config
    const configValidation = validateToolsetConfig(config);
    if (!configValidation.valid) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: false,
              error: "Configuration validation failed",
              validationErrors: configValidation.errors
            }),
          },
        ],
      };
    }

    // Save the toolset
    const stored = await loadStoredToolsets();
    stored[args.name] = config;
    await saveStoredToolsets(stored);

    // Create structured response
    const result = {
      success: true,
      toolsetName: args.name,
      location: TOOLSETS_FILE,
      configuration: {
        totalServers: config.servers.length,
        enabledServers: config.servers.filter(s => s.enabled !== false).length,
        servers: config.servers.map(server => ({
          name: server.serverName,
          enabled: server.enabled !== false,
          toolSelection: server.tools.includeAll ? "all" : 
                        server.tools.include ? `specific (${server.tools.include.length})` :
                        server.tools.includePattern ? `pattern: ${server.tools.includePattern}` : "unknown"
        }))
      },
      createdAt: config.createdAt
    };

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result),
        },
      ],
    };

  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: false,
            error: error instanceof Error ? error.message : String(error)
          }),
        },
      ],
    };
  }
}

/**
 * Helper: Create toolset config from resolved tool references
 */
function createToolsetFromReferences(
  name: string,
  resolvedTools: DiscoveredTool[],
  options?: { enableNamespacing?: boolean; conflictResolution?: string }
): ToolsetConfig {
  // Group tools by server
  const toolsByServer: Record<string, string[]> = {};
  
  for (const tool of resolvedTools) {
    if (!toolsByServer[tool.serverName]) {
      toolsByServer[tool.serverName] = [];
    }
    toolsByServer[tool.serverName].push(tool.name);
  }

  // Create server configs
  const servers = Object.entries(toolsByServer).map(([serverName, toolNames]) => ({
    serverName,
    enabled: true,
    enableNamespacing: options?.enableNamespacing !== false,
    tools: {
      include: toolNames,
    },
  }));

  return {
    name,
    description: `Custom toolset with ${resolvedTools.length} selected tools`,
    version: "1.0.0",
    createdAt: new Date(),
    servers,
    options: {
      enableNamespacing: options?.enableNamespacing !== false,
      conflictResolution: (options?.conflictResolution as any) || "namespace",
      autoResolveConflicts: true,
    },
  };
}

/**
 * MCP Tool: List Saved Toolsets
 */
export async function listSavedToolsets(): Promise<{
  content: Array<{
    type: "text";
    text: string;
  }>;
}> {
  try {
    const stored = await loadStoredToolsets();
    const names = Object.keys(stored);

    const result = {
      totalToolsets: names.length,
      storageLocation: TOOLSETS_FILE,
      toolsets: names.sort().map(name => {
        const config = stored[name];
        return {
          name,
          description: config.description || null,
          totalServers: config.servers.length,
          enabledServers: config.servers.filter(s => s.enabled !== false).length,
          createdAt: config.createdAt ? new Date(config.createdAt).toISOString() : null,
          version: config.version || '1.0.0'
        };
      })
    };

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result),
        },
      ],
    };

  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `❌ **Error Loading Toolsets**\n\n${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
}

/**
 * MCP Tool: Select and Apply Toolset
 */
export async function selectToolset(
  args: {
    name: string;
  },
  discoveredTools: DiscoveredTool[]
): Promise<{
  content: Array<{
    type: "text";
    text: string;
  }>;
}> {
  try {
    // Load the saved toolset
    const stored = await loadStoredToolsets();
    const config = stored[args.name];

    if (!config) {
      const availableNames = Object.keys(stored);
      return {
        content: [
          {
            type: "text",
            text: `❌ **Toolset "${args.name}" Not Found**\n\n` +
                   `Available toolsets: ${availableNames.length > 0 ? availableNames.join(', ') : 'none'}\n\n` +
                   `Use \`list-saved-toolsets\` to see all available toolsets or \`generate-toolset\` to create a new one.`,
          },
        ],
      };
    }

    // Apply the toolset configuration
    const manager = new ToolsetManager();
    manager.setConfig(config);
    const resolution = await manager.applyConfig(discoveredTools);

    // Generate detailed output with warnings
    let output = `✅ **Applied Toolset: "${args.name}"**\n\n`;

    if (config.description) {
      output += `${config.description}\n\n`;
    }

    // Summary statistics
    output += `## Summary\n`;
    output += `- **Total tools available:** ${discoveredTools.length}\n`;
    output += `- **Tools in toolset:** ${resolution.tools.length}\n`;
    output += `- **Servers configured:** ${config.servers.length}\n`;
    output += `- **Active servers:** ${config.servers.filter(s => s.enabled !== false).length}\n\n`;

    // Show active tools by server
    output += `## Active Tools\n\n`;
    const toolsByServer: Record<string, string[]> = {};
    
    for (const tool of resolution.tools) {
      if (!toolsByServer[tool.serverName]) {
        toolsByServer[tool.serverName] = [];
      }
      toolsByServer[tool.serverName].push(tool.resolvedName);
    }

    for (const [serverName, tools] of Object.entries(toolsByServer)) {
      output += `### ${serverName} (${tools.length} tools)\n`;
      const sortedTools = tools.sort();
      for (const tool of sortedTools) {
        output += `- \`${tool}\`\n`;
      }
      output += `\n`;
    }

    // Handle warnings for unavailable servers
    if (resolution.warnings && resolution.warnings.length > 0) {
      output += `## ⚠️ Warnings\n\n`;
      for (const warning of resolution.warnings) {
        output += `- ${warning}\n`;
      }
      output += `\n`;
    }

    // Handle conflicts
    if (resolution.conflicts && resolution.conflicts.length > 0) {
      output += `## 🔄 Conflicts Resolved\n\n`;
      for (const conflict of resolution.conflicts) {
        output += `- **${conflict.toolName}**: Found on servers [${conflict.servers.join(', ')}]`;
        if (conflict.resolution && conflict.resolvedNames) {
          output += ` → Resolved as [${conflict.resolvedNames.join(', ')}]`;
        }
        output += `\n`;
      }
      output += `\n`;
    }

    // Show disabled/unavailable servers
    const availableServers = new Set(discoveredTools.map(t => t.serverName));
    const disabledServers = config.servers.filter(s => s.enabled === false);
    const unavailableServers = config.servers.filter(s => 
      s.enabled !== false && !availableServers.has(s.serverName)
    );

    if (disabledServers.length > 0 || unavailableServers.length > 0) {
      output += `## ℹ️ Inactive Servers\n\n`;
      
      if (disabledServers.length > 0) {
        output += `**Disabled in configuration:**\n`;
        for (const server of disabledServers) {
          output += `- ${server.serverName} (explicitly disabled)\n`;
        }
        output += `\n`;
      }

      if (unavailableServers.length > 0) {
        output += `**Not currently available:**\n`;
        for (const server of unavailableServers) {
          output += `- ${server.serverName} (server not connected)\n`;
        }
        output += `\n`;
      }
    }

    // Show statistics if available
    if (resolution.stats) {
      output += `## 📊 Statistics\n`;
      output += `- **Resolution time:** ${resolution.stats.resolutionTime}ms\n`;
      output += `- **Tools excluded:** ${resolution.stats.totalExcluded}\n`;
      if (resolution.stats.conflictsDetected > 0) {
        output += `- **Conflicts detected:** ${resolution.stats.conflictsDetected}\n`;
      }
      output += `\n`;
    }

    // Usage guidance
    output += `## 💡 Next Steps\n`;
    output += `The toolset is now active! The tools listed above are available for use.\n\n`;
    if (resolution.warnings && resolution.warnings.length > 0) {
      output += `**Note:** Some servers are not available. Start those servers to access their tools.\n\n`;
    }

    return {
      content: [
        {
          type: "text",
          text: output,
        },
      ],
    };

  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `❌ **Error Selecting Toolset**\n\n${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
}

/**
 * MCP Tool: Delete Saved Toolset
 */
export async function deleteToolset(
  args: {
    name: string;
    confirm?: boolean;
  }
): Promise<{
  content: Array<{
    type: "text";
    text: string;
  }>;
}> {
  try {
    const stored = await loadStoredToolsets();
    
    if (!stored[args.name]) {
      const availableNames = Object.keys(stored);
      return {
        content: [
          {
            type: "text",
            text: `❌ **Toolset "${args.name}" Not Found**\n\n` +
                   `Available toolsets: ${availableNames.length > 0 ? availableNames.join(', ') : 'none'}`,
          },
        ],
      };
    }

    if (!args.confirm) {
      return {
        content: [
          {
            type: "text",
            text: `⚠️ **Confirm Deletion**\n\n` +
                   `Are you sure you want to delete toolset "${args.name}"?\n\n` +
                   `This action cannot be undone. Run again with \`confirm: true\` to delete.`,
          },
        ],
      };
    }

    // Delete the toolset
    delete stored[args.name];
    await saveStoredToolsets(stored);

    return {
      content: [
        {
          type: "text",
          text: `✅ **Toolset "${args.name}" Deleted**\n\nThe toolset has been permanently removed.`,
        },
      ],
    };

  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `❌ **Error Deleting Toolset**\n\n${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
}