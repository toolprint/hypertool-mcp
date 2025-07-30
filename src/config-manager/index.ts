/**
 * Unified Configuration Manager for HyperTool MCP
 *
 * This module provides centralized configuration management for integrating
 * HyperTool with multiple MCP client applications.
 */

import { promises as fs } from "fs";
import { vol } from "memfs";
import { isTestMode } from "../config/environment.js";
import { join } from "path";
import {
  MCPConfig,
  MainConfig,
  PreferencesConfig,
  ApplicationDefinition,
  Toolset,
} from "./types/index.js";
import { AppRegistry } from "./apps/registry.js";
import { BackupManager } from "./backup/manager.js";
import { TransformerRegistry } from "./transformers/base.js";
import {
  EnvironmentManager,
  EnvironmentConfig,
} from "../config/environment.js";

export class ConfigurationManager {
  private basePath: string;
  private registry: AppRegistry;
  private backupManager: BackupManager;
  private fs: typeof fs;

  /**
   * Get current working directory (for testing support)
   */
  private getCurrentWorkingDirectory(): string {
    // In test mode, use test base path as working directory to avoid contamination
    if (isTestMode()) {
      return this.basePath;
    }
    return process.cwd();
  }

  constructor(basePath?: string) {
    // If no basePath provided, check environment manager
    if (!basePath) {
      const envConfig = EnvironmentManager.getInstance().getConfig();
      basePath = envConfig.configRoot;
    }

    this.basePath = basePath;
    this.registry = new AppRegistry(basePath);
    this.backupManager = new BackupManager(basePath);

    // Use memfs in test mode, real fs in production
    this.fs = isTestMode() ? (vol.promises as any as typeof fs) : fs;
  }

  /**
   * Create a ConfigurationManager from environment config
   */
  static fromEnvironment(envConfig?: EnvironmentConfig): ConfigurationManager {
    const config = envConfig || EnvironmentManager.getInstance().getConfig();
    return new ConfigurationManager(config.configRoot);
  }

  /**
   * Initialize the configuration manager and directory structure
   */
  async initialize(): Promise<void> {
    // Create directory structure
    const dirs = [
      this.basePath,
      join(this.basePath, "apps"),
      join(this.basePath, "apps/transformers"),
      join(this.basePath, "backups"),
      join(this.basePath, "cache"),
    ];

    for (const dir of dirs) {
      await this.fs.mkdir(dir, { recursive: true });
    }

    // Initialize registry (will create default if not exists)
    await this.registry.load();
  }

  /**
   * Discover and import configurations from all enabled applications
   */
  async discoverAndImport(): Promise<{
    imported: string[];
    importedDetails: Array<{ appId: string; configPath: string }>;
    failed: string[];
    backup: string;
  }> {
    // Create backup first
    const backupResult = await this.backupManager.createBackup();
    const backupPath = backupResult.success
      ? backupResult.backupPath || ""
      : "";

    const imported: string[] = [];
    const importedDetails: Array<{ appId: string; configPath: string }> = [];
    const failed: string[] = [];
    const mergedServers: MCPConfig = { mcpServers: {} };

    // Get all enabled applications
    const apps = await this.registry.getEnabledApplications();

    // Import from each application
    for (const [appId, app] of Object.entries(apps)) {
      try {
        const result = await this.importFromApplicationWithPath(appId, app);
        if (result && result.config) {
          // Merge servers with metadata
          for (const [serverName, serverConfig] of Object.entries(
            result.config.mcpServers
          )) {
            mergedServers.mcpServers[serverName] = serverConfig;

            // Add metadata
            if (!mergedServers._metadata) {
              mergedServers._metadata = { sources: {} };
            }
            if (!mergedServers._metadata.sources) {
              mergedServers._metadata.sources = {};
            }

            mergedServers._metadata.sources[serverName] = {
              app: appId,
              importedAt: new Date().toISOString(),
            };
          }

          imported.push(appId);
          importedDetails.push({ appId, configPath: result.configPath });
        }
      } catch (error) {
        console.warn(`Failed to import from ${appId}:`, error);
        failed.push(appId);
      }
    }

    // Save merged configuration
    await this.saveMergedConfig(mergedServers);

    // Update main configuration
    await this.updateMainConfig(imported);

    // Generate default toolsets
    await this.generateDefaultToolsets(mergedServers);

    return {
      imported,
      importedDetails,
      failed,
      backup: backupPath,
    };
  }

  /**
   * Import configuration from a specific application
   */
  private async importFromApplication(
    appId: string,
    app: ApplicationDefinition
  ): Promise<MCPConfig | null> {
    // Check if application is installed
    if (!(await this.registry.isApplicationInstalled(app))) {
      return null;
    }

    // Get platform-specific config
    const platformConfig = this.registry.getPlatformConfig(app);
    if (!platformConfig) {
      return null;
    }

    // Resolve configuration path
    let configPath = this.registry.resolvePath(platformConfig.configPath);

    // Handle project-local configurations
    if (app.detection.type === "project-local") {
      configPath = join(
        this.getCurrentWorkingDirectory(),
        platformConfig.configPath.replace("./", "")
      );
    }

    // Check if config exists
    try {
      await this.fs.access(configPath);
    } catch {
      return null;
    }

    // Read configuration
    const content = await this.fs.readFile(configPath, "utf-8");
    const appConfig = JSON.parse(content);

    // Transform to standard format
    const transformerName =
      platformConfig.format === "custom" && platformConfig.transformer
        ? platformConfig.transformer
        : platformConfig.format;
    const transformer = TransformerRegistry.getTransformer(transformerName);
    const standardConfig = transformer.toStandard(appConfig);

    // Validate configuration
    const validation = transformer.validate(appConfig);
    if (!validation.valid) {
      console.warn(`Invalid configuration for ${appId}:`, validation.errors);
      return null;
    }

    return standardConfig;
  }

  /**
   * Import configuration from a specific application with path information
   */
  private async importFromApplicationWithPath(
    appId: string,
    app: ApplicationDefinition
  ): Promise<{ config: MCPConfig | null; configPath: string } | null> {
    // Check if application is installed
    if (!(await this.registry.isApplicationInstalled(app))) {
      return null;
    }

    // Get platform-specific config
    const platformConfig = this.registry.getPlatformConfig(app);
    if (!platformConfig) {
      return null;
    }

    // Resolve configuration path
    let configPath = this.registry.resolvePath(platformConfig.configPath);

    // Handle project-local configurations
    if (app.detection.type === "project-local") {
      configPath = join(
        this.getCurrentWorkingDirectory(),
        platformConfig.configPath.replace("./", "")
      );
    }

    // Check if config exists
    try {
      await this.fs.access(configPath);
    } catch {
      return null;
    }

    // Read configuration
    const content = await this.fs.readFile(configPath, "utf-8");
    const appConfig = JSON.parse(content);

    // Transform to standard format
    const transformerName =
      platformConfig.format === "custom" && platformConfig.transformer
        ? platformConfig.transformer
        : platformConfig.format;
    const transformer = TransformerRegistry.getTransformer(transformerName);
    const standardConfig = transformer.toStandard(appConfig);

    // Validate configuration
    const validation = transformer.validate(appConfig);
    if (!validation.valid) {
      console.warn(`Invalid configuration for ${appId}:`, validation.errors);
      return null;
    }

    return { config: standardConfig, configPath };
  }

  /**
   * Save the merged MCP configuration
   */
  private async saveMergedConfig(config: MCPConfig): Promise<void> {
    const configPath = join(this.basePath, "mcp.json");
    await this.fs.writeFile(
      configPath,
      JSON.stringify(config, null, 2),
      "utf-8"
    );
  }

  /**
   * Update the main configuration file with imported apps
   */
  private async updateMainConfig(importedApps: string[]): Promise<void> {
    const configPath = join(this.basePath, "config.json");

    let config: MainConfig;
    try {
      const content = await this.fs.readFile(configPath, "utf-8");
      config = JSON.parse(content);
    } catch {
      config = {
        version: "1.0.0",
        applications: {},
      };
    }

    // Update last backup timestamp
    config.lastBackup = new Date().toISOString();

    // Update application entries
    for (const appId of importedApps) {
      const app = await this.registry.getApplication(appId);
      if (!app) continue;

      const platformConfig = this.registry.getPlatformConfig(app);
      if (!platformConfig) continue;

      config.applications[appId] = {
        configPath: this.registry.resolvePath(platformConfig.configPath),
        lastSync: new Date().toISOString(),
        format: platformConfig.format,
      };
    }

    // Save updated config
    await this.fs.writeFile(
      configPath,
      JSON.stringify(config, null, 2),
      "utf-8"
    );
  }

  /**
   * Generate default toolsets for each application
   */
  private async generateDefaultToolsets(mergedConfig: MCPConfig): Promise<void> {
    const prefsPath = join(this.basePath, 'config.json');
    
    let prefs: PreferencesConfig;
    try {
      const content = await this.fs.readFile(prefsPath, "utf-8");
      prefs = JSON.parse(content);
      
      // Ensure toolsets property exists (for consolidated config structure)
      if (!prefs.toolsets) {
        prefs.toolsets = {};
      }
      
      // Ensure appDefaults property exists
      if (!prefs.appDefaults) {
        prefs.appDefaults = {};
      }
    } catch {
      prefs = {
        toolsets: {},
        appDefaults: {},
      };
    }

    // Group servers by source application
    const serversByApp: Record<string, string[]> = {};

    if (mergedConfig._metadata?.sources) {
      for (const [serverName, source] of Object.entries(
        mergedConfig._metadata.sources
      )) {
        if (!serversByApp[source.app]) {
          serversByApp[source.app] = [];
        }
        serversByApp[source.app].push(serverName);
      }
    }

    // Create toolset for each app
    for (const [appId] of Object.entries(serversByApp)) {
      const toolsetId = `${appId}-default`;

      // Skip if toolset already exists and is not auto-generated
      if (
        prefs.toolsets[toolsetId] &&
        !prefs.toolsets[toolsetId].metadata?.autoGenerated
      ) {
        continue;
      }

      const app = await this.registry.getApplication(appId);
      if (!app) continue;

      // Create toolset with all tools from app's servers
      const toolset: Toolset = {
        name: `${app.name} Default`,
        description: `Auto-imported from ${app.name}`,
        tools: [], // This would be populated by tool discovery
        metadata: {
          autoGenerated: true,
          sourceApp: appId,
          createdAt: new Date().toISOString(),
        },
      };

      prefs.toolsets[toolsetId] = toolset;

      // Set as default for the app
      if (!prefs.appDefaults) {
        prefs.appDefaults = {};
      }
      prefs.appDefaults[appId] = toolsetId;
    }

    // Save preferences
    await this.fs.writeFile(prefsPath, JSON.stringify(prefs, null, 2), "utf-8");
  }

  /**
   * Link HyperTool configuration to specified applications
   */
  async linkApplications(appIds?: string[]): Promise<{
    linked: string[];
    failed: string[];
  }> {
    const linked: string[] = [];
    const failed: string[] = [];

    // Get merged configuration path
    const mergedConfigPath = join(this.basePath, "mcp.json");

    // Get all enabled applications
    const apps = await this.registry.getEnabledApplications();

    // If no specific apps requested, link all
    const targetApps = appIds || Object.keys(apps);

    for (const appId of targetApps) {
      if (!apps[appId]) {
        console.warn(`Application ${appId} not found`);
        failed.push(appId);
        continue;
      }

      try {
        await this.linkApplication(appId, apps[appId], mergedConfigPath);
        linked.push(appId);
      } catch (error) {
        console.warn(`Failed to link ${appId}:`, error);
        failed.push(appId);
      }
    }

    return { linked, failed };
  }

  /**
   * Link HyperTool configuration to a specific application
   */
  private async linkApplication(
    appId: string,
    app: ApplicationDefinition,
    hyperToolConfigPath: string
  ): Promise<void> {
    // Get platform-specific config
    const platformConfig = this.registry.getPlatformConfig(app);
    if (!platformConfig) {
      throw new Error(`No platform configuration for ${appId}`);
    }

    // Check if we're in development mode
    const isDevelopmentMode = await this.isInDevelopmentMode();

    // Create HyperTool proxy configuration
    let hyperToolProxy: any;

    if (isDevelopmentMode) {
      // Use local development build
      const localBinPath = join(process.cwd(), "dist", "bin.js");
      hyperToolProxy = {
        "toolprint-hypertool": {
          type: "stdio" as const,
          command: "node",
          args: [
            localBinPath,
            "mcp",
            "run",
            "--mcp-config",
            hyperToolConfigPath,
            "--debug",
          ],
        },
      };
    } else {
      // Use published NPM package
      hyperToolProxy = {
        "toolprint-hypertool": {
          type: "stdio" as const,
          command: "npx",
          args: [
            "-y",
            "@toolprint/hypertool-mcp@latest",
            "--mcp-config",
            hyperToolConfigPath,
          ],
        },
      };
    }

    // Transform to app-specific format
    const transformer = TransformerRegistry.getTransformer(
      platformConfig.format
    );
    const appSpecificConfig = transformer.fromStandard({
      mcpServers: hyperToolProxy,
    });

    // Resolve configuration path
    let configPath = this.registry.resolvePath(platformConfig.configPath);

    // Handle project-local configurations
    if (app.detection.type === "project-local") {
      configPath = join(
        this.getCurrentWorkingDirectory(),
        platformConfig.configPath.replace("./", "")
      );
    }

    // Ensure directory exists
    const dir = join(configPath, "..");
    await this.fs.mkdir(dir, { recursive: true });

    // Write configuration
    await this.fs.writeFile(
      configPath,
      JSON.stringify(appSpecificConfig, null, 2),
      "utf-8"
    );
  }

  /**
   * Create a backup of all current configurations
   */
  async createBackup() {
    return this.backupManager.createBackup();
  }

  /**
   * List available backups
   */
  async listBackups() {
    return this.backupManager.listBackups();
  }

  /**
   * Get a specific backup by ID
   */
  async getBackup(backupId: string) {
    return this.backupManager.getBackup(backupId);
  }

  /**
   * Restore from a specific backup
   */
  async restoreBackup(backupId: string, options?: { applications?: string[] }) {
    return this.backupManager.restoreBackup(backupId, options);
  }

  /**
   * Delete a backup by ID
   */
  async deleteBackup(backupId: string) {
    return this.backupManager.deleteBackup(backupId);
  }

  /**
   * Unlink HyperTool from specified applications
   */
  async unlinkApplications(
    appIds: string[],
    options?: {
      restore?: boolean;
      backupId?: string;
    }
  ): Promise<{
    unlinked: string[];
    failed: string[];
    restoredWithHypertool?: string[];
  }> {
    const unlinked: string[] = [];
    const failed: string[] = [];
    const restoredWithHypertool: string[] = [];

    if (options?.restore && options?.backupId) {
      // First restore from backup
      await this.restoreBackup(options.backupId, { applications: appIds });

      // Check each restored app for hypertool entries
      for (const appId of appIds) {
        try {
          const hasHypertool = await this.checkAndRemoveHypertoolFromApp(appId);
          if (hasHypertool) {
            restoredWithHypertool.push(appId);
          }
          unlinked.push(appId);
        } catch (error) {
          console.warn(`Failed to process ${appId}:`, error);
          failed.push(appId);
        }
      }
    } else {
      // Just remove hypertool without restoration
      for (const appId of appIds) {
        try {
          await this.removeHypertoolFromApp(appId);
          unlinked.push(appId);
        } catch (error) {
          console.warn(`Failed to unlink ${appId}:`, error);
          failed.push(appId);
        }
      }
    }

    return { unlinked, failed, restoredWithHypertool };
  }

  /**
   * Check if app config has hypertool and remove it while preserving other servers
   */
  private async checkAndRemoveHypertoolFromApp(
    appId: string
  ): Promise<boolean> {
    const app = await this.registry.getApplication(appId);
    if (!app) {
      throw new Error(`Application ${appId} not found`);
    }

    const platformConfig = this.registry.getPlatformConfig(app);
    if (!platformConfig) {
      return false;
    }

    const configPath = this.registry.resolvePath(platformConfig.configPath);

    try {
      const content = await this.fs.readFile(configPath, "utf-8");
      const config = JSON.parse(content);

      // Check if config has hypertool
      const transformer = TransformerRegistry.getTransformer(
        platformConfig.format
      );
      const standardConfig = transformer.toStandard(config);

      if (
        standardConfig.mcpServers &&
        standardConfig.mcpServers["toolprint-hypertool"]
      ) {
        // Remove hypertool entry
        delete standardConfig.mcpServers["toolprint-hypertool"];

        // Write back the config without hypertool
        const updatedConfig = transformer.fromStandard(standardConfig);
        await this.fs.writeFile(
          configPath,
          JSON.stringify(updatedConfig, null, 2),
          "utf-8"
        );

        return true;
      }
    } catch (error) {
      // Config might not exist or be invalid
      console.warn(`Could not check config for ${appId}:`, error);
    }

    return false;
  }

  /**
   * Remove HyperTool from a specific application without restoration
   */
  private async removeHypertoolFromApp(appId: string): Promise<void> {
    const app = await this.registry.getApplication(appId);
    if (!app) {
      throw new Error(`Application ${appId} not found`);
    }

    const platformConfig = this.registry.getPlatformConfig(app);
    if (!platformConfig) {
      return;
    }

    const configPath = this.registry.resolvePath(platformConfig.configPath);

    // Write empty config or remove the file
    const transformer = TransformerRegistry.getTransformer(
      platformConfig.format
    );
    const emptyConfig = transformer.fromStandard({ mcpServers: {} });

    await this.fs.writeFile(
      configPath,
      JSON.stringify(emptyConfig, null, 2),
      "utf-8"
    );
  }

  /**
   * Check if we're running in development mode
   */
  private async isInDevelopmentMode(): Promise<boolean> {
    try {
      // Check if we're in the hypertool-mcp project directory
      const packageJsonPath = join(process.cwd(), "package.json");
      const content = await this.fs.readFile(packageJsonPath, "utf-8");
      const packageJson = JSON.parse(content);

      // Check if this is the hypertool-mcp package
      if (packageJson.name === "@toolprint/hypertool-mcp") {
        // Also check if dist/bin.js exists (built)
        const binPath = join(process.cwd(), "dist", "bin.js");
        try {
          await this.fs.access(binPath);
          return true;
        } catch {
          // Not built yet
          return false;
        }
      }
    } catch {
      // Not in a package directory or can't read package.json
    }

    return false;
  }
}

// Export types and classes
export * from "./types/index.js";
export { AppRegistry } from "./apps/registry.js";
export { BackupManager } from "./backup/manager.js";
export {
  TransformerRegistry,
  StandardTransformer,
} from "./transformers/base.js";
