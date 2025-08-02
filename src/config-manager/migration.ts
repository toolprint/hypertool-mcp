/**
 * Migration utilities for transitioning from global to per-app configurations
 */

import { promises as fs } from "fs";
import { join } from "path";
import { MCPConfig, AppMCPConfig } from "./types/index.js";
import { createChildLogger } from "../utils/logging.js";

const logger = createChildLogger({ module: "config-manager/migration" });

export interface MigrationResult {
  success: boolean;
  migratedApps: string[];
  errors: string[];
  backupPath?: string;
}

export class ConfigMigration {
  private basePath: string;

  constructor(basePath: string) {
    this.basePath = basePath;
  }

  /**
   * Check if migration is needed
   */
  async needsMigration(): Promise<boolean> {
    try {
      // Check if global mcp.json exists
      const globalConfigPath = join(this.basePath, "mcp.json");
      await fs.access(globalConfigPath);

      // Check if mcp directory exists
      const mcpDirPath = join(this.basePath, "mcp");
      try {
        await fs.access(mcpDirPath);
        // If both exist, check if mcp dir has any configs
        const files = await fs.readdir(mcpDirPath);
        const hasAppConfigs = files.some((f) => f.endsWith(".json"));
        return !hasAppConfigs; // Need migration if no app configs exist
      } catch {
        // mcp directory doesn't exist, need migration
        return true;
      }
    } catch {
      // No global config, no migration needed
      return false;
    }
  }

  /**
   * Migrate from global mcp.json to per-app configs
   */
  async migrate(): Promise<MigrationResult> {
    const result: MigrationResult = {
      success: false,
      migratedApps: [],
      errors: [],
    };

    try {
      // Load global config
      const globalConfigPath = join(this.basePath, "mcp.json");
      const globalConfigContent = await fs.readFile(globalConfigPath, "utf-8");
      const globalConfig: MCPConfig = JSON.parse(globalConfigContent);

      // Create backup
      const backupPath = await this.createBackup(globalConfigPath);
      result.backupPath = backupPath;

      // Ensure mcp directory exists
      const mcpDir = join(this.basePath, "mcp");
      await fs.mkdir(mcpDir, { recursive: true });

      // Check if metadata exists to determine app ownership
      if (globalConfig._metadata?.sources) {
        // Group servers by source application
        const serversByApp = this.groupServersByApp(globalConfig);

        // Create per-app configs
        for (const [appId, servers] of Object.entries(serversByApp)) {
          try {
            await this.saveAppConfig(appId, servers);
            result.migratedApps.push(appId);
            logger.info(
              `Migrated ${Object.keys(servers).length} servers for ${appId}`
            );
          } catch (error) {
            const errorMsg = `Failed to migrate ${appId}: ${error}`;
            result.errors.push(errorMsg);
            logger.error(errorMsg);
          }
        }
      } else {
        // No metadata - create a default mapping
        await this.createDefaultMapping(globalConfig);
        result.migratedApps.push("default");
        logger.info("Created default app configuration (no metadata found)");
      }

      // Archive the global config
      await this.archiveGlobalConfig(globalConfigPath);

      result.success = result.errors.length === 0;
      logger.info(
        `Migration completed. Apps: ${result.migratedApps.join(", ")}`
      );
    } catch (error) {
      result.errors.push(`Migration failed: ${error}`);
      logger.error("Migration failed", error);
    }

    return result;
  }

  /**
   * Group servers by source application
   */
  private groupServersByApp(config: MCPConfig): Record<string, MCPConfig> {
    const serversByApp: Record<string, MCPConfig> = {};

    for (const [serverName, serverConfig] of Object.entries(
      config.mcpServers
    )) {
      const source = config._metadata?.sources?.[serverName];
      const appId = source?.app || "unknown";

      if (!serversByApp[appId]) {
        serversByApp[appId] = { mcpServers: {} };
      }

      serversByApp[appId].mcpServers[serverName] = serverConfig;
    }

    return serversByApp;
  }

  /**
   * Save app-specific configuration
   */
  private async saveAppConfig(appId: string, config: MCPConfig): Promise<void> {
    const configPath = join(this.basePath, "mcp", `${appId}.json`);

    const appConfig: AppMCPConfig = {
      ...config,
      _metadata: {
        app: appId,
        importedAt: new Date().toISOString(),
        lastModified: new Date().toISOString(),
      },
    };

    await fs.writeFile(configPath, JSON.stringify(appConfig, null, 2), "utf-8");
  }

  /**
   * Create default mapping when no metadata exists
   */
  private async createDefaultMapping(config: MCPConfig): Promise<void> {
    // Check common patterns to guess app ownership
    const appConfigs: Record<string, MCPConfig> = {};

    for (const [serverName, serverConfig] of Object.entries(
      config.mcpServers
    )) {
      // Try to guess based on common patterns
      let appId = "default";

      // You could add heuristics here to guess app ownership
      // For now, put everything in a default config

      if (!appConfigs[appId]) {
        appConfigs[appId] = { mcpServers: {} };
      }
      appConfigs[appId].mcpServers[serverName] = serverConfig;
    }

    // Save all app configs
    for (const [appId, appConfig] of Object.entries(appConfigs)) {
      await this.saveAppConfig(appId, appConfig);
    }
  }

  /**
   * Create backup of global config
   */
  private async createBackup(configPath: string): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupPath = `${configPath}.backup-${timestamp}`;
    await fs.copyFile(configPath, backupPath);
    return backupPath;
  }

  /**
   * Archive the global config (rename it)
   */
  private async archiveGlobalConfig(configPath: string): Promise<void> {
    const archivePath = `${configPath}.migrated`;
    await fs.rename(configPath, archivePath);
    logger.info(`Archived global config to ${archivePath}`);
  }
}
