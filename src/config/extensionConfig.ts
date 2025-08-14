/**
 * Extension Configuration Management
 * Handles loading, saving, and validation of extension configurations
 */

import { readFile, writeFile, mkdir } from "fs/promises";
import { join, dirname } from "path";
import { homedir } from "os";
import { existsSync } from "fs";
import {
  HypertoolConfig,
  ExtensionConfig,
  ExtensionUserConfig,
} from "./dxt-config.js";
import { isDxtEnabledViaService } from "./featureFlagService.js";

/**
 * Default extension configuration
 */
const DEFAULT_EXTENSION_CONFIG: ExtensionConfig = {
  directory: join(homedir(), ".toolprint", "hypertool-mcp", "extensions"),
  autoDiscovery: true,
  settings: {},
};

/**
 * Extension configuration manager
 */
export class ExtensionConfigManager {
  private readonly configPath: string;
  private config: HypertoolConfig = {};

  constructor(configPath?: string) {
    const base =
      configPath ||
      join(homedir(), ".toolprint", "hypertool-mcp", "config.json");
    this.configPath = base;
  }

  /**
   * Load configuration from file
   */
  async load(): Promise<HypertoolConfig> {
    // If DXT is disabled, return empty config and skip file operations
    if (!(await isDxtEnabledViaService())) {
      this.config = {
        extensions: { directory: "", autoDiscovery: false, settings: {} },
      };
      return this.config;
    }

    try {
      if (existsSync(this.configPath)) {
        const content = await readFile(this.configPath, "utf-8");
        this.config = JSON.parse(content);
      } else {
        // Initialize with defaults
        this.config = {
          extensions: DEFAULT_EXTENSION_CONFIG,
        };
      }

      // Ensure extensions config exists
      if (!this.config.extensions) {
        this.config.extensions = DEFAULT_EXTENSION_CONFIG;
      }

      // Ensure required fields exist
      if (!this.config.extensions.settings) {
        this.config.extensions.settings = {};
      }

      if (this.config.extensions.autoDiscovery === undefined) {
        this.config.extensions.autoDiscovery = true;
      }

      if (!this.config.extensions.directory) {
        this.config.extensions.directory = DEFAULT_EXTENSION_CONFIG.directory;
      }

      return this.config;
    } catch (error) {
      console.error(
        `Failed to load extension config: ${(error as Error).message}`
      );
      return this.getDefaultConfig();
    }
  }

  /**
   * Save configuration to file
   */
  async save(config?: HypertoolConfig): Promise<void> {
    const configToSave = config || this.config;

    try {
      // Ensure directory exists
      await mkdir(dirname(this.configPath), { recursive: true });

      // Save with pretty formatting
      await writeFile(this.configPath, JSON.stringify(configToSave, null, 2));

      this.config = configToSave;
    } catch (error) {
      throw new Error(
        `Failed to save extension config: ${(error as Error).message}`
      );
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): HypertoolConfig {
    return { ...this.config };
  }

  /**
   * Get extension settings for a specific extension
   */
  getExtensionSettings(extensionName: string): ExtensionUserConfig | undefined {
    return this.config.extensions?.settings?.[extensionName];
  }

  /**
   * Set extension settings for a specific extension
   */
  async setExtensionSettings(
    extensionName: string,
    settings: ExtensionUserConfig
  ): Promise<void> {
    if (!this.config.extensions) {
      this.config.extensions = DEFAULT_EXTENSION_CONFIG;
    }

    if (!this.config.extensions.settings) {
      this.config.extensions.settings = {};
    }

    this.config.extensions.settings[extensionName] = settings;
    await this.save();
  }

  /**
   * Enable an extension
   */
  async enableExtension(extensionName: string): Promise<void> {
    const currentSettings = this.getExtensionSettings(extensionName);
    await this.setExtensionSettings(extensionName, {
      ...currentSettings,
      isEnabled: true,
    });
  }

  /**
   * Disable an extension
   */
  async disableExtension(extensionName: string): Promise<void> {
    const currentSettings = this.getExtensionSettings(extensionName);
    await this.setExtensionSettings(extensionName, {
      ...currentSettings,
      isEnabled: false,
    });
  }

  /**
   * Update user config for an extension
   */
  async updateExtensionUserConfig(
    extensionName: string,
    userConfig: Record<string, any>
  ): Promise<void> {
    const currentSettings = this.getExtensionSettings(extensionName) || {
      isEnabled: true,
    };
    await this.setExtensionSettings(extensionName, {
      ...currentSettings,
      userConfig,
    });
  }

  /**
   * Remove extension settings
   */
  async removeExtension(extensionName: string): Promise<void> {
    if (this.config.extensions?.settings) {
      delete this.config.extensions.settings[extensionName];
      await this.save();
    }
  }

  /**
   * Get all extension names
   */
  getExtensionNames(): string[] {
    return Object.keys(this.config.extensions?.settings || {});
  }

  /**
   * Check if auto-discovery is enabled
   */
  isAutoDiscoveryEnabled(): boolean {
    return this.config.extensions?.autoDiscovery ?? true;
  }

  /**
   * Set auto-discovery setting
   */
  async setAutoDiscovery(enabled: boolean): Promise<void> {
    if (!this.config.extensions) {
      this.config.extensions = DEFAULT_EXTENSION_CONFIG;
    }

    this.config.extensions.autoDiscovery = enabled;
    await this.save();
  }

  /**
   * Get extensions directory
   */
  getExtensionsDirectory(): string {
    return (
      this.config.extensions?.directory || DEFAULT_EXTENSION_CONFIG.directory!
    );
  }

  /**
   * Set extensions directory
   */
  async setExtensionsDirectory(directory: string): Promise<void> {
    if (!this.config.extensions) {
      this.config.extensions = DEFAULT_EXTENSION_CONFIG;
    }

    this.config.extensions.directory = directory;
    await this.save();
  }

  /**
   * Get default configuration
   */
  private getDefaultConfig(): HypertoolConfig {
    return {
      extensions: DEFAULT_EXTENSION_CONFIG,
    };
  }

  /**
   * Validate configuration structure
   */
  validateConfig(config: any): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (config.extensions) {
      const ext = config.extensions;

      if (ext.directory && typeof ext.directory !== "string") {
        errors.push("extensions.directory must be a string");
      }

      if (
        ext.autoDiscovery !== undefined &&
        typeof ext.autoDiscovery !== "boolean"
      ) {
        errors.push("extensions.autoDiscovery must be a boolean");
      }

      if (ext.settings) {
        if (typeof ext.settings !== "object" || Array.isArray(ext.settings)) {
          errors.push("extensions.settings must be an object");
        } else {
          for (const [name, settings] of Object.entries(ext.settings)) {
            if (typeof settings !== "object" || Array.isArray(settings)) {
              errors.push(`extensions.settings.${name} must be an object`);
              continue;
            }

            const s = settings as any;
            if (s.isEnabled !== undefined && typeof s.isEnabled !== "boolean") {
              errors.push(
                `extensions.settings.${name}.isEnabled must be a boolean`
              );
            }

            if (
              s.userConfig !== undefined &&
              (typeof s.userConfig !== "object" || Array.isArray(s.userConfig))
            ) {
              errors.push(
                `extensions.settings.${name}.userConfig must be an object`
              );
            }
          }
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Initialize configuration file if it doesn't exist
   */
  async initialize(): Promise<void> {
    if (!existsSync(this.configPath)) {
      await this.save(this.getDefaultConfig());
    }
  }
}
