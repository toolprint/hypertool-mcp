/**
 * Environment configuration for HyperTool MCP
 * Supports production and test modes with configurable paths
 */

import { join } from "path";
import { homedir } from "os";

/**
 * Environment mode enumeration
 */
export enum EnvironmentMode {
  PRODUCTION = "production",
  TEST = "test",
}

/**
 * Environment configuration interface
 */
export interface EnvironmentConfig {
  mode: EnvironmentMode;
  configRoot: string;
  registryPath?: string;
  backupPath?: string;
  cachePath?: string;
  nedbEnabled?: boolean;
}

/**
 * Environment configuration manager
 */
export class EnvironmentManager {
  private static instance: EnvironmentManager;
  private config: EnvironmentConfig;

  private constructor() {
    // Default to production mode
    this.config = this.createProductionConfig();
    // Load any environment overrides
    this.loadFromEnv();
  }

  /**
   * Get singleton instance
   */
  static getInstance(): EnvironmentManager {
    if (!EnvironmentManager.instance) {
      EnvironmentManager.instance = new EnvironmentManager();
    }
    return EnvironmentManager.instance;
  }

  /**
   * Create production configuration
   */
  private createProductionConfig(): EnvironmentConfig {
    const configRoot = join(homedir(), ".toolprint/hypertool-mcp");
    return {
      mode: EnvironmentMode.PRODUCTION,
      configRoot,
      registryPath: join(configRoot, "apps/registry.json"),
      backupPath: join(configRoot, "backups"),
      cachePath: join(configRoot, "cache"),
      // nedbEnabled is undefined by default - only set when environment variable is provided
    };
  }

  /**
   * Create test configuration
   */
  private createTestConfig(baseDir: string): EnvironmentConfig {
    const configRoot = join(baseDir, ".toolprint/hypertool-mcp");
    return {
      mode: EnvironmentMode.TEST,
      configRoot,
      registryPath: join(configRoot, "apps/registry.json"),
      backupPath: join(configRoot, "backups"),
      cachePath: join(configRoot, "cache"),
      // nedbEnabled is undefined by default - only set when environment variable is provided
    };
  }

  /**
   * Get current configuration
   */
  getConfig(): EnvironmentConfig {
    return { ...this.config };
  }

  /**
   * Set environment mode
   */
  setMode(mode: EnvironmentMode, testBaseDir?: string): void {
    if (mode === EnvironmentMode.TEST) {
      if (!testBaseDir) {
        throw new Error("Test base directory must be provided for test mode");
      }
      this.config = this.createTestConfig(testBaseDir);
    } else {
      this.config = this.createProductionConfig();
    }
  }

  /**
   * Override specific configuration values
   */
  override(overrides: Partial<EnvironmentConfig>): void {
    this.config = {
      ...this.config,
      ...overrides,
    };
  }

  /**
   * Check if running in test mode
   */
  isTestMode(): boolean {
    return this.config.mode === EnvironmentMode.TEST;
  }

  /**
   * Check if running in production mode
   */
  isProductionMode(): boolean {
    return this.config.mode === EnvironmentMode.PRODUCTION;
  }

  /**
   * Load configuration from environment variables
   */
  loadFromEnv(): void {
    const mode = process.env.HYPERTOOL_ENV as EnvironmentMode;
    const configRoot = process.env.HYPERTOOL_CONFIG_ROOT;
    const nedbEnabled = process.env.HYPERTOOL_NEDB_ENABLED;

    if (mode === EnvironmentMode.TEST || mode === EnvironmentMode.PRODUCTION) {
      this.config.mode = mode;
    }

    if (configRoot) {
      this.config.configRoot = configRoot;
      // Update derived paths
      this.config.registryPath = join(configRoot, "apps/registry.json");
      this.config.backupPath = join(configRoot, "backups");
      this.config.cachePath = join(configRoot, "cache");
    }

    // Check for NeDB feature flag
    if (nedbEnabled !== undefined) {
      // Accept various truthy values
      this.config.nedbEnabled = ["true", "1", "yes", "on"].includes(
        nedbEnabled.toLowerCase()
      );
    }
  }

  /**
   * Reset to default configuration
   */
  reset(): void {
    this.config = this.createProductionConfig();
  }
}

/**
 * Convenience function to get environment config
 */
export function getEnvironmentConfig(): EnvironmentConfig {
  return EnvironmentManager.getInstance().getConfig();
}

/**
 * Convenience function to check if in test mode
 */
export function isTestMode(): boolean {
  return EnvironmentManager.getInstance().isTestMode();
}

/**
 * Load feature flags from config.json
 */
async function loadFeatureFlagsFromConfig(): Promise<Record<string, boolean> | undefined> {
  try {
    // Dynamic import to avoid circular dependencies
    const { getFeatureFlags } = await import("./preferenceStore.js");
    return await getFeatureFlags();
  } catch (error) {
    // If we can't load from config file, return undefined
    return undefined;
  }
}


/**
 * Async version of isNedbEnabled that checks config.json as fallback
 * Priority: Environment variable > config.json > default (false)
 * 
 * @deprecated Use FeatureFlagService.isNedbEnabled() for better feature flag management
 */
export async function isNedbEnabledAsync(): Promise<boolean> {
  const config = EnvironmentManager.getInstance().getConfig();
  
  // Environment variable takes highest precedence
  if (config.nedbEnabled !== undefined) {
    return config.nedbEnabled === true;
  }
  
  // Check config.json as fallback
  try {
    const configFlags = await loadFeatureFlagsFromConfig();
    if (configFlags?.nedbEnabled !== undefined) {
      return configFlags.nedbEnabled === true;
    }
  } catch (error) {
    // If config.json can't be loaded, continue with default
  }
  
  // Default to false if neither source provides a value
  return false;
}
