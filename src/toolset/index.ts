/**
 * Toolset configuration system
 *
 * This module provides a complete toolset configuration system that allows users
 * to specify which tools to expose from each MCP server with support for:
 * - JSON-based configuration with validation
 * - Wildcard and regex patterns for tool selection
 * - Conflict resolution strategies
 * - Default configuration generation
 */

// Export types
export * from "./types";

// Export validator functions
export { validateToolsetConfig, matchesToolPattern } from "./validator";

// Export loader functions
export {
  loadToolsetConfig,
  saveToolsetConfig,
  loadToolsetConfigs,
  fileExists,
  getDefaultConfigPath,
  createExampleConfig,
} from "./loader";

// Export filtering functions
export {
  applyToolsetConfig,
  getAvailableToolsForConfig,
  previewToolsetConfig,
} from "./filter";

// Export generator functions
export {
  generateDefaultToolsetConfig,
  generateMinimalToolsetConfig,
  generateUseCaseToolsetConfig,
  generateConflictAwareToolsetConfig,
} from "./generator";

/**
 * Main toolset manager class
 */
import { DiscoveredTool } from "../discovery/types";
import { ToolsetConfig, ToolsetResolution, ValidationResult } from "./types";
import { loadToolsetConfig, saveToolsetConfig } from "./loader";
import { validateToolsetConfig } from "./validator";
import { applyToolsetConfig } from "./filter";
import { generateDefaultToolsetConfig } from "./generator";

export class ToolsetManager {
  private currentConfig?: ToolsetConfig;
  private configPath?: string;

  /**
   * Load toolset configuration from file
   */
  async loadConfig(
    filePath: string
  ): Promise<{
    success: boolean;
    validation: ValidationResult;
    error?: string;
  }> {
    const result = await loadToolsetConfig(filePath);

    if (result.config && result.validation.valid) {
      this.currentConfig = result.config;
      this.configPath = filePath;
    }

    return {
      success: result.validation.valid,
      validation: result.validation,
      error: result.error,
    };
  }

  /**
   * Save current configuration to file
   */
  async saveConfig(
    filePath?: string
  ): Promise<{ success: boolean; error?: string }> {
    if (!this.currentConfig) {
      return { success: false, error: "No configuration loaded" };
    }

    const targetPath = filePath || this.configPath;
    if (!targetPath) {
      return { success: false, error: "No file path specified" };
    }

    const result = await saveToolsetConfig(this.currentConfig, targetPath, {
      createDir: true,
      pretty: true,
    });
    if (result.success) {
      this.configPath = targetPath;
    }

    return result;
  }

  /**
   * Generate and set default configuration
   */
  generateDefaultConfig(
    discoveredTools: DiscoveredTool[],
    options?: { name?: string; description?: string }
  ): ToolsetConfig {
    this.currentConfig = generateDefaultToolsetConfig(discoveredTools, options);
    return this.currentConfig;
  }

  /**
   * Set configuration directly
   */
  setConfig(config: ToolsetConfig): ValidationResult {
    const validation = validateToolsetConfig(config);
    if (validation.valid) {
      this.currentConfig = config;
    }
    return validation;
  }

  /**
   * Get current configuration
   */
  getConfig(): ToolsetConfig | undefined {
    return this.currentConfig;
  }

  /**
   * Apply current configuration to discovered tools
   */
  async applyConfig(
    discoveredTools: DiscoveredTool[]
  ): Promise<ToolsetResolution> {
    if (!this.currentConfig) {
      return {
        success: false,
        tools: [],
        errors: ["No configuration loaded"],
      };
    }

    return applyToolsetConfig(discoveredTools, this.currentConfig);
  }

  /**
   * Validate current configuration
   */
  validateConfig(): ValidationResult {
    if (!this.currentConfig) {
      return {
        valid: false,
        errors: ["No configuration loaded"],
        warnings: [],
      };
    }

    return validateToolsetConfig(this.currentConfig);
  }

  /**
   * Check if configuration is loaded
   */
  isConfigLoaded(): boolean {
    return this.currentConfig !== undefined;
  }

  /**
   * Get configuration file path
   */
  getConfigPath(): string | undefined {
    return this.configPath;
  }

  /**
   * Clear current configuration
   */
  clearConfig(): void {
    this.currentConfig = undefined;
    this.configPath = undefined;
  }
}
