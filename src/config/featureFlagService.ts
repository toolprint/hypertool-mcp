/**
 * Centralized feature flag service for consistent flag resolution
 * Priority: Environment variable > config.json > default (false)
 */

import { getFeatureFlags } from "./preferenceStore.js";

// Remove logger to avoid circular dependency with logging system
// We'll use console for critical errors only
const logger = {
  debug: (message: string, ...args: any[]) => {
    if (process.env.DEBUG) console.debug(`[FeatureFlagService] ${message}`, ...args);
  },
  info: (message: string, ...args: any[]) => {
    if (process.env.DEBUG) console.info(`[FeatureFlagService] ${message}`, ...args);
  }
};

export interface FeatureFlags {
  nedbEnabled?: boolean;
  mcpLoggerEnabled?: boolean;
  // Future feature flags can be added here
}

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
    const envNedb = process.env.HYPERTOOL_NEDB_ENABLED;
    if (envNedb !== undefined) {
      this.cache.nedbEnabled = ["true", "1", "yes", "on"].includes(
        envNedb.toLowerCase()
      );
      logger.debug(`NeDB enabled from environment: ${this.cache.nedbEnabled}`);
    }

    const envMcpLogger = process.env.HYPERTOOL_MCP_LOGGER_ENABLED;
    if (envMcpLogger !== undefined) {
      this.cache.mcpLoggerEnabled = ["true", "1", "yes", "on"].includes(
        envMcpLogger.toLowerCase()
      );
      logger.debug(`MCP Logger enabled from environment: ${this.cache.mcpLoggerEnabled}`);
    }

    // 2. Check config.json if not set by environment
    if (this.cache.nedbEnabled === undefined || this.cache.mcpLoggerEnabled === undefined) {
      try {
        const configFlags = await getFeatureFlags();
        if (this.cache.nedbEnabled === undefined && configFlags?.nedbEnabled !== undefined) {
          this.cache.nedbEnabled = configFlags.nedbEnabled === true;
          logger.debug(`NeDB enabled from config.json: ${this.cache.nedbEnabled}`);
        }
        if (this.cache.mcpLoggerEnabled === undefined && configFlags?.mcpLoggerEnabled !== undefined) {
          this.cache.mcpLoggerEnabled = configFlags.mcpLoggerEnabled === true;
          logger.debug(`MCP Logger enabled from config.json: ${this.cache.mcpLoggerEnabled}`);
        }
      } catch (error) {
        logger.debug("Could not load feature flags from config.json:", error);
      }
    }

    // 3. Apply defaults for any unset flags
    if (this.cache.nedbEnabled === undefined) {
      this.cache.nedbEnabled = false;
      logger.debug("NeDB enabled set to default: false");
    }

    if (this.cache.mcpLoggerEnabled === undefined) {
      this.cache.mcpLoggerEnabled = false; // Default to Pino implementation
      logger.debug("MCP Logger enabled set to default: false");
    }

    this.initialized = true;
    logger.info(`Feature flags initialized: ${JSON.stringify(this.cache)}`);
  }

  /**
   * Check if NeDB is enabled
   * @throws Error if service not initialized
   */
  isNedbEnabled(): boolean {
    if (!this.initialized) {
      throw new Error(
        "FeatureFlagService not initialized. Call initialize() first."
      );
    }
    return this.cache.nedbEnabled ?? false;
  }

  /**
   * Check if MCP Logger is enabled
   * @throws Error if service not initialized
   */
  isMcpLoggerEnabled(): boolean {
    if (!this.initialized) {
      throw new Error(
        "FeatureFlagService not initialized. Call initialize() first."
      );
    }
    return this.cache.mcpLoggerEnabled ?? false;
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
  forceSet(flagName: keyof FeatureFlags, value: boolean): void {
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
 * Convenience function to check if NeDB is enabled
 * Ensures the service is initialized before checking
 */
export async function isNedbEnabledViaService(): Promise<boolean> {
  const service = getFeatureFlagService();
  await service.initialize();
  return service.isNedbEnabled();
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