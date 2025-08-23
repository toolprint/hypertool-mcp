/**
 * Persona Content Pack System
 *
 * This module provides a complete system for managing tool configurations
 * through YAML-based personas. Personas allow users to quickly switch between
 * different development contexts and tool configurations.
 *
 * @fileoverview Main entry point for the persona system
 * @module persona
 */

// Core types and interfaces
export type {
  PersonaToolset,
  PersonaConfig,
  PersonaAssets,
  LoadedPersona,
  PersonaDiscoveryResult,
  PersonaReference,
  ValidationResult,
  PersonaValidationErrorInfo,
  ActivationResult,
  PersonaErrorInterface,
  PersonaCacheConfig,
  PersonaCacheStats,
  PersonaDiscoveryConfig,
} from "./types.js";

// Enums
export { PersonaErrorCode, PersonaEvents } from "./types.js";

// Error classes and utilities
export {
  PersonaError,
  PersonaDiscoveryError,
  PersonaValidationError,
  PersonaActivationError,
  PersonaRuntimeError,
  // Factory functions
  createPersonaNotFoundError,
  createSchemaValidationError,
  createYamlParseError,
  createToolResolutionError,
  createToolsetNotFoundError,
  createPermissionError,
  createFileSystemError,
  createMcpConfigConflictError,
  createDuplicatePersonaNameError,
  createActivationFailedError,
  createArchiveExtractionError,
  // Utility functions
  isPersonaError,
  isRecoverableError,
  getErrorCode,
  formatErrorForUser,
  createErrorSummary,
} from "./errors.js";

// Schema validation
export {
  PersonaNameSchema,
  ToolIdSchema,
  PersonaToolsetSchema,
  PersonaMetadataSchema,
  PersonaConfigSchema,
  type PersonaConfigData,
  type PersonaToolsetData,
  type PersonaMetadataData,
  type SchemaValidationResult,
  type SchemaValidationError,
  validatePersonaConfig,
  validatePersonaToolsets,
  createValidationErrorSummary,
  SUPPORTED_PERSONA_FILES,
  isSupportedPersonaFile,
  extractPersonaNameFromPath,
} from "./schemas.js";

// File system scanner
export {
  scanForPersonas,
  scanDirectory,
  isPersonaDirectory,
  isPersonaArchive,
  getStandardSearchPaths,
  validateSearchPath,
  hasPersonasInPaths,
} from "./scanner.js";

// YAML Parser
export {
  parsePersonaYAML,
  parsePersonaYAMLFile,
  parseMultiplePersonaFiles,
  parseResultToValidationResult,
  isPersonaConfigFile,
  getSupportedPersonaFiles,
  isValidYAMLSyntax,
  extractPersonaNameFromYAML,
  type ParseResult,
  type YAMLError,
  type ParseOptions,
} from "./parser.js";

// Persona Discovery Engine
export {
  PersonaDiscovery,
  defaultPersonaDiscovery,
  discoverPersonas,
  refreshPersonaDiscovery,
  hasAvailablePersonas,
  getDiscoveryCacheStats,
  clearDiscoveryCache,
} from "./discovery.js";

// Persona Validator
export {
  PersonaValidator,
  createPersonaValidator,
  validatePersona,
  validateMultiplePersonas,
  type ValidationContext,
  type ValidationOptions,
} from "./validator.js";

// Persona Loader
export {
  PersonaLoader,
  createPersonaLoader,
  loadPersona,
  loadMultiplePersonas,
  discoverAndLoadAllPersonas,
  defaultPersonaLoader,
  type PersonaLoadOptions,
  type AssetCatalogOptions,
  type PersonaLoadResult,
  type BatchLoadResult,
} from "./loader.js";

// Persona Cache System
export {
  PersonaCache,
  createPersonaCache,
  defaultPersonaCache,
  PersonaCacheFactory,
  EvictionReason,
  CacheEvents,
  type CacheMetrics,
} from "./cache.js";

// Persona Manager
export {
  PersonaManager,
  createPersonaManager,
  defaultPersonaManager,
  type PersonaManagerConfig,
  type ActivePersonaState,
  type PersonaListOptions,
  type PersonaActivationOptions,
} from "./manager.js";

// Toolset Bridge Integration
export {
  PersonaToolsetBridge,
  createPersonaToolsetBridge,
  convertPersonaToolset,
  type ToolsetConversionResult,
  type BridgeOptions,
} from "./toolset-bridge.js";

// Future exports (will be added as implementation progresses):
// export { PersonaMCPIntegration } from "./mcp-integration.js";

/**
 * Version information for the persona system
 */
export const PERSONA_SYSTEM_VERSION = "1.0.0";

/**
 * Default configuration values
 */
export const PERSONA_DEFAULTS = {
  /** Default cache TTL in milliseconds (5 minutes) */
  CACHE_TTL: 5 * 60 * 1000,

  /** Default maximum cache size */
  MAX_CACHE_SIZE: 100,

  /** Default maximum directory scan depth */
  MAX_SCAN_DEPTH: 3,

  /** Standard persona search paths */
  STANDARD_SEARCH_PATHS: [
    "~/.toolprint/hypertool-mcp/personas",
    "./personas",
    ".",
  ],

  /** Supported persona file names */
  SUPPORTED_CONFIG_FILES: ["persona.yaml", "persona.yml"],

  /** Supported archive extensions */
  SUPPORTED_ARCHIVE_EXTENSIONS: [".htp"],

  /** Default ignore patterns for discovery */
  DEFAULT_IGNORE_PATTERNS: [
    "**/node_modules/**",
    "**/.git/**",
    "**/dist/**",
    "**/build/**",
    "**/.DS_Store",
    "**/Thumbs.db",
  ],
} as const;
