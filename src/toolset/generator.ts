/**
 * Simplified toolset configuration generator
 */

import { DiscoveredTool } from "../discovery/types";
import {
  ToolsetConfig,
  DynamicToolReference,
} from "./types";

/**
 * Generate empty toolset configuration 
 * Note: Users should select tools explicitly using build-toolset
 */
export function generateDefaultToolsetConfig(
  discoveredTools: DiscoveredTool[],
  options: {
    name?: string;
    description?: string;
  } = {}
): ToolsetConfig {
  const {
    name = "empty-toolset",
    description = `Empty toolset - users should select tools explicitly from ${getUniqueServerNames(discoveredTools).length} available servers`,
  } = options;

  // Return empty toolset - users must select tools explicitly
  return {
    name,
    description,
    version: "1.0.0",
    createdAt: new Date(),
    tools: [], // Intentionally empty - no default tools
  };
}

/**
 * Generate minimal toolset configuration with commonly used tools
 */
export function generateMinimalToolsetConfig(
  discoveredTools: DiscoveredTool[],
  options: {
    name?: string;
    maxToolsPerServer?: number;
  } = {}
): ToolsetConfig {
  const {
    name = "Minimal Toolset",
    maxToolsPerServer = 5,
  } = options;

  // Group tools by server and take the first few from each
  const toolsByServer = groupToolsByServer(discoveredTools);
  const selectedTools: DiscoveredTool[] = [];

  for (const tools of Object.values(toolsByServer)) {
    // Sort by name for consistency and take the first N tools
    const sortedTools = tools.sort((a, b) => a.name.localeCompare(b.name));
    selectedTools.push(...sortedTools.slice(0, maxToolsPerServer));
  }

  const toolRefs: DynamicToolReference[] = selectedTools.map(tool => ({
    namespacedName: tool.namespacedName,
    refId: tool.toolHash
  }));

  return {
    name,
    description: `Minimal toolset with ${selectedTools.length} commonly used tools`,
    version: "1.0.0",
    createdAt: new Date(),
    tools: toolRefs,
  };
}

/**
 * Generate use-case specific toolset configuration
 */
export function generateUseCaseToolsetConfig(
  discoveredTools: DiscoveredTool[],
  useCase: "development" | "administration" | "analysis",
  options: {
    name?: string;
  } = {}
): ToolsetConfig {
  const useCasePatterns = {
    development: ["git", "npm", "node", "build", "test", "lint", "format"],
    administration: ["system", "process", "service", "config", "status", "log"],
    analysis: ["analyze", "check", "inspect", "report", "stat", "info"]
  };

  const patterns = useCasePatterns[useCase] || [];
  const matchingTools = discoveredTools.filter(tool => 
    patterns.some(pattern => 
      tool.name.toLowerCase().includes(pattern) || 
      tool.tool.description?.toLowerCase().includes(pattern)
    )
  );

  const toolRefs: DynamicToolReference[] = matchingTools.map(tool => ({
    namespacedName: tool.namespacedName,
    refId: tool.toolHash
  }));

  return {
    name: options.name || `${useCase.charAt(0).toUpperCase() + useCase.slice(1)} Tools`,
    description: `Toolset for ${useCase} use case with ${matchingTools.length} relevant tools`,
    version: "1.0.0",
    createdAt: new Date(),
    tools: toolRefs,
  };
}

/**
 * Generate conflict-aware toolset configuration (legacy - no longer needed in simplified system)
 */
export function generateConflictAwareToolsetConfig(
  discoveredTools: DiscoveredTool[],
  options: {
    name?: string;
  } = {}
): ToolsetConfig {
  // In simplified system, conflicts are handled by the discovery engine
  // This function now just creates a standard toolset
  return generateDefaultToolsetConfig(discoveredTools, options);
}

/**
 * Helper function to get unique server names
 */
function getUniqueServerNames(tools: DiscoveredTool[]): string[] {
  return Array.from(new Set(tools.map(tool => tool.serverName)));
}

/**
 * Helper function to group tools by server
 */
function groupToolsByServer(tools: DiscoveredTool[]): Record<string, DiscoveredTool[]> {
  const grouped: Record<string, DiscoveredTool[]> = {};
  
  for (const tool of tools) {
    if (!grouped[tool.serverName]) {
      grouped[tool.serverName] = [];
    }
    grouped[tool.serverName].push(tool);
  }
  
  return grouped;
}