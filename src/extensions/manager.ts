/**
 * Extension Manager
 * Orchestrates extension discovery, configuration, validation, and runtime management
 */

import { ExtensionDiscoveryService } from "./discovery.js";
import { ExtensionValidationService } from "./validation.js";
import { ExtensionConfigManager } from "../config/extensionConfig.js";
import {
  ExtensionRuntimeConfig,
  HypertoolConfig,
  ExtensionUserConfig,
  ValidationResult,
  DxtManifest,
} from "../config/dxt-config.js";

/**
 * Extension manager coordinates all extension operations
 */
export class ExtensionManager {
  private discoveryService: ExtensionDiscoveryService;
  private readonly validationService: ExtensionValidationService;
  private readonly configManager: ExtensionConfigManager;
  private runtimeConfigs: ExtensionRuntimeConfig[] = [];
  private initialized = false;

  constructor(configPath?: string, extensionsBaseDir?: string) {
    this.discoveryService = new ExtensionDiscoveryService(extensionsBaseDir);
    this.validationService = new ExtensionValidationService();
    this.configManager = new ExtensionConfigManager(configPath);
  }

  /**
   * Initialize the extension system
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    await this.discoveryService.initialize();
    await this.configManager.initialize();
    await this.loadExtensions();

    this.initialized = true;
  }

  /**
   * Load and validate all extensions
   */
  async loadExtensions(): Promise<ExtensionRuntimeConfig[]> {
    const config = await this.configManager.load();
    this.runtimeConfigs =
      await this.discoveryService.loadExtensionConfigs(config);

    // Log validation results
    this.runtimeConfigs.forEach((ext) => {
      const summary = this.validationService.getValidationSummary(
        ext.name,
        ext.validationResult
      );

      if (ext.validationResult.isValid) {
        if (ext.validationResult.warnings.length > 0) {
          console.warn(`[WARN] ${summary}`);
        } else {
          console.log(`[INFO] ${summary}`);
        }
      } else {
        console.warn(
          `[WARN] Extension '${ext.name}' disabled: ${ext.validationResult.errors.join(", ")}`
        );
      }
    });

    return this.runtimeConfigs;
  }

  /**
   * Get all runtime configurations
   */
  getRuntimeConfigs(): ExtensionRuntimeConfig[] {
    return [...this.runtimeConfigs];
  }

  /**
   * Get enabled runtime configurations only
   */
  getEnabledConfigs(): ExtensionRuntimeConfig[] {
    return this.runtimeConfigs.filter((config) => config.enabled);
  }

  /**
   * Get runtime configuration for a specific extension
   */
  getExtensionConfig(name: string): ExtensionRuntimeConfig | undefined {
    return this.runtimeConfigs.find((config) => config.name === name);
  }

  /**
   * Enable an extension
   */
  async enableExtension(name: string): Promise<void> {
    await this.configManager.enableExtension(name);
    await this.loadExtensions(); // Reload to update runtime configs
  }

  /**
   * Disable an extension
   */
  async disableExtension(name: string): Promise<void> {
    await this.configManager.disableExtension(name);
    await this.loadExtensions(); // Reload to update runtime configs
  }

  /**
   * Update extension user configuration
   */
  async updateExtensionUserConfig(
    name: string,
    userConfig: Record<string, any>
  ): Promise<ValidationResult> {
    // Get current extension to validate against its manifest
    const currentExt = this.getExtensionConfig(name);
    if (!currentExt) {
      throw new Error(`Extension '${name}' not found`);
    }

    // Validate the new configuration
    const tempUserSettings: ExtensionUserConfig = {
      isEnabled: true,
      userConfig,
    };

    const validationResult = this.validationService.validateExtensionConfig(
      currentExt.manifest,
      tempUserSettings
    );

    if (validationResult.isValid) {
      // Save the configuration
      await this.configManager.updateExtensionUserConfig(name, userConfig);
      await this.loadExtensions(); // Reload to update runtime configs
    }

    return validationResult;
  }

  /**
   * Install a new extension from DXT file
   */
  async installExtension(
    dxtPath: string
  ): Promise<{ success: boolean; message: string; name?: string }> {
    try {
      const metadata = await this.discoveryService.unpackExtension(dxtPath);

      // Reload extensions to include the new one
      await this.loadExtensions();

      return {
        success: true,
        message: `Extension '${metadata.name}' installed successfully`,
        name: metadata.name,
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to install extension: ${(error as Error).message}`,
      };
    }
  }

  /**
   * Refresh all extensions (re-unpack if needed)
   */
  async refreshExtensions(): Promise<void> {
    // Force refresh by clearing metadata and reloading
    const dxtFiles = await this.discoveryService.discoverExtensions();

    for (const dxtPath of dxtFiles) {
      const needsUpdate = await this.discoveryService.needsUnpacking(dxtPath);
      if (needsUpdate) {
        await this.discoveryService.unpackExtension(dxtPath);
      }
    }

    await this.loadExtensions();
  }

  /**
   * Get validation report for an extension
   */
  getValidationReport(name: string): string | undefined {
    const ext = this.getExtensionConfig(name);
    if (!ext) {
      return undefined;
    }

    const userSettings = this.configManager.getExtensionSettings(name);
    return this.validationService.createValidationReport(
      name,
      ext.manifest,
      userSettings,
      ext.validationResult
    );
  }

  /**
   * Get configuration suggestions for fixing validation errors
   */
  getConfigSuggestions(name: string): string[] {
    const ext = this.getExtensionConfig(name);
    if (!ext || ext.validationResult.isValid) {
      return [];
    }

    return this.validationService.suggestFixes(
      name,
      ext.manifest,
      ext.validationResult
    );
  }

  /**
   * List all extensions with their status
   */
  listExtensions(): Array<{
    name: string;
    enabled: boolean;
    valid: boolean;
    version: string;
    description?: string;
    errors: string[];
    warnings: string[];
  }> {
    return this.runtimeConfigs.map((ext) => ({
      name: ext.name,
      enabled: ext.enabled,
      valid: ext.validationResult.isValid,
      version: ext.manifest.version,
      description: ext.manifest.description,
      errors: ext.validationResult.errors,
      warnings: ext.validationResult.warnings,
    }));
  }

  /**
   * Get extension directory path
   */
  getExtensionsDirectory(): string {
    return this.configManager.getExtensionsDirectory();
  }

  /**
   * Set extension directory and refresh
   */
  async setExtensionsDirectory(directory: string): Promise<void> {
    await this.configManager.setExtensionsDirectory(directory);

    // Update discovery service and reload
    this.discoveryService = new ExtensionDiscoveryService(directory);
    await this.discoveryService.initialize();
    await this.loadExtensions();
  }

  /**
   * Check if auto-discovery is enabled
   */
  isAutoDiscoveryEnabled(): boolean {
    return this.configManager.isAutoDiscoveryEnabled();
  }

  /**
   * Enable/disable auto-discovery
   */
  async setAutoDiscovery(enabled: boolean): Promise<void> {
    await this.configManager.setAutoDiscovery(enabled);
    if (enabled) {
      await this.loadExtensions(); // Reload if enabling
    }
  }

  /**
   * Remove an extension
   */
  async removeExtension(name: string): Promise<void> {
    await this.configManager.removeExtension(name);
    await this.loadExtensions(); // Reload to update runtime configs
  }

  /**
   * Get extension metadata
   */
  getExtensionMetadata(name: string) {
    return this.discoveryService.getExtensionMetadata(name);
  }

  /**
   * Get all extension metadata
   */
  getAllMetadata() {
    return this.discoveryService.getAllMetadata();
  }

  /**
   * Create a server configuration that can be used with the connection factory
   * This replaces the old DXT server type approach
   */
  createServerConfigForExtension(name: string): any {
    const ext = this.getExtensionConfig(name);
    if (!ext || !ext.enabled) {
      throw new Error(`Extension '${name}' not found or not enabled`);
    }

    // Return a stdio server config that uses the extension's server configuration
    return {
      type: "stdio" as const,
      command: ext.serverConfig.command,
      args: ext.serverConfig.args,
      env: ext.serverConfig.env,
      cwd: ext.serverConfig.cwd,
    };
  }

  /**
   * Get all enabled extensions as server configs for connection factory
   */
  getEnabledExtensionsAsServerConfigs(): Record<string, any> {
    const configs: Record<string, any> = {};

    for (const ext of this.getEnabledConfigs()) {
      configs[ext.name] = this.createServerConfigForExtension(ext.name);
    }

    return configs;
  }
}
