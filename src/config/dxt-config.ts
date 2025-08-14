/**
 * DXT Extension Configuration Types
 * Enhanced: Full Claude Desktop-compatible manifest schema with user_config support
 */

// DxtServerConfig removed - no longer treating DXT as a server "type"
// Extensions are managed separately via the extension management system

/**
 * User configuration parameter definition in manifest
 */
export interface UserConfigParam {
  type: "string" | "number" | "boolean" | "directory" | "file";
  title?: string;
  description?: string;
  required?: boolean;
  default?: any;
  multiple?: boolean;
  min?: number;
  max?: number;
}

/**
 * Server configuration within manifest
 */
export interface ManifestServerConfig {
  type: "node" | "python" | "executable";
  entry_point?: string;
  mcp_config: {
    command: string;
    args?: string[];
    env?: Record<string, string>;
  };
}

/**
 * Enhanced DXT manifest schema - Claude Desktop compatible
 */
export interface DxtManifest {
  dxt_version: string;
  name: string;
  version: string;
  description?: string;
  author?: string;
  license?: string;
  repository?: string;
  server: ManifestServerConfig;
  user_config?: Record<string, UserConfigParam>;
  // Legacy support for backwards compatibility
  main?: string;
}

/**
 * User settings for an extension
 */
export interface ExtensionUserConfig {
  isEnabled: boolean;
  userConfig?: Record<string, any>;
}

/**
 * Extension configuration in the user's config.json
 */
export interface ExtensionConfig {
  directory?: string;
  autoDiscovery?: boolean;
  settings: Record<string, ExtensionUserConfig>;
}

/**
 * Main hypertool configuration structure
 */
export interface HypertoolConfig {
  extensions?: ExtensionConfig;
  // Other config sections...
}

/**
 * Extension metadata for persistence tracking
 */
export interface ExtensionMetadata {
  name: string;
  version: string;
  sourceFile: string;
  sourceModified: number;
  installedPath: string;
  installedAt: number;
  lastValidated?: number;
  isValid?: boolean;
  validationErrors?: string[];
}

/**
 * Validation result for extension configuration
 */
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Extension runtime configuration after validation and template substitution
 */
export interface ExtensionRuntimeConfig {
  name: string;
  enabled: boolean;
  manifest: DxtManifest;
  installedPath: string;
  serverConfig: {
    command: string;
    args: string[];
    env: Record<string, string>;
    cwd: string;
  };
  validationResult: ValidationResult;
}
