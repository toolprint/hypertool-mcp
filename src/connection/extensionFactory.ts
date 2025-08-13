/**
 * Enhanced Connection Factory with Extension Support
 * Integrates the new extension system with the existing connection factory
 */

import { ServerConfig } from "../types/config.js";
import {
  Connection,
  ConnectionOptions,
  ConnectionFactory as IConnectionFactory,
} from "./types.js";
import { ConnectionFactory } from "./factory.js";
import { ExtensionManager } from "../extensions/manager.js";

/**
 * Enhanced connection factory that supports both regular MCP servers and extensions
 */
export class ExtensionAwareConnectionFactory implements IConnectionFactory {
  private readonly baseFactory: ConnectionFactory;
  private extensionManager?: ExtensionManager;

  constructor() {
    this.baseFactory = new ConnectionFactory();
  }

  /**
   * Set the extension manager for extension support
   */
  setExtensionManager(extensionManager: ExtensionManager): void {
    this.extensionManager = extensionManager;
  }

  /**
   * Create a connection that may come from extensions or regular config
   */
  createConnection(
    serverName: string,
    config: ServerConfig,
    options: ConnectionOptions = {}
  ): Connection {
    // If this is a regular MCP server config, use the base factory
    if (this.baseFactory.isConfigSupported(config)) {
      return this.baseFactory.createConnection(serverName, config, options);
    }

    // If we have an extension manager, check if this is an extension
    if (this.extensionManager) {
      const extensionConfig =
        this.extensionManager.getExtensionConfig(serverName);
      if (extensionConfig && extensionConfig.enabled) {
        // Convert extension to server config and create connection
        const serverConfig =
          this.extensionManager.createServerConfigForExtension(serverName);
        return this.baseFactory.createConnection(
          serverName,
          serverConfig,
          options
        );
      }
    }

    throw new Error(
      `Unsupported server configuration or extension not found: ${serverName}`
    );
  }

  /**
   * Get all available server configurations (MCP servers + enabled extensions)
   */
  async getAllServerConfigs(): Promise<Record<string, ServerConfig>> {
    const configs: Record<string, ServerConfig> = {};

    // Add enabled extensions as server configs
    if (this.extensionManager) {
      const extensionConfigs =
        this.extensionManager.getEnabledExtensionsAsServerConfigs();
      Object.assign(configs, extensionConfigs);
    }

    return configs;
  }

  /**
   * Check if a server name is available (either as extension or regular config)
   */
  async isServerAvailable(serverName: string): Promise<boolean> {
    // Check if it's an enabled extension
    if (this.extensionManager) {
      const extensionConfig =
        this.extensionManager.getExtensionConfig(serverName);
      if (extensionConfig && extensionConfig.enabled) {
        return true;
      }
    }

    return false;
  }

  /**
   * List all available server names (extensions + regular servers)
   */
  async listAvailableServers(): Promise<string[]> {
    const servers: string[] = [];

    // Add enabled extensions
    if (this.extensionManager) {
      const enabledExtensions = this.extensionManager.getEnabledConfigs();
      servers.push(...enabledExtensions.map((ext) => ext.name));
    }

    return servers;
  }

  /**
   * Get server information including type and status
   */
  async getServerInfo(serverName: string): Promise<
    | {
        name: string;
        type: "extension" | "mcp";
        enabled: boolean;
        valid?: boolean;
        version?: string;
        description?: string;
        errors?: string[];
        warnings?: string[];
      }
    | undefined
  > {
    // Check if it's an extension
    if (this.extensionManager) {
      const extensionConfig =
        this.extensionManager.getExtensionConfig(serverName);
      if (extensionConfig) {
        return {
          name: serverName,
          type: "extension",
          enabled: extensionConfig.enabled,
          valid: extensionConfig.validationResult.isValid,
          version: extensionConfig.manifest.version,
          description: extensionConfig.manifest.description,
          errors: extensionConfig.validationResult.errors,
          warnings: extensionConfig.validationResult.warnings,
        };
      }
    }

    return undefined;
  }

  /**
   * Refresh all extensions and reload configurations
   */
  async refresh(): Promise<void> {
    if (this.extensionManager) {
      await this.extensionManager.refreshExtensions();
    }
  }

  /**
   * Delegate to base factory for regular operations
   */
  createStdioConnection(
    serverName: string,
    config: any,
    options: ConnectionOptions = {}
  ) {
    return this.baseFactory.createStdioConnection(serverName, config, options);
  }

  createHttpConnection(
    serverName: string,
    config: any,
    options: ConnectionOptions = {}
  ) {
    return this.baseFactory.createHttpConnection(serverName, config, options);
  }

  createSSEConnection(
    serverName: string,
    config: any,
    options: ConnectionOptions = {}
  ) {
    return this.baseFactory.createSSEConnection(serverName, config, options);
  }

  isConfigSupported(config: ServerConfig): boolean {
    return this.baseFactory.isConfigSupported(config);
  }

  getSupportedTransports(): string[] {
    return this.baseFactory.getSupportedTransports();
  }
}
