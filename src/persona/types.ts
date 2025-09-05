/**
 * TypeScript interfaces and types for the persona content pack system
 *
 * This module defines all the core interfaces required for managing persona configurations,
 * including toolset definitions, validation, and lifecycle management.
 *
 * @fileoverview Core persona system types and interfaces
 */

import type { MCPConfig } from "../types/config.js";

/**
 * Simplified toolset configuration within a persona
 *
 * This is intentionally simpler than the existing ToolsetConfig to focus
 * on the essential elements needed for persona-based tool management.
 */
export interface PersonaToolset {
  /** Toolset name (hyphen-delimited lowercase) */
  name: string;

  /** Array of tool IDs with MCP server prefix (e.g., "git.status", "docker.ps") */
  toolIds: string[];
}

/**
 * Main persona configuration schema
 *
 * Represents the structure of a persona.yaml/yml file.
 * Names must be hyphen-delimited lowercase and match the folder name.
 */
export interface PersonaConfig {
  /** Persona name (hyphen-delimited lowercase, must match folder name) */
  name: string;

  /** Human-readable description of the persona */
  description: string;

  /** Optional array of toolset configurations */
  toolsets?: PersonaToolset[];

  /** Optional default toolset name (must exist in toolsets array) */
  defaultToolset?: string;

  /** Schema version for future compatibility */
  version?: string;

  /** Additional metadata */
  metadata?: {
    /** Persona author */
    author?: string;

    /** Categorization tags */
    tags?: string[];

    /** Creation timestamp */
    created?: string;

    /** Last modification timestamp */
    lastModified?: string;
  };
}

/**
 * Persona asset information
 *
 * Tracks all files and resources associated with a persona,
 * including configuration files and additional assets for future bundling.
 */
export interface PersonaAssets {
  /** Path to persona.yaml/yml file */
  configFile: string;

  /** Path to optional mcp.json file */
  mcpConfigFile?: string;

  /** Array of additional asset file paths */
  assetFiles?: string[];

  /** Whether persona is in .htp archive format */
  isArchived?: boolean;

  /** Archive path if isArchived is true */
  archivePath?: string;
}

/**
 * Complete loaded persona with all associated data
 *
 * Represents a fully loaded and validated persona with all its configuration,
 * assets, and validation status.
 */
export interface LoadedPersona {
  /** Parsed persona configuration */
  config: PersonaConfig;

  /** Asset file information */
  assets: PersonaAssets;

  /** Loaded MCP configuration if present */
  mcpConfig?: MCPConfig;

  /** Validation result */
  validation: ValidationResult;

  /** Load timestamp */
  loadedAt: Date;

  /** Source directory or archive path */
  sourcePath: string;
}

/**
 * Persona discovery result
 *
 * Contains the results of scanning for persona folders/archives
 * along with any errors or warnings encountered during discovery.
 */
export interface PersonaDiscoveryResult {
  /** Found persona folders/archives */
  personas: PersonaReference[];

  /** Discovery errors */
  errors: string[];

  /** Discovery warnings */
  warnings: string[];

  /** Search locations */
  searchPaths: string[];
}

/**
 * Reference to a discovered persona
 *
 * Lightweight reference containing essential metadata about a persona
 * discovered during file system scanning, without full parsing.
 */
export interface PersonaReference {
  /** Persona name from config */
  name: string;

  /** Full path to persona folder or archive */
  path: string;

  /** Whether this is an archive (.htp) file */
  isArchive: boolean;

  /** Brief description if parseable */
  description?: string;

  /** Whether persona appears valid */
  isValid: boolean;

  /** Any validation issues found during discovery */
  issues?: string[];
}

/**
 * Validation result structure
 *
 * Aligned with existing toolset ValidationResult interface but adapted
 * for persona-specific validation needs.
 */
export interface ValidationResult {
  /** Overall validation status */
  isValid: boolean;

  /** Array of validation errors */
  errors: PersonaValidationErrorInfo[];

  /** Array of validation warnings */
  warnings: PersonaValidationErrorInfo[];
}

/**
 * Detailed validation error information
 *
 * Provides specific information about validation failures including
 * the type of error, affected field, and actionable suggestions.
 */
export interface PersonaValidationErrorInfo {
  /** Type of validation error */
  type: "schema" | "business" | "tool-resolution" | "mcp-config";

  /** Specific field that failed validation */
  field?: string;

  /** Human-readable error message */
  message: string;

  /** Suggestion for fixing the error */
  suggestion?: string;

  /** Error severity */
  severity: "error" | "warning";
}

/**
 * Result of persona activation
 *
 * Contains information about the success/failure of persona activation
 * including any errors or warnings that occurred during the process.
 */
export interface ActivationResult {
  /** Whether activation succeeded */
  success: boolean;

  /** Activated persona name */
  personaName: string;

  /** Activated toolset name if any */
  activatedToolset?: string;

  /** Any errors during activation */
  errors?: string[];

  /** Any warnings during activation */
  warnings?: string[];
}

/**
 * Persona system error codes
 *
 * Enumeration of all possible error conditions that can occur
 * during persona operations.
 */
export enum PersonaErrorCode {
  PERSONA_NOT_FOUND = "PERSONA_NOT_FOUND",
  INVALID_SCHEMA = "INVALID_SCHEMA",
  VALIDATION_FAILED = "VALIDATION_FAILED",
  ACTIVATION_FAILED = "ACTIVATION_FAILED",
  TOOLSET_NOT_FOUND = "TOOLSET_NOT_FOUND",
  TOOL_RESOLUTION_FAILED = "TOOL_RESOLUTION_FAILED",
  MCP_CONFIG_CONFLICT = "MCP_CONFIG_CONFLICT",
  FILE_SYSTEM_ERROR = "FILE_SYSTEM_ERROR",
  YAML_PARSE_ERROR = "YAML_PARSE_ERROR",
  PERMISSION_DENIED = "PERMISSION_DENIED",
  DUPLICATE_PERSONA_NAME = "DUPLICATE_PERSONA_NAME",
  ARCHIVE_EXTRACTION_FAILED = "ARCHIVE_EXTRACTION_FAILED",
}

/**
 * Persona system error interface
 *
 * Interface definition for persona error structure - the actual implementation
 * is provided by the PersonaError class in errors.ts
 */
export interface PersonaErrorInterface extends Error {
  /** Specific error code for programmatic handling */
  code: PersonaErrorCode;

  /** Additional error details */
  details?: Record<string, any>;

  /** Actionable suggestions for resolving the error */
  suggestions?: string[];

  /** Whether the error is recoverable */
  recoverable: boolean;
}

/**
 * Persona manager events
 *
 * Event names that can be emitted by the persona management system
 * for state change notifications.
 */
export enum PersonaEvents {
  PERSONA_ACTIVATED = "persona:activated",
  PERSONA_DEACTIVATED = "persona:deactivated",
  PERSONA_DISCOVERED = "persona:discovered",
  PERSONA_VALIDATION_FAILED = "persona:validation:failed",
  PERSONA_TOOLSET_CHANGED = "persona:toolset:changed",
}

/**
 * Persona cache configuration
 *
 * Configuration options for the persona caching system.
 */
export interface PersonaCacheConfig {
  /** Cache TTL in milliseconds (default: 5 minutes) */
  ttl?: number;

  /** Maximum number of personas to cache */
  maxSize?: number;

  /** Whether to enable cache statistics */
  enableStats?: boolean;
}

/**
 * Persona cache statistics
 *
 * Runtime statistics about the persona cache performance.
 */
export interface PersonaCacheStats {
  /** Total cache hits */
  hits: number;

  /** Total cache misses */
  misses: number;

  /** Current cache size */
  size: number;

  /** Cache hit rate (0-1) */
  hitRate: number;

  /** Memory usage in bytes */
  memoryUsage?: number;
}

/**
 * Discovery configuration options
 *
 * Configuration for how persona discovery should be performed.
 */
export interface PersonaDiscoveryConfig {
  /** Primary search paths (overrides standard locations if provided) */
  searchPaths?: string[];

  /** Additional search paths beyond standard locations */
  additionalPaths?: string[];

  /** Maximum depth for recursive directory scanning */
  maxDepth?: number;

  /** Whether to follow symbolic links */
  followSymlinks?: boolean;

  /** Patterns to ignore during scanning (glob patterns) */
  ignorePatterns?: string[];

  /** Whether to enable parallel scanning */
  parallelScan?: boolean;

  /** Whether to include archive files in discovery */
  includeArchives?: boolean;

  /** Whether to watch for file system changes */
  watchForChanges?: boolean;

  /** Whether to enable caching for discovery results */
  enableCache?: boolean;

  /** Maximum size for discovery cache */
  maxCacheSize?: number;

  /** Cache TTL in milliseconds */
  cacheTtl?: number;
}
