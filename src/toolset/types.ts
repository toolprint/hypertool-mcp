/**
 * TypeScript interfaces for toolset configuration
 */

import { DiscoveredTool } from "../discovery/types";

/**
 * Dynamic tool reference that can specify a tool by namespacedName, refId, or both
 */
export type DynamicToolReference = {
  /** Tool reference by namespaced name (e.g., 'git.status', 'docker.ps') */
  namespacedName?: string;
  /** Tool reference by unique hash identifier (e.g., 'abc123def456...') */
  refId?: string;
};

/**
 * Convert a DynamicToolReference to a string for validation/lookup
 * Prefers namespacedName over refId if both are present
 */
export function resolveToolReference(ref: DynamicToolReference): string {
  if (ref.namespacedName) {
    return ref.namespacedName;
  } else if (ref.refId) {
    return ref.refId;
  } else {
    throw new Error("DynamicToolReference must have either namespacedName or refId");
  }
}

/**
 * Complete toolset configuration for user-generated toolsets
 */
export interface ToolsetConfig {
  /** Configuration name/identifier */
  name: string;
  /** Human-readable description */
  description?: string;
  /** Configuration version (for future compatibility) */
  version?: string;
  /** Created timestamp */
  createdAt?: Date;
  /** Last modified timestamp */
  lastModified?: Date;
  /** Array of tool references in this toolset */
  tools: DynamicToolReference[];
}

/**
 * Global toolset configuration options
 */
export interface ToolsetOptions {
  /** Default namespace separator */
  namespaceSeparator?: string;
  /** Whether to enable namespacing by default */
  enableNamespacing?: boolean;
  /** Whether to resolve tool name conflicts automatically */
  autoResolveConflicts?: boolean;
  /** Conflict resolution strategy */
  conflictResolution?: "namespace" | "prefix-server" | "error";
  /** Whether to cache resolved toolsets */
  enableCaching?: boolean;
  /** Cache TTL in milliseconds */
  cacheTtl?: number;
}

// Note: ResolvedTool has been removed - use DiscoveredTool instead
// This provides the complete tool definition from the MCP server

/**
 * Toolset resolution result
 */
export interface ToolsetResolution {
  /** Whether resolution was successful */
  success: boolean;
  /** Resolved tools */
  tools: DiscoveredTool[];
  /** Warnings during resolution */
  warnings?: string[];
  /** Errors during resolution */
  errors?: string[];
  /** Conflicts detected */
  conflicts?: ToolNameConflict[];
  /** Resolution statistics */
  stats?: ToolsetStats;
}

/**
 * Tool name conflict information
 */
export interface ToolNameConflict {
  /** Conflicting tool name */
  toolName: string;
  /** Servers that have this tool */
  servers: string[];
  /** How the conflict was resolved */
  resolution?: "namespaced" | "prefixed" | "error";
  /** Final resolved names */
  resolvedNames?: string[];
}

/**
 * Toolset resolution statistics
 */
export interface ToolsetStats {
  /** Total tools discovered */
  totalDiscovered: number;
  /** Total tools included in toolset */
  totalIncluded: number;
  /** Total tools excluded */
  totalExcluded: number;
  /** Tools by server */
  toolsByServer: Record<string, number>;
  /** Conflicts detected */
  conflictsDetected: number;
  /** Resolution time in milliseconds */
  resolutionTime: number;
}

/**
 * Toolset configuration validation result
 */
export interface ValidationResult {
  /** Whether validation passed */
  valid: boolean;
  /** Validation errors */
  errors: string[];
  /** Validation warnings */
  warnings: string[];
  /** Suggested fixes */
  suggestions?: string[];
}

/**
 * Toolset configuration parser options
 */
export interface ToolsetParserOptions {
  /** Whether to validate against available servers */
  validateServers?: boolean;
  /** Whether to resolve tool references */
  resolveTools?: boolean;
  /** Whether to enable strict mode */
  strict?: boolean;
  /** Custom schema validation */
  customValidation?: (config: ToolsetConfig) => ValidationResult;
}

/**
 * Default toolset configuration options
 */
export const DEFAULT_TOOLSET_OPTIONS: Required<ToolsetOptions> = {
  namespaceSeparator: ".",
  enableNamespacing: true,
  autoResolveConflicts: true,
  conflictResolution: "namespace",
  enableCaching: true,
  cacheTtl: 5 * 60 * 1000, // 5 minutes
};

// Note: Default patterns removed in simplified toolset system
// Users must explicitly select tools - no defaults

/**
 * Event emitted when a toolset changes
 */
export interface ToolsetChangeEvent {
  /** The previously active toolset (null if none was active) */
  previousToolset: ToolsetConfig | null;
  /** The newly active toolset (null if toolset was unequipped) */
  newToolset: ToolsetConfig | null;
  /** Type of change that occurred */
  changeType: 'equipped' | 'updated' | 'unequipped';
  /** Timestamp when the change occurred */
  timestamp?: Date;
}
