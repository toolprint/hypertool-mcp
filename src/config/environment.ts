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
