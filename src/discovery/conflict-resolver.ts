/**
 * Tool name conflict resolution with server namespace prefixing
 */

import { DiscoveredTool } from "./types";
import { ToolHashUtils } from "./hash-utils";

/**
 * Conflict resolution strategy types
 */
export type ConflictResolutionStrategy =
  | "namespace" // Prefix with server name (default)
  | "suffix" // Suffix with server name
  | "merge" // Merge tool schemas if compatible
  | "priority" // Use server priority order
  | "first" // Use first discovered tool
  | "error"; // Throw error on conflict

/**
 * Conflict resolution configuration
 */
export interface ConflictResolutionConfig {
  strategy: ConflictResolutionStrategy;
  separator: string;
  serverPriority?: string[];
  allowMerging?: boolean;
  mergingRules?: {
    requireSameDescription?: boolean;
    allowSchemaExtension?: boolean;
  };
}

/**
 * Tool name conflict information
 */
export interface ToolConflict {
  toolName: string;
  conflictingServers: string[];
  tools: DiscoveredTool[];
  resolution?: ConflictResolution;
}

/**
 * Conflict resolution result
 */
export interface ConflictResolution {
  strategy: ConflictResolutionStrategy;
  resolvedTools: DiscoveredTool[];
  discardedTools: DiscoveredTool[];
  mergedTool?: DiscoveredTool;
  reason: string;
}

/**
 * Default conflict resolution configuration
 */
export const DEFAULT_CONFLICT_CONFIG: ConflictResolutionConfig = {
  strategy: "namespace",
  separator: ".",
  allowMerging: false,
  mergingRules: {
    requireSameDescription: true,
    allowSchemaExtension: false,
  },
};

/**
 * Tool conflict resolver
 */
export class ToolConflictResolver {
  private config: ConflictResolutionConfig;

  constructor(config: ConflictResolutionConfig = DEFAULT_CONFLICT_CONFIG) {
    this.config = { ...DEFAULT_CONFLICT_CONFIG, ...config };
  }

  /**
   * Detect conflicts in a list of tools
   */
  detectConflicts(tools: DiscoveredTool[]): ToolConflict[] {
    const toolsByName = new Map<string, DiscoveredTool[]>();

    // Group tools by name
    for (const tool of tools) {
      const name = tool.name;
      if (!toolsByName.has(name)) {
        toolsByName.set(name, []);
      }
      toolsByName.get(name)!.push(tool);
    }

    // Find conflicts (multiple tools with same name from different servers)
    const conflicts: ToolConflict[] = [];

    for (const [toolName, toolList] of toolsByName) {
      if (toolList.length > 1) {
        const servers = new Set(toolList.map((t) => t.serverName));
        if (servers.size > 1) {
          conflicts.push({
            toolName,
            conflictingServers: Array.from(servers),
            tools: toolList,
          });
        }
      }
    }

    return conflicts;
  }

  /**
   * Resolve a specific tool conflict
   */
  resolveConflict(conflict: ToolConflict): ConflictResolution {
    switch (this.config.strategy) {
      case "namespace":
        return this.resolveWithNamespace(conflict);

      case "suffix":
        return this.resolveWithSuffix(conflict);

      case "merge":
        return this.resolveWithMerging(conflict);

      case "priority":
        return this.resolveWithPriority(conflict);

      case "first":
        return this.resolveWithFirst(conflict);

      case "error":
        throw new Error(
          `Tool name conflict detected: "${conflict.toolName}" exists in servers: ${conflict.conflictingServers.join(", ")}`
        );

      default:
        throw new Error(
          `Unknown conflict resolution strategy: ${this.config.strategy}`
        );
    }
  }

  /**
   * Resolve conflicts in a tool list
   */
  resolveConflicts(tools: DiscoveredTool[]): DiscoveredTool[] {
    const conflicts = this.detectConflicts(tools);

    if (conflicts.length === 0) {
      return tools;
    }

    const resolvedTools = [...tools];
    const conflictedToolNames = new Set(conflicts.map((c) => c.toolName));

    // Remove all conflicted tools first
    const nonConflictedTools = resolvedTools.filter(
      (tool) => !conflictedToolNames.has(tool.name)
    );

    // Resolve each conflict and add resolved tools
    for (const conflict of conflicts) {
      const resolution = this.resolveConflict(conflict);
      conflict.resolution = resolution;
      nonConflictedTools.push(...resolution.resolvedTools);
    }

    return nonConflictedTools;
  }

  /**
   * Resolve conflict using namespace prefixing
   */
  private resolveWithNamespace(conflict: ToolConflict): ConflictResolution {
    const resolvedTools: DiscoveredTool[] = [];

    for (const tool of conflict.tools) {
      const namespacedTool: DiscoveredTool = {
        ...tool,
        namespacedName: `${tool.serverName}${this.config.separator}${tool.name}`,
      };
      resolvedTools.push(namespacedTool);
    }

    return {
      strategy: "namespace",
      resolvedTools,
      discardedTools: [],
      reason: `Applied namespace prefix to resolve conflict for tool "${conflict.toolName}"`,
    };
  }

  /**
   * Resolve conflict using server name suffix
   */
  private resolveWithSuffix(conflict: ToolConflict): ConflictResolution {
    const resolvedTools: DiscoveredTool[] = [];

    for (const tool of conflict.tools) {
      const suffixedTool: DiscoveredTool = {
        ...tool,
        namespacedName: `${tool.name}${this.config.separator}${tool.serverName}`,
      };
      resolvedTools.push(suffixedTool);
    }

    return {
      strategy: "suffix",
      resolvedTools,
      discardedTools: [],
      reason: `Applied server name suffix to resolve conflict for tool "${conflict.toolName}"`,
    };
  }

  /**
   * Resolve conflict by merging compatible tools
   */
  private resolveWithMerging(conflict: ToolConflict): ConflictResolution {
    if (!this.config.allowMerging) {
      // Fall back to namespace strategy
      return this.resolveWithNamespace(conflict);
    }

    // Check if tools can be merged
    const canMerge = this.canMergeTools(conflict.tools);

    if (!canMerge) {
      // Fall back to namespace strategy
      return this.resolveWithNamespace(conflict);
    }

    // Create merged tool
    const mergedTool = this.mergeTools(conflict.tools);

    return {
      strategy: "merge",
      resolvedTools: [mergedTool],
      discardedTools: conflict.tools,
      mergedTool,
      reason: `Merged compatible tools for "${conflict.toolName}"`,
    };
  }

  /**
   * Resolve conflict using server priority order
   */
  private resolveWithPriority(conflict: ToolConflict): ConflictResolution {
    if (
      !this.config.serverPriority ||
      this.config.serverPriority.length === 0
    ) {
      // Fall back to first strategy
      return this.resolveWithFirst(conflict);
    }

    // Find highest priority tool
    let selectedTool: DiscoveredTool | null = null;
    let highestPriority = -1;

    for (const tool of conflict.tools) {
      const priority = this.config.serverPriority.indexOf(tool.serverName);
      if (
        priority !== -1 &&
        (selectedTool === null || priority < highestPriority)
      ) {
        selectedTool = tool;
        highestPriority = priority;
      }
    }

    // If no tool found in priority list, use first tool
    if (!selectedTool) {
      selectedTool = conflict.tools[0];
    }

    const discardedTools = conflict.tools.filter((t) => t !== selectedTool);

    return {
      strategy: "priority",
      resolvedTools: [selectedTool],
      discardedTools,
      reason: `Selected tool from server "${selectedTool.serverName}" based on priority`,
    };
  }

  /**
   * Resolve conflict by using first discovered tool
   */
  private resolveWithFirst(conflict: ToolConflict): ConflictResolution {
    // Sort by discovery time and take the first
    const sortedTools = [...conflict.tools].sort(
      (a, b) => a.discoveredAt.getTime() - b.discoveredAt.getTime()
    );

    const selectedTool = sortedTools[0];
    const discardedTools = sortedTools.slice(1);

    return {
      strategy: "first",
      resolvedTools: [selectedTool],
      discardedTools,
      reason: `Selected first discovered tool from server "${selectedTool.serverName}"`,
    };
  }

  /**
   * Check if tools can be merged
   */
  private canMergeTools(tools: DiscoveredTool[]): boolean {
    if (tools.length < 2) {
      return false;
    }

    const first = tools[0];

    // Check description compatibility
    if (this.config.mergingRules?.requireSameDescription) {
      for (const tool of tools.slice(1)) {
        if (tool.description !== first.description) {
          return false;
        }
      }
    }

    // Check schema compatibility
    for (const tool of tools.slice(1)) {
      if (!this.areSchemaCompatible(first.schema, tool.schema)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Check if two schemas are compatible for merging
   */
  private areSchemaCompatible(schema1: any, schema2: any): boolean {
    // Simple compatibility check - schemas must be identical or one extends the other
    if (JSON.stringify(schema1) === JSON.stringify(schema2)) {
      return true;
    }

    if (!this.config.mergingRules?.allowSchemaExtension) {
      return false;
    }

    // Check if one schema extends the other (simplified check)
    const props1 = schema1.properties || {};
    const props2 = schema2.properties || {};

    const keys1 = Object.keys(props1);
    const keys2 = Object.keys(props2);

    // Check if one is subset of the other
    const isSubset = (smaller: string[], larger: string[]) =>
      smaller.every((key) => larger.includes(key));

    return isSubset(keys1, keys2) || isSubset(keys2, keys1);
  }

  /**
   * Merge compatible tools into a single tool
   */
  private mergeTools(tools: DiscoveredTool[]): DiscoveredTool {
    const first = tools[0];
    const serverNames = tools.map((t) => t.serverName).sort();

    // Create merged schema (take the one with more properties)
    let mergedSchema = first.schema;
    for (const tool of tools.slice(1)) {
      const props1 = Object.keys(mergedSchema.properties || {});
      const props2 = Object.keys(tool.schema.properties || {});

      if (props2.length > props1.length) {
        mergedSchema = tool.schema;
      }
    }

    const merged: DiscoveredTool = {
      name: first.name,
      serverName: serverNames.join(","),
      namespacedName: first.name, // Keep original name for merged tools
      schema: mergedSchema,
      description: first.description,
      discoveredAt: new Date(
        Math.min(...tools.map((t) => t.discoveredAt.getTime()))
      ),
      lastUpdated: new Date(),
      serverStatus: "connected",
      structureHash: "",
      fullHash: "",
    };

    // Calculate hashes for the merged tool
    merged.structureHash = ToolHashUtils.calculateStructureHash(merged);
    merged.fullHash = ToolHashUtils.calculateFullHash(merged);

    return merged;
  }

  /**
   * Get conflict resolution statistics
   */
  getConflictStats(tools: DiscoveredTool[]) {
    const conflicts = this.detectConflicts(tools);
    const totalConflicts = conflicts.length;
    const conflictedTools = conflicts.reduce(
      (sum, c) => sum + c.tools.length,
      0
    );

    return {
      totalConflicts,
      conflictedTools,
      conflictRate: tools.length > 0 ? conflictedTools / tools.length : 0,
      conflicts: conflicts.map((c) => ({
        toolName: c.toolName,
        serverCount: c.conflictingServers.length,
        servers: c.conflictingServers,
      })),
    };
  }

  /**
   * Update conflict resolution configuration
   */
  updateConfig(config: Partial<ConflictResolutionConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): ConflictResolutionConfig {
    return { ...this.config };
  }
}
