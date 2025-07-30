/**
 * MCP Server Manager - Core functionality for managing MCP server configurations
 */

import { promises as fs } from "fs";
import { join } from "path";
import { homedir } from "os";
import {
  MCPServerConfig,
  MCPServersConfig,
  MCPServerDetails,
} from "./types.js";

export class MCPServerManager {
  private basePath: string;
  private mcpConfigPath: string;

  constructor(basePath: string = join(homedir(), ".toolprint/hypertool-mcp")) {
    this.basePath = basePath;
    this.mcpConfigPath = join(basePath, "mcp.json");
  }

  /**
   * Initialize the MCP manager and ensure config exists
   */
  async initialize(): Promise<void> {
    // Ensure directory exists
    await fs.mkdir(this.basePath, { recursive: true });

    // Create empty config if it doesn't exist
    try {
      await fs.access(this.mcpConfigPath);
    } catch {
      const emptyConfig: MCPServersConfig = {
        mcpServers: {},
        _metadata: {
          sources: {},
        },
      };
      await this.saveConfig(emptyConfig);
    }
  }

  /**
   * List all configured MCP servers
   */
  async listServers(): Promise<MCPServerDetails[]> {
    const config = await this.loadConfig();
    const servers: MCPServerDetails[] = [];

    for (const [name, serverConfig] of Object.entries(config.mcpServers)) {
      const metadata = config._metadata?.sources?.[name];
      servers.push({
        name,
        config: serverConfig,
        metadata,
      });
    }

    return servers;
  }

  /**
   * Get a specific server configuration
   */
  async getServer(name: string): Promise<MCPServerDetails | null> {
    const config = await this.loadConfig();
    const serverConfig = config.mcpServers[name];

    if (!serverConfig) {
      return null;
    }

    const metadata = config._metadata?.sources?.[name];
    return {
      name,
      config: serverConfig,
      metadata,
    };
  }

  /**
   * Add a new MCP server
   */
  async addServer(name: string, serverConfig: MCPServerConfig): Promise<void> {
    const config = await this.loadConfig();

    // Check if server already exists
    if (config.mcpServers[name]) {
      throw new Error(`Server '${name}' already exists`);
    }

    // Validate server name
    if (!this.isValidServerName(name)) {
      throw new Error(
        `Invalid server name '${name}'. Use alphanumeric characters, hyphens, and underscores only.`
      );
    }

    // Validate server configuration
    this.validateServerConfig(serverConfig);

    // Add server
    config.mcpServers[name] = serverConfig;

    // Add metadata
    if (!config._metadata) {
      config._metadata = { sources: {} };
    }
    if (!config._metadata.sources) {
      config._metadata.sources = {};
    }

    config._metadata.sources[name] = {
      app: "manual",
      importedAt: new Date().toISOString(),
      addedManually: true,
    };

    // Save configuration
    await this.saveConfig(config);
  }

  /**
   * Remove an MCP server
   */
  async removeServer(name: string): Promise<void> {
    const config = await this.loadConfig();

    // Check if server exists
    if (!config.mcpServers[name]) {
      throw new Error(`Server '${name}' not found`);
    }

    // Remove server
    delete config.mcpServers[name];

    // Remove metadata
    if (config._metadata?.sources) {
      delete config._metadata.sources[name];
    }

    // Save configuration
    await this.saveConfig(config);
  }

  /**
   * Update an existing server configuration
   */
  async updateServer(
    name: string,
    serverConfig: MCPServerConfig
  ): Promise<void> {
    const config = await this.loadConfig();

    // Check if server exists
    if (!config.mcpServers[name]) {
      throw new Error(`Server '${name}' not found`);
    }

    // Validate server configuration
    this.validateServerConfig(serverConfig);

    // Update server
    config.mcpServers[name] = serverConfig;

    // Update metadata timestamp
    if (config._metadata?.sources?.[name]) {
      config._metadata.sources[name].importedAt = new Date().toISOString();
    }

    // Save configuration
    await this.saveConfig(config);
  }

  /**
   * Check if a server name is valid
   */
  private isValidServerName(name: string): boolean {
    // Allow alphanumeric, hyphens, underscores, and dots
    return /^[a-zA-Z0-9\-_.]+$/.test(name);
  }

  /**
   * Validate server configuration
   */
  private validateServerConfig(config: MCPServerConfig): void {
    // Validate transport type
    const validTypes = ["stdio", "http", "sse", "websocket"];
    if (!validTypes.includes(config.type)) {
      throw new Error(
        `Invalid transport type '${config.type}'. Must be one of: ${validTypes.join(", ")}`
      );
    }

    // Validate stdio configuration
    if (config.type === "stdio") {
      if (!config.command) {
        throw new Error("Stdio transport requires a command");
      }
      if (config.url) {
        throw new Error("Stdio transport should not have a URL");
      }
    }

    // Validate HTTP/SSE/WebSocket configuration
    if (["http", "sse", "websocket"].includes(config.type)) {
      if (!config.url) {
        throw new Error(
          `${config.type.toUpperCase()} transport requires a URL`
        );
      }
      if (config.command) {
        throw new Error(
          `${config.type.toUpperCase()} transport should not have a command`
        );
      }

      // Validate URL format
      try {
        new URL(config.url);
      } catch {
        throw new Error(`Invalid URL: ${config.url}`);
      }
    }

    // Validate environment variables
    if (config.env && typeof config.env !== "object") {
      throw new Error("Environment variables must be an object");
    }

    // Validate headers
    if (config.headers && typeof config.headers !== "object") {
      throw new Error("Headers must be an object");
    }
  }

  /**
   * Load the MCP configuration
   */
  private async loadConfig(): Promise<MCPServersConfig> {
    try {
      const content = await fs.readFile(this.mcpConfigPath, "utf-8");
      return JSON.parse(content);
    } catch {
      // Return empty config if file doesn't exist or is invalid
      return {
        mcpServers: {},
        _metadata: {
          sources: {},
        },
      };
    }
  }

  /**
   * Save the MCP configuration
   */
  private async saveConfig(config: MCPServersConfig): Promise<void> {
    // Create backup before saving
    await this.createBackup();

    // Save configuration
    await fs.writeFile(
      this.mcpConfigPath,
      JSON.stringify(config, null, 2),
      "utf-8"
    );
  }

  /**
   * Create a backup of the current configuration
   */
  private async createBackup(): Promise<void> {
    try {
      const backupDir = join(this.basePath, "backups", "mcp");
      await fs.mkdir(backupDir, { recursive: true });

      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const backupPath = join(backupDir, `mcp_${timestamp}.json`);

      const content = await fs.readFile(this.mcpConfigPath, "utf-8");
      await fs.writeFile(backupPath, content, "utf-8");
    } catch {
      // Ignore backup errors - don't fail the operation
    }
  }

  /**
   * Parse environment variable string (key=value)
   */
  static parseEnvVar(envStr: string): [string, string] {
    const index = envStr.indexOf("=");
    if (index === -1) {
      throw new Error(
        `Invalid environment variable format: ${envStr}. Use KEY=value`
      );
    }
    const key = envStr.substring(0, index);
    const value = envStr.substring(index + 1);
    return [key, value];
  }

  /**
   * Parse header string (key=value)
   */
  static parseHeader(headerStr: string): [string, string] {
    const index = headerStr.indexOf("=");
    if (index === -1) {
      throw new Error(`Invalid header format: ${headerStr}. Use Header=value`);
    }
    const key = headerStr.substring(0, index);
    const value = headerStr.substring(index + 1);
    return [key, value];
  }
}
