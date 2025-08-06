/**
 * Unified Configuration Manager for HyperTool MCP
 *
 * This module provides centralized configuration management for integrating
 * HyperTool with multiple MCP client applications.
 *
 * TODO: Full Profile Management System
 * - Implement profile creation, switching, and deletion
 * - Add profile-specific configuration storage
 * - Support workspace/project-specific profiles
 * - Add profile inheritance and merging
 * - Implement profile templates and presets
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
  AppMCPConfig,
} from "./types/index.js";
import { ServerConfig } from "../types/config.js";
import { AppRegistry } from "./apps/registry.js";
import { BackupManager } from "./backup/manager.js";
import { TransformerRegistry } from "./transformers/base.js";
import {
  EnvironmentManager,
  EnvironmentConfig,
} from "../config/environment.js";
import { ConfigMigration } from "./migration.js";
import {
  addMissingTypeFields,
  needsTypeMigration,
} from "./utils/type-migration.js";
import { createChildLogger } from "../utils/logging.js";
import { isNedbEnabledAsync } from "../config/environment.js";
import { MCPConfigParser } from "../config/mcpConfigParser.js";

const logger = createChildLogger({ module: "ConfigurationManager" });

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
    // Check if migration is needed first
    const migration = new ConfigMigration(this.basePath);
    if (await migration.needsMigration()) {
      logger.info(
        "Migrating from global mcp.json to per-app configurations..."
      );
      const migrationResult = await migration.migrate();
      if (!migrationResult.success) {
        logger.warn("Migration completed with errors", {
          errors: migrationResult.errors,
        });
      } else {
        logger.info("Migration completed successfully");
      }
    }
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

    // Import from each application and save to per-app configs
    const appConfigPaths: Record<string, string> = {};

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

          // Save app-specific config and track path
          const appConfigPath = await this.saveAppConfig(appId, result.config);
          appConfigPaths[appId] = appConfigPath;
        }
      } catch (error) {
        logger.warn(`Failed to import from ${appId}`, { appId, error });
        failed.push(appId);
      }
    }

    // Save merged configuration for backwards compatibility
    await this.saveMergedConfig(mergedServers);

    // Update main configuration with per-app config paths
    await this.updateMainConfig(imported, appConfigPaths);

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
      logger.warn(`Invalid configuration for ${appId}`, {
        appId,
        errors: validation.errors,
      });
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
      logger.warn(`Invalid configuration for ${appId}`, {
        appId,
        errors: validation.errors,
      });
      return null;
    }

    return { config: standardConfig, configPath };
  }

  /**
   * Save the merged MCP configuration to database or file based on feature flag
   */
  private async saveMergedConfig(config: MCPConfig): Promise<void> {
    if (!(await isNedbEnabledAsync())) {
      // File-based approach
      const configPath = join(this.basePath, "mcp.json");

      // Ensure the directory exists
      await this.fs.mkdir(this.basePath, { recursive: true });

      // Write the configuration file
      await this.fs.writeFile(
        configPath,
        JSON.stringify(config, null, 2),
        "utf-8"
      );

      logger.info(`Saved merged configuration to file: ${configPath}`);
      return;
    }

    // Database approach
    const { getDatabaseService } = await import("../db/nedbService.js");
    const dbService = getDatabaseService();
    await dbService.init();

    // Create or update global config source
    let globalSource = await dbService.configSources.findByPath("global");
    if (!globalSource) {
      globalSource = await dbService.configSources.add({
        type: "global",
        path: "global",
        priority: 100,
        lastSynced: Date.now(),
      });
    }

    // Save all servers to database with source reference
    for (const [serverName, serverConfig] of Object.entries(
      config.mcpServers
    )) {
      // Skip websocket servers as they're not supported yet
      if (serverConfig.type === "websocket") {
        logger.warn(
          `Skipping websocket server "${serverName}" - not supported`
        );
        continue;
      }

      const existingServer = await dbService.servers.findByName(serverName);

      if (!existingServer) {
        await dbService.servers.add({
          name: serverName,
          type: serverConfig.type as "stdio" | "http" | "sse",
          config: serverConfig as ServerConfig,
          lastModified: Date.now(),
          checksum: this.calculateChecksum(serverConfig as ServerConfig),
          sourceId: globalSource.id,
        });
      } else {
        await dbService.servers.update({
          ...existingServer,
          config: serverConfig as ServerConfig,
          type: serverConfig.type as "stdio" | "http" | "sse",
          lastModified: Date.now(),
          checksum: this.calculateChecksum(serverConfig as ServerConfig),
          sourceId: globalSource.id,
        });
      }
    }
  }

  /**
   * Calculate checksum for a server configuration
   */
  private calculateChecksum(config: ServerConfig): string {
    const crypto = require("crypto");
    const configString = JSON.stringify(config, Object.keys(config).sort());
    return crypto.createHash("sha256").update(configString).digest("hex");
  }

  /**
   * Save app-specific MCP configuration to database or file based on feature flag
   */
  private async saveAppConfig(
    appId: string,
    config: MCPConfig
  ): Promise<string> {
    if (!(await isNedbEnabledAsync())) {
      // File-based approach
      const mcpDir = join(this.basePath, "mcp");
      const configPath = join(mcpDir, `${appId}.json`);

      // Ensure the mcp directory exists
      await this.fs.mkdir(mcpDir, { recursive: true });

      // Add metadata
      const appConfig: AppMCPConfig = {
        ...config,
        _metadata: {
          app: appId,
          importedAt: new Date().toISOString(),
          lastModified: new Date().toISOString(),
          ...(config._metadata || {}),
        },
      };

      // Write the configuration file
      await this.fs.writeFile(
        configPath,
        JSON.stringify(appConfig, null, 2),
        "utf-8"
      );

      logger.info(`Saved app configuration to file: ${configPath}`);
      return configPath;
    }

    // Database approach
    const { getDatabaseService } = await import("../db/nedbService.js");
    const dbService = getDatabaseService();
    await dbService.init();

    // Create or update app config source
    const configPath = `app/${appId}`;
    let appSource = await dbService.configSources.findByPath(configPath);

    if (!appSource) {
      appSource = await dbService.configSources.add({
        type: "app",
        appId: appId,
        path: configPath,
        priority: 50,
        lastSynced: Date.now(),
      });
    } else {
      await dbService.configSources.update({
        ...appSource,
        lastSynced: Date.now(),
      });
    }

    // Save all servers to database with source reference
    for (const [serverName, serverConfig] of Object.entries(
      config.mcpServers
    )) {
      // Skip websocket servers as they're not supported yet
      if (serverConfig.type === "websocket") {
        logger.warn(
          `Skipping websocket server "${serverName}" - not supported`
        );
        continue;
      }

      const existingServer = await dbService.servers.findByName(serverName);

      if (!existingServer) {
        await dbService.servers.add({
          name: serverName,
          type: serverConfig.type as "stdio" | "http" | "sse",
          config: serverConfig as ServerConfig,
          lastModified: Date.now(),
          checksum: this.calculateChecksum(serverConfig as ServerConfig),
          sourceId: appSource.id,
        });
      } else {
        // Update only if this source has higher or equal priority
        const existingSource = existingServer.sourceId
          ? await dbService.configSources.findById(existingServer.sourceId)
          : null;

        if (!existingSource || appSource.priority >= existingSource.priority) {
          await dbService.servers.update({
            ...existingServer,
            config: serverConfig as ServerConfig,
            type: serverConfig.type as "stdio" | "http" | "sse",
            lastModified: Date.now(),
            checksum: this.calculateChecksum(serverConfig as ServerConfig),
            sourceId: appSource.id,
          });
        }
      }
    }

    return configPath;
  }

  /**
   * Update the main configuration in database
   */
  private async updateMainConfig(
    importedApps: string[],
    appConfigPaths: Record<string, string>
  ): Promise<void> {
    // This method is no longer needed as all config is stored in database
    // Keep it empty for backward compatibility
  }

  /**
   * Generate default toolsets for each application
   */
  private async generateDefaultToolsets(
    mergedConfig: MCPConfig
  ): Promise<void> {
    const prefsPath = join(this.basePath, "config.json");

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
  async linkApplications(
    appConfigs:
      | Array<{
          appId: string;
          appName?: string;
          configType: "global" | "per-app";
          perAppInit?: "empty" | "copy" | "import";
        }>
      | string[]
  ): Promise<{
    linked: string[];
    failed: string[];
  }> {
    const linked: string[] = [];
    const failed: string[] = [];

    // Get all enabled applications
    const apps = await this.registry.getEnabledApplications();

    // Handle legacy string array format for backward compatibility
    let configs: Array<{
      appId: string;
      configType: "global" | "per-app";
      perAppInit?: "empty" | "copy" | "import";
    }>;

    if (Array.isArray(appConfigs) && typeof appConfigs[0] === "string") {
      // Legacy format - convert to new format
      configs = (appConfigs as string[]).map((appId) => ({
        appId,
        configType: "global" as const,
      }));
    } else {
      configs = appConfigs as any;
    }

    for (const config of configs) {
      const { appId, configType, perAppInit } = config;

      if (!apps[appId]) {
        logger.warn(`Application ${appId} not found`, { appId });
        failed.push(appId);
        continue;
      }

      try {
        // Determine the config path based on user choice
        let configPath: string;

        if (configType === "global") {
          configPath = join(this.basePath, "mcp.json");
        } else {
          // Per-app config
          const appConfigPath = join(this.basePath, "mcp", `${appId}.json`);

          // Check if per-app config needs to be created
          let configExists = false;
          try {
            await fs.access(appConfigPath);
            configExists = true;
          } catch {
            configExists = false;
          }

          if (!configExists && perAppInit) {
            await this.initializePerAppConfig(appId, perAppInit);
          }

          configPath = appConfigPath;
        }

        await this.linkApplication(appId, apps[appId], configPath);
        linked.push(appId);
      } catch (error) {
        logger.warn(`Failed to link ${appId}`, { appId, error });
        failed.push(appId);
      }
    }

    return { linked, failed };
  }

  /**
   * Initialize per-app configuration
   */
  private async initializePerAppConfig(
    appId: string,
    initMethod: "empty" | "copy" | "import"
  ): Promise<void> {
    const appConfigPath = join(this.basePath, "mcp", `${appId}.json`);
    const mcpDir = join(this.basePath, "mcp");

    // Ensure mcp directory exists
    await fs.mkdir(mcpDir, { recursive: true });

    let config: any = {
      mcpServers: {},
      _metadata: {
        app: appId,
        createdAt: new Date().toISOString(),
        lastModified: new Date().toISOString(),
      },
    };

    switch (initMethod) {
      case "empty":
        // Already initialized with empty mcpServers
        break;

      case "copy":
        // Copy from global config
        try {
          const globalConfigPath = join(this.basePath, "mcp.json");
          const globalContent = await fs.readFile(globalConfigPath, "utf-8");
          const globalConfig = JSON.parse(globalContent);

          config.mcpServers = globalConfig.mcpServers || {};
          if (globalConfig._metadata) {
            config._metadata = {
              ...config._metadata,
              copiedFrom: "global",
              sources: globalConfig._metadata.sources,
            };
          }
        } catch (error) {
          logger.warn(
            "Failed to copy global config, using empty config instead"
          );
        }
        break;

      case "import":
        // Import from application's existing config
        const apps = await this.registry.getEnabledApplications();
        const app = apps[appId];
        if (app) {
          const appDef = app as any;
          const platformConfig = this.registry.getPlatformConfig(appDef);

          if (platformConfig) {
            const configPath = this.registry.resolvePath(
              platformConfig.configPath
            );

            try {
              await fs.access(configPath);
              const content = await fs.readFile(configPath, "utf-8");
              const appConfig = JSON.parse(content);

              // Import all servers except hypertool itself
              if (appConfig.mcpServers) {
                for (const [name, server] of Object.entries(
                  appConfig.mcpServers
                )) {
                  if (name !== "hypertool" && name !== "toolprint-hypertool") {
                    config.mcpServers[name] = server;
                  }
                }
              }

              config._metadata.importedFrom = configPath;
            } catch (error) {
              logger.warn(
                `Failed to import from ${appId} config, using empty config instead`,
                { appId }
              );
            }
          }
        }
        break;
    }

    // Write the per-app config
    await fs.writeFile(appConfigPath, JSON.stringify(config, null, 2), "utf-8");
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
        hypertool: {
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
        hypertool: {
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

    // Resolve configuration path
    let configPath = this.registry.resolvePath(platformConfig.configPath);

    // Handle project-local configurations
    if (app.detection.type === "project-local") {
      configPath = join(
        this.getCurrentWorkingDirectory(),
        platformConfig.configPath.replace("./", "")
      );
    }

    // Read existing configuration if it exists
    let existingConfig: any = null;
    try {
      const existingContent = await this.fs.readFile(configPath, "utf-8");
      existingConfig = JSON.parse(existingContent);
    } catch (error) {
      // File doesn't exist or is invalid, that's OK
    }

    // Transform to app-specific format
    const transformerName =
      platformConfig.format === "custom" && platformConfig.transformer
        ? platformConfig.transformer
        : platformConfig.format;
    const transformer = TransformerRegistry.getTransformer(transformerName);

    // For Claude Code, we need to merge servers to preserve existing ones
    let configToTransform = { mcpServers: hyperToolProxy };
    if (transformerName === "claude-code" && existingConfig) {
      const standardExisting = transformer.toStandard(existingConfig);
      configToTransform = {
        mcpServers: {
          ...standardExisting.mcpServers,
          ...hyperToolProxy,
        },
      };
    }

    const appSpecificConfig = transformer.fromStandard(
      configToTransform,
      existingConfig
    );

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
          logger.warn(`Failed to process ${appId}`, { appId, error });
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
          logger.warn(`Failed to unlink ${appId}`, { appId, error });
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
      const transformerName =
        platformConfig.format === "custom" && platformConfig.transformer
          ? platformConfig.transformer
          : platformConfig.format;
      const transformer = TransformerRegistry.getTransformer(transformerName);
      const standardConfig = transformer.toStandard(config);

      if (standardConfig.mcpServers && standardConfig.mcpServers["hypertool"]) {
        // Remove hypertool entry
        delete standardConfig.mcpServers["hypertool"];

        // Transform back to app format
        const updatedConfig = transformer.fromStandard(standardConfig, config);
        await this.fs.writeFile(
          configPath,
          JSON.stringify(updatedConfig, null, 2),
          "utf-8"
        );

        return true;
      }
    } catch (error) {
      // Config might not exist or be invalid
      logger.warn(`Could not check config for ${appId}`, { appId, error });
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

    try {
      const content = await this.fs.readFile(configPath, "utf-8");
      const config = JSON.parse(content);

      // Get transformer with correct name resolution
      const transformerName =
        platformConfig.format === "custom" && platformConfig.transformer
          ? platformConfig.transformer
          : platformConfig.format;
      const transformer = TransformerRegistry.getTransformer(transformerName);
      const standardConfig = transformer.toStandard(config);

      // Remove hypertool entry
      delete standardConfig.mcpServers["hypertool"];

      // Transform back to app format
      const updatedConfig = transformer.fromStandard(standardConfig, config);
      await this.fs.writeFile(
        configPath,
        JSON.stringify(updatedConfig, null, 2),
        "utf-8"
      );
    } catch (error) {
      // If config doesn't exist or is invalid, create empty one
      const transformerName =
        platformConfig.format === "custom" && platformConfig.transformer
          ? platformConfig.transformer
          : platformConfig.format;
      const transformer = TransformerRegistry.getTransformer(transformerName);
      const emptyConfig = transformer.fromStandard({ mcpServers: {} });

      await this.fs.writeFile(
        configPath,
        JSON.stringify(emptyConfig, null, 2),
        "utf-8"
      );
    }
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
