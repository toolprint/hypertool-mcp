/**
 * File-based implementation of ServerConfigRecord repository
 * Stores server configurations in mcp.json and /mcp/*.json files
 */

import { promises as fs } from "fs";
import * as path from "path";
import { createHash } from "crypto";
import {
  ServerConfigRecord,
  IServerConfigRecordRepository,
} from "../interfaces.js";
import { ServerConfig } from "../../types/config.js";
import { MCPConfigParser } from "../../config/mcpConfigParser.js";
import { createChildLogger } from "../../utils/logging.js";
import { getHomeDir } from "../../utils/paths.js";

const logger = createChildLogger({
  module: "FileServerConfigRecordRepository",
});

/**
 * File-based server configuration record repository
 * Uses existing mcp.json file structure
 */
export class FileServerConfigRecordRepository
  implements IServerConfigRecordRepository
{
  private basePath: string;
  private globalConfigPath: string;
  private perAppConfigDir: string;
  private parser: MCPConfigParser;

  constructor(basePath?: string) {
    this.basePath = basePath || path.join(getHomeDir(), ".toolprint/hypertool-mcp");
    this.globalConfigPath = path.join(this.basePath, "mcp.json");
    this.perAppConfigDir = path.join(this.basePath, "mcp");
    this.parser = new MCPConfigParser({ validatePaths: false });
  }

  /**
   * Initialize the repository (ensure directories exist)
   */
  async init(): Promise<void> {
    await fs.mkdir(this.basePath, { recursive: true });
    await fs.mkdir(this.perAppConfigDir, { recursive: true });
  }

  /**
   * Generate a stable ID for a server based on its location and name
   */
  private generateServerId(source: string, serverName: string): string {
    return `${source}:${serverName}`;
  }

  /**
   * Calculate checksum for a server config
   */
  private calculateChecksum(config: ServerConfig): string {
    const hash = createHash("sha256");
    hash.update(JSON.stringify(config));
    return hash.digest("hex");
  }

  /**
   * Parse source from server ID
   */
  private parseServerId(id: string): { source: string; name: string } {
    const parts = id.split(":");
    if (parts.length < 2) {
      throw new Error(`Invalid server ID format: ${id}`);
    }
    const source = parts[0];
    const name = parts.slice(1).join(":"); // Handle names with colons
    return { source, name };
  }

  /**
   * Load all server configurations from all sources
   */
  private async loadAllServers(): Promise<ServerConfigRecord[]> {
    const servers: ServerConfigRecord[] = [];

    // Load global config
    try {
      const globalConfig = await this.loadConfigFile(this.globalConfigPath);
      if (globalConfig?.mcpServers) {
        for (const [name, config] of Object.entries(globalConfig.mcpServers)) {
          const serverConfig = config as ServerConfig;
          servers.push({
            id: this.generateServerId("global", name),
            name,
            type: serverConfig.type,
            config: serverConfig,
            lastModified: Date.now(),
            checksum: this.calculateChecksum(serverConfig),
            sourceId: "global",
          });
        }
      }
    } catch (error) {
      if ((error as any).code !== "ENOENT") {
        logger.error("Failed to load global config:", error);
      }
    }

    // Load per-app configs
    try {
      const appFiles = await fs.readdir(this.perAppConfigDir);
      for (const file of appFiles) {
        if (file.endsWith(".json")) {
          const appId = file.replace(".json", "");
          const configPath = path.join(this.perAppConfigDir, file);
          try {
            const appConfig = await this.loadConfigFile(configPath);
            if (appConfig?.mcpServers) {
              for (const [name, config] of Object.entries(appConfig.mcpServers)) {
                const serverConfig = config as ServerConfig;
                servers.push({
                  id: this.generateServerId(`app:${appId}`, name),
                  name,
                  type: serverConfig.type,
                  config: serverConfig,
                  lastModified: Date.now(),
                  checksum: this.calculateChecksum(serverConfig),
                  sourceId: `app:${appId}`,
                });
              }
            }
          } catch (error) {
            logger.error(`Failed to load app config ${appId}:`, error);
          }
        }
      }
    } catch (error) {
      if ((error as any).code !== "ENOENT") {
        logger.error("Failed to read app config directory:", error);
      }
    }

    return servers;
  }

  /**
   * Load a config file
   */
  private async loadConfigFile(filePath: string): Promise<any> {
    const content = await fs.readFile(filePath, "utf-8");
    const result = this.parser.parseContent(content, path.dirname(filePath));
    if (!result.success) {
      throw new Error(
        `Failed to parse config: ${result.error || result.validationErrors?.join(", ")}`
      );
    }
    return result.config;
  }

  /**
   * Save a config file
   */
  private async saveConfigFile(filePath: string, config: any): Promise<void> {
    await fs.writeFile(filePath, JSON.stringify(config, null, 2), "utf-8");
  }

  /**
   * Add a new server configuration record
   */
  async add(
    server: Omit<ServerConfigRecord, "id">
  ): Promise<ServerConfigRecord> {
    // Determine target file based on sourceId
    const sourceId = server.sourceId || "global";
    let configPath: string;
    let configKey: string;

    if (sourceId === "global") {
      configPath = this.globalConfigPath;
      configKey = "global";
    } else if (sourceId.startsWith("app:")) {
      const appId = sourceId.substring(4);
      configPath = path.join(this.perAppConfigDir, `${appId}.json`);
      configKey = `app:${appId}`;
    } else {
      throw new Error(`Invalid sourceId: ${sourceId}`);
    }

    // Load existing config or create new
    let config: any = { mcpServers: {} };
    try {
      config = await this.loadConfigFile(configPath);
      if (!config.mcpServers) {
        config.mcpServers = {};
      }
    } catch (error) {
      if ((error as any).code !== "ENOENT") {
        throw error;
      }
    }

    // Check if server name already exists
    if (config.mcpServers[server.name]) {
      throw new Error(
        `Server "${server.name}" already exists in ${sourceId} configuration`
      );
    }

    // Add the server
    config.mcpServers[server.name] = server.config;

    // Save the config
    await this.saveConfigFile(configPath, config);

    // Return the created record
    const record: ServerConfigRecord = {
      ...server,
      id: this.generateServerId(configKey, server.name),
      lastModified: Date.now(),
      checksum: this.calculateChecksum(server.config),
    };

    return record;
  }

  /**
   * Update an existing server configuration record
   */
  async update(server: ServerConfigRecord): Promise<ServerConfigRecord | null> {
    const { source, name } = this.parseServerId(server.id);

    // Determine config file path
    let configPath: string;
    if (source === "global") {
      configPath = this.globalConfigPath;
    } else if (source.startsWith("app:")) {
      const appId = source.substring(4);
      configPath = path.join(this.perAppConfigDir, `${appId}.json`);
    } else {
      throw new Error(`Invalid server source: ${source}`);
    }

    // Load config
    let config: any;
    try {
      config = await this.loadConfigFile(configPath);
    } catch (error) {
      return null; // Config file doesn't exist
    }

    // Check if server exists
    if (!config.mcpServers || !config.mcpServers[name]) {
      return null;
    }

    // Update the server
    config.mcpServers[name] = server.config;

    // Save the config
    await this.saveConfigFile(configPath, config);

    // Return updated record
    return {
      ...server,
      lastModified: Date.now(),
      checksum: this.calculateChecksum(server.config),
    };
  }

  /**
   * Delete a server configuration record
   */
  async delete(id: string): Promise<boolean> {
    const { source, name } = this.parseServerId(id);

    // Determine config file path
    let configPath: string;
    if (source === "global") {
      configPath = this.globalConfigPath;
    } else if (source.startsWith("app:")) {
      const appId = source.substring(4);
      configPath = path.join(this.perAppConfigDir, `${appId}.json`);
    } else {
      throw new Error(`Invalid server source: ${source}`);
    }

    // Load config
    let config: any;
    try {
      config = await this.loadConfigFile(configPath);
    } catch (error) {
      return false; // Config file doesn't exist
    }

    // Check if server exists
    if (!config.mcpServers || !config.mcpServers[name]) {
      return false;
    }

    // Delete the server
    delete config.mcpServers[name];

    // Save the config (or delete file if empty)
    if (Object.keys(config.mcpServers).length === 0) {
      // If no servers left and it's an app config, delete the file
      if (source.startsWith("app:")) {
        await fs.unlink(configPath);
      } else {
        // Keep global config file even if empty
        await this.saveConfigFile(configPath, config);
      }
    } else {
      await this.saveConfigFile(configPath, config);
    }

    return true;
  }

  /**
   * Find a server configuration record by ID
   */
  async findById(id: string): Promise<ServerConfigRecord | null> {
    const servers = await this.loadAllServers();
    return servers.find((s) => s.id === id) || null;
  }

  /**
   * Find a server configuration record by name
   */
  async findByName(name: string): Promise<ServerConfigRecord | null> {
    const servers = await this.loadAllServers();
    return servers.find((s) => s.name === name) || null;
  }

  /**
   * Find all server configuration records
   */
  async findAll(): Promise<ServerConfigRecord[]> {
    return this.loadAllServers();
  }
}