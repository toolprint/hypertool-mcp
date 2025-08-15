/**
 * TypeScript interfaces for toolset configuration
 */

// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { DiscoveredTool } from "../../../discovery/types.js";

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
    throw new Error(
      "DynamicToolReference must have either namespacedName or refId"
    );
  }
}

export interface ToolsetToolNote {
  name: string;
  note: string;
}

export interface ToolsetToolNotes {
  toolRef: DynamicToolReference;
  notes: ToolsetToolNote[];
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
  /** Created timestamp (Date object or ISO string) */
  createdAt?: Date | string;
  /** Last modified timestamp (Date object or ISO string) */
  lastModified?: Date | string;
  /** Array of tool references in this toolset */
  tools: DynamicToolReference[];
  /** Array of tool notes for this toolset */
  toolNotes?: ToolsetToolNotes[];
}

// Note: ResolvedTool has been removed - use DiscoveredTool instead
// This provides the complete tool definition from the MCP server

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
  changeType: "equipped" | "updated" | "unequipped";
  /** Timestamp when the change occurred */
  timestamp?: Date;
}
