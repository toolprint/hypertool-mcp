/**
 * Centralized feature flag service for consistent flag resolution
 * Priority: Environment variable > config.json > default (false)
 */

import { getFeatureFlags } from "./preferenceStore.js";
import {
  FeatureFlags,
  FlagName,
  getAllFlagDefinitions,
  getFlagEnvVar,
  getFlagDefaultValue,
} from "./flagRegistry.js";

// Remove logger to avoid circular dependency with logging system
// We'll use console for critical errors only
const logger = {
  debug: (message: string, ...args: any[]) => {
    if (process.env.DEBUG)
      console.debug(`[FeatureFlagService] ${message}`, ...args);
  },
  info: (message: string, ...args: any[]) => {
    if (process.env.DEBUG)
      console.info(`[FeatureFlagService] ${message}`, ...args);
  },
};

// FeatureFlags interface is now imported from flagRegistry.ts

/**
 * Service for managing and resolving feature flags from multiple sources
 */
export class FeatureFlagService {
  private static instance: FeatureFlagService;
  private cache: FeatureFlags = {};
  private initialized = false;

  private constructor() {}

  /**
   * Get singleton instance
   */
  static getInstance(): FeatureFlagService {
    if (!FeatureFlagService.instance) {
      FeatureFlagService.instance = new FeatureFlagService();
    }
    return FeatureFlagService.instance;
  }

  /**
   * Initialize feature flags from all sources
   * Must be called before using any feature flags
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    logger.debug("Initializing feature flags");

    // 1. Check environment variables (highest priority)
    const flagDefinitions = getAllFlagDefinitions();

    for (const [flagName, flagDef] of Object.entries(flagDefinitions)) {
      const envValue = process.env[flagDef.envVar];
      if (envValue !== undefined) {
        this.cache[flagName as FlagName] = ["true", "1", "yes", "on"].includes(
          envValue.toLowerCase()
        );
        logger.debug(
          `${flagDef.name} enabled from environment: ${this.cache[flagName as FlagName]}`
        );
      }
    }

    // 2. Check config.json if not set by environment
    const hasUndefinedFlags = Object.keys(flagDefinitions).some(
      (flagName) => this.cache[flagName as FlagName] === undefined
    );

    if (hasUndefinedFlags) {
      try {
        const configFlags = await getFeatureFlags();

        for (const [flagName, flagDef] of Object.entries(flagDefinitions)) {
          if (
            this.cache[flagName as FlagName] === undefined &&
            configFlags?.[flagName as FlagName] !== undefined
          ) {
            this.cache[flagName as FlagName] =
              configFlags[flagName as FlagName] === true;
            logger.debug(
              `${flagDef.name} enabled from config.json: ${this.cache[flagName as FlagName]}`
            );
          }
        }
      } catch (error) {
        logger.debug("Could not load feature flags from config.json:", error);
      }
    }

    // 3. Apply defaults for any unset flags
    for (const [flagName, flagDef] of Object.entries(flagDefinitions)) {
      if (this.cache[flagName as FlagName] === undefined) {
        this.cache[flagName as FlagName] = getFlagDefaultValue(
          flagName as FlagName
        );
        logger.debug(
          `${flagDef.name} set to default: ${this.cache[flagName as FlagName]}`
        );
      }
    }

    this.initialized = true;
    logger.info(`Feature flags initialized: ${JSON.stringify(this.cache)}`);
  }

  /**
   * Generic method to check if a flag is enabled
   * @throws Error if service not initialized
   */
  isFlagEnabled(flagName: FlagName): boolean {
    if (!this.initialized) {
      throw new Error(
        "FeatureFlagService not initialized. Call initialize() first."
      );
    }
    return this.cache[flagName] ?? getFlagDefaultValue(flagName);
  }

  /**
   * Check if MCP Logger is enabled
   * @throws Error if service not initialized
   */
  isMcpLoggerEnabled(): boolean {
    return this.isFlagEnabled("mcpLoggerEnabled");
  }

  /**
   * Check if Setup Wizard is enabled
   * @throws Error if service not initialized
   */
  isSetupWizardEnabled(): boolean {
    return this.isFlagEnabled("setupWizardEnabled");
  }

  /**
   * Check if DXT is enabled
   * @throws Error if service not initialized
   */
  isDxtEnabled(): boolean {
    return this.isFlagEnabled("dxtEnabled");
  }

  /**
   * Get all feature flags
   * @throws Error if service not initialized
   */
  getAllFlags(): FeatureFlags {
    if (!this.initialized) {
      throw new Error(
        "FeatureFlagService not initialized. Call initialize() first."
      );
    }
    return { ...this.cache };
  }

  /**
   * Reset the service (mainly for testing)
   */
  reset(): void {
    this.cache = {};
    this.initialized = false;
  }

  /**
   * Force set a feature flag (mainly for testing)
   * Note: This bypasses normal resolution and should only be used in tests
   */
  forceSet(flagName: FlagName, value: boolean): void {
    this.cache[flagName] = value;
    this.initialized = true;
  }
}

/**
 * Convenience function to get the singleton instance
 */
export function getFeatureFlagService(): FeatureFlagService {
  return FeatureFlagService.getInstance();
}

/**
 * Convenience function to check if MCP Logger is enabled
 * Ensures the service is initialized before checking
 */
export async function isMcpLoggerEnabledViaService(): Promise<boolean> {
  const service = getFeatureFlagService();
  await service.initialize();
  return service.isMcpLoggerEnabled();
}

/**
 * Convenience function to check if Setup Wizard is enabled
 * Ensures the service is initialized before checking
 */
export async function isSetupWizardEnabledViaService(): Promise<boolean> {
  const service = getFeatureFlagService();
  await service.initialize();
  return service.isSetupWizardEnabled();
}

/**
 * Convenience function to check if DXT is enabled
 * Ensures the service is initialized before checking
 */
export async function isDxtEnabledViaService(): Promise<boolean> {
  const service = getFeatureFlagService();
  await service.initialize();
  return service.isDxtEnabled();
}
