/**
 * Toolset filtering and resolution logic
 */

import { DiscoveredTool } from "../discovery/types";
import {
  ToolsetConfig,
  ResolvedTool,
  ToolsetResolution,
  ToolNameConflict,
  ToolsetStats,
  DEFAULT_TOOLSET_OPTIONS,
} from "./types";
import { matchesToolPattern } from "./validator";

/**
 * Apply toolset configuration to discovered tools
 */
export async function applyToolsetConfig(
  discoveredTools: DiscoveredTool[],
  config: ToolsetConfig
): Promise<ToolsetResolution> {
  const startTime = Date.now();
  const resolvedTools: ResolvedTool[] = [];
  const warnings: string[] = [];
  const errors: string[] = [];
  const conflicts: ToolNameConflict[] = [];

  // Merge with default options
  const options = { ...DEFAULT_TOOLSET_OPTIONS, ...config.options };

  // Group tools by server
  const toolsByServer = groupToolsByServer(discoveredTools);

  // Process each server configuration
  for (const serverConfig of config.servers) {
    if (!serverConfig.enabled) {
      continue;
    }

    const serverTools = toolsByServer[serverConfig.serverName];
    if (!serverTools) {
      warnings.push(
        `Server "${serverConfig.serverName}" not found in discovered tools`
      );
      continue;
    }

    // Filter tools based on patterns
    const filteredTools = filterServerTools(serverTools, serverConfig.tools);

    // Convert to resolved tools
    const serverResolvedTools = filteredTools.map((tool) =>
      convertToResolvedTool(tool, serverConfig, options.namespaceSeparator)
    );

    resolvedTools.push(...serverResolvedTools);
  }

  // Detect and resolve conflicts
  const { resolvedToolsWithConflicts, detectedConflicts } =
    resolveNameConflicts(resolvedTools, options);

  conflicts.push(...detectedConflicts);

  // Generate statistics
  const stats = generateToolsetStats(
    discoveredTools,
    resolvedToolsWithConflicts,
    toolsByServer,
    conflicts.length,
    Date.now() - startTime
  );

  return {
    success: errors.length === 0,
    tools: resolvedToolsWithConflicts,
    warnings,
    errors,
    conflicts,
    stats,
  };
}

/**
 * Group discovered tools by server name
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

/**
 * Filter tools for a specific server based on patterns
 */
function filterServerTools(
  tools: DiscoveredTool[],
  pattern: any
): DiscoveredTool[] {
  return tools.filter((tool) => matchesToolPattern(tool.name, pattern));
}

/**
 * Convert discovered tool to resolved tool
 */
function convertToResolvedTool(
  tool: DiscoveredTool,
  serverConfig: any,
  namespaceSeparator: string
): ResolvedTool {
  const enableNamespacing = serverConfig.enableNamespacing !== false;
  const namespace = serverConfig.customNamespace || serverConfig.serverName;

  let resolvedName = tool.name;
  let isNamespaced = false;

  if (enableNamespacing) {
    resolvedName = `${namespace}${namespaceSeparator}${tool.name}`;
    isNamespaced = true;
  }

  return {
    originalName: tool.name,
    resolvedName,
    serverName: tool.serverName,
    isNamespaced,
    namespace: isNamespaced ? namespace : undefined,
    description: tool.description,
    inputSchema: tool.schema,
  };
}

/**
 * Resolve tool name conflicts
 */
function resolveNameConflicts(
  tools: ResolvedTool[],
  options: any
): {
  resolvedToolsWithConflicts: ResolvedTool[];
  detectedConflicts: ToolNameConflict[];
} {
  const conflicts: ToolNameConflict[] = [];
  const resolvedTools: ResolvedTool[] = [];
  const nameOccurrences: Record<string, ResolvedTool[]> = {};

  // Group tools by resolved name
  for (const tool of tools) {
    if (!nameOccurrences[tool.resolvedName]) {
      nameOccurrences[tool.resolvedName] = [];
    }
    nameOccurrences[tool.resolvedName].push(tool);
  }

  // Process each group
  for (const [resolvedName, toolGroup] of Object.entries(nameOccurrences)) {
    if (toolGroup.length === 1) {
      // No conflict
      resolvedTools.push(toolGroup[0]);
    } else {
      // Conflict detected
      const serverNames = toolGroup.map((t) => t.serverName);
      const conflict: ToolNameConflict = {
        toolName: resolvedName,
        servers: serverNames,
      };

      if (options.autoResolveConflicts) {
        const { resolvedToolsForConflict, resolution } = resolveConflict(
          toolGroup,
          options
        );

        conflict.resolution = resolution;
        conflict.resolvedNames = resolvedToolsForConflict.map(
          (t) => t.resolvedName
        );

        resolvedTools.push(...resolvedToolsForConflict);
      } else {
        conflict.resolution = "error";
        // Don't add conflicting tools to resolved list
      }

      conflicts.push(conflict);
    }
  }

  return {
    resolvedToolsWithConflicts: resolvedTools,
    detectedConflicts: conflicts,
  };
}

/**
 * Resolve a specific conflict
 */
function resolveConflict(
  conflictingTools: ResolvedTool[],
  options: any
): {
  resolvedToolsForConflict: ResolvedTool[];
  resolution: "namespaced" | "prefixed" | "error";
} {
  const resolvedTools: ResolvedTool[] = [];

  switch (options.conflictResolution) {
    case "namespace":
      // Force namespacing for all conflicting tools
      for (const tool of conflictingTools) {
        const namespacedTool = {
          ...tool,
          resolvedName: `${tool.serverName}${options.namespaceSeparator}${tool.originalName}`,
          isNamespaced: true,
          namespace: tool.serverName,
        };
        resolvedTools.push(namespacedTool);
      }
      return {
        resolvedToolsForConflict: resolvedTools,
        resolution: "namespaced",
      };

    case "prefix-server":
      // Prefix with server name
      for (const tool of conflictingTools) {
        const prefixedTool = {
          ...tool,
          resolvedName: `${tool.serverName}_${tool.originalName}`,
          isNamespaced: false,
        };
        resolvedTools.push(prefixedTool);
      }
      return {
        resolvedToolsForConflict: resolvedTools,
        resolution: "prefixed",
      };

    case "error":
    default:
      // Don't resolve, report as error
      return { resolvedToolsForConflict: [], resolution: "error" };
  }
}

/**
 * Generate toolset statistics
 */
function generateToolsetStats(
  discoveredTools: DiscoveredTool[],
  resolvedTools: ResolvedTool[],
  _toolsByServer: Record<string, DiscoveredTool[]>,
  conflictsDetected: number,
  resolutionTime: number
): ToolsetStats {
  const toolsByServerCount: Record<string, number> = {};

  // Count resolved tools by server
  for (const tool of resolvedTools) {
    toolsByServerCount[tool.serverName] =
      (toolsByServerCount[tool.serverName] || 0) + 1;
  }

  return {
    totalDiscovered: discoveredTools.length,
    totalIncluded: resolvedTools.length,
    totalExcluded: discoveredTools.length - resolvedTools.length,
    toolsByServer: toolsByServerCount,
    conflictsDetected,
    resolutionTime,
  };
}

/**
 * Get available tools for a toolset configuration
 */
export function getAvailableToolsForConfig(
  config: ToolsetConfig,
  discoveredTools: DiscoveredTool[]
): {
  availableServers: string[];
  unavailableServers: string[];
  serverToolCounts: Record<string, number>;
} {
  const toolsByServer = groupToolsByServer(discoveredTools);
  const availableServers: string[] = [];
  const unavailableServers: string[] = [];
  const serverToolCounts: Record<string, number> = {};

  for (const serverConfig of config.servers) {
    const serverTools = toolsByServer[serverConfig.serverName];
    if (serverTools) {
      availableServers.push(serverConfig.serverName);
      serverToolCounts[serverConfig.serverName] = serverTools.length;
    } else {
      unavailableServers.push(serverConfig.serverName);
      serverToolCounts[serverConfig.serverName] = 0;
    }
  }

  return {
    availableServers,
    unavailableServers,
    serverToolCounts,
  };
}

/**
 * Preview toolset configuration without applying it
 */
export function previewToolsetConfig(
  config: ToolsetConfig,
  discoveredTools: DiscoveredTool[]
): {
  preview: Array<{
    serverName: string;
    enabled: boolean;
    availableTools: string[];
    matchedTools: string[];
    excludedTools: string[];
  }>;
  summary: {
    totalServers: number;
    enabledServers: number;
    totalToolsMatched: number;
    totalToolsExcluded: number;
  };
} {
  const toolsByServer = groupToolsByServer(discoveredTools);
  const preview: Array<{
    serverName: string;
    enabled: boolean;
    availableTools: string[];
    matchedTools: string[];
    excludedTools: string[];
  }> = [];

  let totalToolsMatched = 0;
  let totalToolsExcluded = 0;

  for (const serverConfig of config.servers) {
    const serverTools = toolsByServer[serverConfig.serverName] || [];
    const availableTools = serverTools.map((t) => t.name);

    if (serverConfig.enabled) {
      const matchedTools = serverTools
        .filter((tool) => matchesToolPattern(tool.name, serverConfig.tools))
        .map((t) => t.name);

      const excludedTools = availableTools.filter(
        (name) => !matchedTools.includes(name)
      );

      totalToolsMatched += matchedTools.length;
      totalToolsExcluded += excludedTools.length;

      preview.push({
        serverName: serverConfig.serverName,
        enabled: true,
        availableTools,
        matchedTools,
        excludedTools,
      });
    } else {
      totalToolsExcluded += availableTools.length;

      preview.push({
        serverName: serverConfig.serverName,
        enabled: false,
        availableTools,
        matchedTools: [],
        excludedTools: availableTools,
      });
    }
  }

  return {
    preview,
    summary: {
      totalServers: config.servers.length,
      enabledServers: config.servers.filter((s) => s.enabled).length,
      totalToolsMatched,
      totalToolsExcluded,
    },
  };
}
