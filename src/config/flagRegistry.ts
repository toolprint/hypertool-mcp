/**
 * Central Feature Flag Registry
 * Single source of truth for all feature flags, their metadata, and default values
 */

/**
 * Flag definition interface
 */
export interface FlagDefinition {
  readonly name: string;
  readonly description: string;
  readonly defaultValue: boolean;
  readonly envVar: string;
}

/**
 * Central registry of all feature flags
 * Add new flags here to automatically integrate them with CLI and service
 */
export const FLAG_REGISTRY = {
  mcpLoggerEnabled: {
    name: "mcpLoggerEnabled",
    description: "Use experimental mcp-logger instead of default Pino logging",
    defaultValue: false,
    envVar: "HYPERTOOL_MCP_LOGGER_ENABLED",
  },
  setupWizardEnabled: {
    name: "setupWizardEnabled",
    description:
      "Enable interactive setup wizard on first run (default: disabled)",
    defaultValue: false,
    envVar: "HYPERTOOL_SETUP_WIZARD_ENABLED",
  },
  dxtEnabled: {
    name: "dxtEnabled",
    description: "Enable DXT extension system and management commands",
    defaultValue: false,
    envVar: "HYPERTOOL_DXT_ENABLED",
  },
} as const satisfies Record<string, FlagDefinition>;

/**
 * Type-safe flag names derived from registry
 */
export type FlagName = keyof typeof FLAG_REGISTRY;

/**
 * Feature flags interface generated from registry
 */
export type FeatureFlags = {
  [K in FlagName]?: boolean;
};

/**
 * Get all flag definitions
 */
export function getAllFlagDefinitions(): Record<FlagName, FlagDefinition> {
  return FLAG_REGISTRY;
}

/**
 * Get a specific flag definition
 */
export function getFlagDefinition(flagName: FlagName): FlagDefinition {
  return FLAG_REGISTRY[flagName];
}

/**
 * Check if a flag name is valid
 */
export function isValidFlagName(flagName: string): flagName is FlagName {
  return flagName in FLAG_REGISTRY;
}

/**
 * Get all flag names
 */
export function getFlagNames(): FlagName[] {
  return Object.keys(FLAG_REGISTRY) as FlagName[];
}

/**
 * Get environment variable name for a flag
 */
export function getFlagEnvVar(flagName: FlagName): string {
  return FLAG_REGISTRY[flagName].envVar;
}

/**
 * Get default value for a flag
 */
export function getFlagDefaultValue(flagName: FlagName): boolean {
  return FLAG_REGISTRY[flagName].defaultValue;
}
