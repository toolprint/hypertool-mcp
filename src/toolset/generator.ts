/**
 * Default toolset configuration generator
 */

import { DiscoveredTool } from "../discovery/types";
import {
  ToolsetConfig,
  ServerToolConfig,
  DEFAULT_TOOLSET_OPTIONS,
} from "./types";

/**
 * Generate default toolset configuration based on available tools
 */
export function generateDefaultToolsetConfig(
  discoveredTools: DiscoveredTool[],
  options: {
    name?: string;
    description?: string;
    includeAllServers?: boolean;
    enableNamespacing?: boolean;
    conflictResolution?: "namespace" | "prefix-server" | "error";
  } = {}
): ToolsetConfig {
  const {
    name = "Auto-generated Toolset",
    description = `Generated toolset containing tools from ${getUniqueServerNames(discoveredTools).length} servers`,
    includeAllServers = true,
    enableNamespacing = true,
    conflictResolution = "namespace",
  } = options;

  // Group tools by server
  const toolsByServer = groupToolsByServer(discoveredTools);
  const servers: ServerToolConfig[] = [];

  // Generate server configurations
  for (const [serverName, tools] of Object.entries(toolsByServer)) {
    if (includeAllServers || tools.length > 0) {
      const serverConfig: ServerToolConfig = {
        serverName,
        tools: {
          includeAll: true,
        },
        enabled: true,
        enableNamespacing,
      };

      // Add exclusions for common internal/debug tools
      const internalTools = tools
        .filter((tool) => isInternalTool(tool.name))
        .map((tool) => tool.name);

      if (internalTools.length > 0) {
        serverConfig.tools.exclude = internalTools;
      }

      servers.push(serverConfig);
    }
  }

  return {
    name,
    description,
    version: "1.0.0",
    createdAt: new Date(),
    servers,
    options: {
      ...DEFAULT_TOOLSET_OPTIONS,
      enableNamespacing,
      conflictResolution,
    },
  };
}

/**
 * Generate minimal toolset configuration with most commonly used tools
 */
export function generateMinimalToolsetConfig(
  discoveredTools: DiscoveredTool[],
  options: {
    name?: string;
    maxToolsPerServer?: number;
    priorityPatterns?: string[];
  } = {}
): ToolsetConfig {
  const {
    name = "Minimal Toolset",
    maxToolsPerServer = 5,
    priorityPatterns = ["^list", "^get", "^search", "^status", "^help"],
  } = options;

  const toolsByServer = groupToolsByServer(discoveredTools);
  const servers: ServerToolConfig[] = [];

  for (const [serverName, tools] of Object.entries(toolsByServer)) {
    // Select priority tools
    const priorityTools = selectPriorityTools(
      tools,
      priorityPatterns,
      maxToolsPerServer
    );

    if (priorityTools.length > 0) {
      servers.push({
        serverName,
        tools: {
          include: priorityTools.map((tool) => tool.name),
        },
        enabled: true,
        enableNamespacing: true,
      });
    }
  }

  return {
    name,
    description: `Minimal toolset with up to ${maxToolsPerServer} tools per server`,
    version: "1.0.0",
    createdAt: new Date(),
    servers,
    options: {
      ...DEFAULT_TOOLSET_OPTIONS,
      enableNamespacing: true,
      conflictResolution: "namespace",
    },
  };
}

/**
 * Generate toolset configuration for specific use case
 */
export function generateUseCaseToolsetConfig(
  discoveredTools: DiscoveredTool[],
  useCase: "development" | "deployment" | "monitoring" | "documentation",
  options: { name?: string } = {}
): ToolsetConfig {
  const toolsByServer = groupToolsByServer(discoveredTools);
  const servers: ServerToolConfig[] = [];

  const useCaseConfigs = {
    development: {
      name: "Development Toolset",
      description: "Tools commonly used during development",
      patterns: {
        git: { includeAll: true, exclude: ["git-gc", "git-fsck"] },
        docker: { includePattern: "^(build|run|ps|logs|exec)" },
        context7: { includePattern: "^(search|get|resolve)" },
        "task-master": { includeAll: true },
      },
    },
    deployment: {
      name: "Deployment Toolset",
      description: "Tools for deployment and infrastructure",
      patterns: {
        git: { include: ["git-push", "git-tag", "git-status"] },
        docker: { includePattern: "^(build|push|deploy|run)" },
      },
    },
    monitoring: {
      name: "Monitoring Toolset",
      description: "Tools for monitoring and observability",
      patterns: {
        docker: { include: ["docker-ps", "docker-logs", "docker-stats"] },
        git: { include: ["git-status", "git-log"] },
      },
    },
    documentation: {
      name: "Documentation Toolset",
      description: "Tools for documentation and help",
      patterns: {
        "*": { includePattern: "^(help|list|get.*doc|.*readme)" },
      },
    },
  };

  const config = useCaseConfigs[useCase];
  const configName = options.name || config.name;

  // Apply patterns to each server
  for (const [serverName] of Object.entries(toolsByServer)) {
    const serverPattern =
      (config.patterns as any)[serverName] || (config.patterns as any)["*"];

    if (serverPattern) {
      servers.push({
        serverName,
        tools: serverPattern,
        enabled: true,
        enableNamespacing: true,
      });
    }
  }

  return {
    name: configName,
    description: config.description,
    version: "1.0.0",
    createdAt: new Date(),
    servers,
    options: {
      ...DEFAULT_TOOLSET_OPTIONS,
      enableNamespacing: true,
      conflictResolution: "namespace",
    },
  };
}

/**
 * Generate toolset configuration with conflict analysis
 */
export function generateConflictAwareToolsetConfig(
  discoveredTools: DiscoveredTool[],
  options: { name?: string } = {}
): ToolsetConfig {
  const toolsByServer = groupToolsByServer(discoveredTools);
  const conflicts = analyzeToolNameConflicts(discoveredTools);
  const servers: ServerToolConfig[] = [];

  for (const [serverName] of Object.entries(toolsByServer)) {
    const serverConflicts = conflicts.filter((c) =>
      c.servers.includes(serverName)
    );
    const conflictingToolNames = serverConflicts.map((c) => c.toolName);

    servers.push({
      serverName,
      tools: {
        includeAll: true,
        // Exclude conflicting tools if there are many conflicts
        exclude:
          conflictingToolNames.length > 5 ? conflictingToolNames : undefined,
      },
      enabled: true,
      enableNamespacing: conflictingToolNames.length > 0,
      customNamespace: conflictingToolNames.length > 3 ? serverName : undefined,
    });
  }

  return {
    name: options.name || "Conflict-Aware Toolset",
    description: `Toolset designed to minimize conflicts (${conflicts.length} conflicts detected)`,
    version: "1.0.0",
    createdAt: new Date(),
    servers,
    options: {
      ...DEFAULT_TOOLSET_OPTIONS,
      enableNamespacing: true,
      autoResolveConflicts: true,
      conflictResolution: "namespace",
    },
  };
}

/**
 * Helper functions
 */

function groupToolsByServer(
  tools: DiscoveredTool[]
): Record<string, DiscoveredTool[]> {
  const grouped: Record<string, DiscoveredTool[]> = {};

  for (const tool of tools) {
    if (!grouped[tool.serverName]) {
      grouped[tool.serverName] = [];
    }
    grouped[tool.serverName].push(tool);
  }

  return grouped;
}

function getUniqueServerNames(tools: DiscoveredTool[]): string[] {
  return [...new Set(tools.map((tool) => tool.serverName))];
}

function isInternalTool(toolName: string): boolean {
  const internalPatterns = [
    /^debug/i,
    /^test/i,
    /^internal/i,
    /.*-debug$/i,
    /.*-test$/i,
    /.*-internal$/i,
    /^_/,
  ];

  return internalPatterns.some((pattern) => pattern.test(toolName));
}

function selectPriorityTools(
  tools: DiscoveredTool[],
  priorityPatterns: string[],
  maxCount: number
): DiscoveredTool[] {
  const priorityTools: DiscoveredTool[] = [];
  const remainingTools: DiscoveredTool[] = [];

  // Separate priority tools
  for (const tool of tools) {
    const isPriority = priorityPatterns.some((pattern) => {
      try {
        return new RegExp(pattern).test(tool.name);
      } catch {
        return false;
      }
    });

    if (isPriority) {
      priorityTools.push(tool);
    } else {
      remainingTools.push(tool);
    }
  }

  // Sort by name and take up to maxCount
  const selected = [
    ...priorityTools.sort((a, b) => a.name.localeCompare(b.name)),
    ...remainingTools.sort((a, b) => a.name.localeCompare(b.name)),
  ];

  return selected.slice(0, maxCount);
}

function analyzeToolNameConflicts(tools: DiscoveredTool[]): Array<{
  toolName: string;
  servers: string[];
}> {
  const toolNameCounts: Record<string, string[]> = {};

  // Count occurrences of each tool name
  for (const tool of tools) {
    if (!toolNameCounts[tool.name]) {
      toolNameCounts[tool.name] = [];
    }
    if (!toolNameCounts[tool.name].includes(tool.serverName)) {
      toolNameCounts[tool.name].push(tool.serverName);
    }
  }

  // Return conflicts (tool names that appear in multiple servers)
  return Object.entries(toolNameCounts)
    .filter(([, servers]) => servers.length > 1)
    .map(([toolName, servers]) => ({ toolName, servers }));
}
