/**
 * Connection manager for handling multiple MCP server connections
 */

import { EventEmitter } from "events";
import { ServerConfig } from "../types/config";
import {
  Connection,
  ConnectionEventType,
  ConnectionEventCallback,
  ConnectionEvent,
  ConnectionStatus,
  ConnectionPoolConfig,
  IConnectionManager,
  IConnectionPool,
} from "./types";
import { ConnectionPool } from "./pool";
import { ConnectionFactory } from "./factory";
import { HealthMonitor } from "./health-monitor";
import { Logger, createLogger } from "../logging";
import { RecoveryCoordinator } from "../errors/recovery";

/**
 * Connection manager orchestrates connections to multiple MCP servers
 */
export class ConnectionManager
  extends EventEmitter
  implements IConnectionManager
{
  private _pool: IConnectionPool;
  private _healthMonitor: HealthMonitor;
  private _logger: Logger;
  private _recoveryCoordinator: RecoveryCoordinator;
  private servers: Record<string, ServerConfig> = {};
  private isInitialized = false;
  private isStarted = false;

  constructor(
    poolConfig: ConnectionPoolConfig = {},
    connectionFactory?: ConnectionFactory
  ) {
    super();
    this._pool = new ConnectionPool(poolConfig, connectionFactory);
    this._healthMonitor = new HealthMonitor();
    this._logger = createLogger('ConnectionManager');
    this._recoveryCoordinator = new RecoveryCoordinator();
    this.setupPoolEventForwarding();
  }

  /**
   * Get the connection pool
   */
  get pool(): IConnectionPool {
    return this._pool;
  }

  /**
   * Get the status of all connections
   */
  get status(): Record<string, ConnectionStatus> {
    return this._pool.status;
  }

  /**
   * Initialize the connection manager with server configurations
   */
  async initialize(servers: Record<string, ServerConfig>): Promise<void> {
    if (this.isInitialized) {
      throw new Error("Connection manager is already initialized");
    }

    this.servers = { ...servers };

    // Validate all server configurations
    this.validateServerConfigurations();

    // Add all servers to the pool - fail fast on any error
    const serverEntries = Object.entries(this.servers);
    for (const [serverName, config] of serverEntries) {
      try {
        await this._pool.addConnection(serverName, config);
      } catch (error) {
        console.error(`\n❌ FATAL ERROR: Failed to initialize server "${serverName}"`);
        console.error(`   Error: ${(error as Error).message}`);
        console.error(`\n💡 Resolution: Please check your MCP configuration and ensure all server names are unique.`);
        console.error(`   Configuration file: Check for duplicate server names in mcpServers section.`);
        console.error(`\n🚫 Meta-MCP server cannot start with conflicting server configurations.`);
        process.exit(1);
      }
    }

    this.isInitialized = true;

    this.emit("initialized", {
      serverCount: Object.keys(this.servers).length,
      servers: Object.keys(this.servers),
    });
  }

  /**
   * Connect to a specific server
   */
  async connect(serverName: string): Promise<void> {
    this.ensureInitialized();

    const connection = this._pool.getConnection(serverName);
    if (!connection) {
      throw new Error(`Server "${serverName}" not found in pool`);
    }

    if (connection.isConnected()) {
      return;
    }

    try {
      await connection.connect();
    } catch (error) {
      console.error(`Failed to connect to server "${serverName}":`, error);
      throw error;
    }
  }

  /**
   * Disconnect from a specific server
   */
  async disconnect(serverName: string): Promise<void> {
    this.ensureInitialized();

    const connection = this._pool.getConnection(serverName);
    if (!connection) {
      return;
    }

    try {
      await connection.disconnect();
    } catch (error) {
      console.error(`Failed to disconnect from server "${serverName}":`, error);
      throw error;
    }
  }

  /**
   * Reconnect to a specific server
   */
  async reconnect(serverName: string): Promise<void> {
    this.ensureInitialized();

    await this.disconnect(serverName);
    await this.connect(serverName);
  }

  /**
   * Get a specific connection
   */
  getConnection(serverName: string): Connection | undefined {
    return this._pool.getConnection(serverName);
  }

  /**
   * Get names of all connected servers
   */
  getConnectedServers(): string[] {
    return this._pool.getConnectedServers();
  }

  /**
   * Check if a specific server is connected
   */
  isServerConnected(serverName: string): boolean {
    const connection = this._pool.getConnection(serverName);
    return connection?.isConnected() ?? false;
  }

  /**
   * Start the connection manager
   */
  async start(): Promise<void> {
    this.ensureInitialized();

    if (this.isStarted) {
      return;
    }

    try {
      await this._pool.start();
      this.isStarted = true;

      this.emit("started", {
        serverCount: Object.keys(this.servers).length,
        connectedServers: this.getConnectedServers(),
      });
    } catch (error) {
      console.error("Failed to start connection manager:", error);
      throw error;
    }
  }

  /**
   * Stop the connection manager
   */
  async stop(): Promise<void> {
    if (!this.isStarted) {
      return;
    }

    try {
      await this._pool.stop();
      this.isStarted = false;

      this.emit("stopped", {
        serverCount: Object.keys(this.servers).length,
      });
    } catch (error) {
      console.error("Failed to stop connection manager:", error);
      throw error;
    }
  }

  /**
   * Add a new server configuration
   */
  async addServer(serverName: string, config: ServerConfig): Promise<void> {
    this.ensureInitialized();

    if (this.servers[serverName]) {
      const error = new Error(
        `❌ Server name conflict detected: "${serverName}" already exists.\n` +
        `💡 Resolution: Use a unique server name or remove the existing server first.\n` +
        `📋 Existing servers: ${Object.keys(this.servers).join(', ')}`
      );
      console.error(error.message);
      throw error;
    }

    this.servers[serverName] = config;
    await this._pool.addConnection(serverName, config);

    // Add to health monitor
    const connection = this._pool.getConnection(serverName);
    if (connection) {
      this._healthMonitor.addConnection(connection);
    }

    // Auto-connect if manager is started
    if (this.isStarted) {
      try {
        await this.connect(serverName);
      } catch (error) {
        console.warn(
          `Failed to auto-connect to new server "${serverName}":`,
          error
        );
      }
    }

    this.emit("serverAdded", { serverName, config });
  }

  /**
   * Remove a server configuration
   */
  async removeServer(serverName: string): Promise<void> {
    this.ensureInitialized();

    if (!this.servers[serverName]) {
      return;
    }

    await this._pool.removeConnection(serverName);
    delete this.servers[serverName];

    this.emit("serverRemoved", { serverName });
  }

  /**
   * Get server configuration
   */
  getServerConfig(serverName: string): ServerConfig | undefined {
    return this.servers[serverName];
  }

  /**
   * Get all server names
   */
  getServerNames(): string[] {
    return Object.keys(this.servers);
  }

  /**
   * Get connection statistics
   */
  getStats() {
    const serverNames = this.getServerNames();
    const connectedServers = this.getConnectedServers();

    return {
      totalServers: serverNames.length,
      connectedServers: connectedServers.length,
      disconnectedServers: serverNames.length - connectedServers.length,
      connectionRate:
        serverNames.length > 0
          ? connectedServers.length / serverNames.length
          : 0,
      activeConnections: this._pool.activeConnections,
      poolSize: this._pool.size,
    };
  }

  /**
   * Validate server configurations
   */
  private validateServerConfigurations(): void {
    for (const [serverName, config] of Object.entries(this.servers)) {
      if (!config || typeof config !== "object") {
        throw new Error(`Invalid configuration for server "${serverName}"`);
      }

      if (!config.type || (config.type !== "stdio" && config.type !== "http" && config.type !== "sse")) {
        throw new Error(
          `Invalid transport type for server "${serverName}": ${(config as any).type}`
        );
      }
    }
  }

  /**
   * Setup event forwarding from the pool
   */
  private setupPoolEventForwarding(): void {
    const eventTypes: ConnectionEventType[] = [
      "connecting",
      "connected",
      "disconnected",
      "reconnecting",
      "failed",
      "error",
    ];

    eventTypes.forEach((eventType) => {
      this._pool.on(eventType, (event: ConnectionEvent) => {
        this.emit(eventType, event);
      });
    });

    // Forward pool-specific events
    this._pool.on("poolStarted" as any, () => {
      this.emit("poolStarted" as any);
    });

    this._pool.on("poolStopped" as any, () => {
      this.emit("poolStopped" as any);
    });

    this._pool.on("connectionAdded" as any, (data: any) => {
      this.emit("connectionAdded" as any, data);
    });

    this._pool.on("connectionRemoved" as any, (data: any) => {
      this.emit("connectionRemoved" as any, data);
    });
  }

  /**
   * Ensure the manager is initialized
   */
  private ensureInitialized(): void {
    if (!this.isInitialized) {
      throw new Error(
        "Connection manager not initialized. Call initialize() first."
      );
    }
  }

  /**
   * Override EventEmitter methods for type safety
   */
  on(event: ConnectionEventType, listener: ConnectionEventCallback): this;
  on(event: string, listener: (...args: any[]) => void): this;
  on(event: string | ConnectionEventType, listener: any): this {
    return super.on(event, listener);
  }

  off(event: ConnectionEventType, listener: ConnectionEventCallback): this;
  off(event: string, listener: (...args: any[]) => void): this;
  off(event: string | ConnectionEventType, listener: any): this {
    return super.off(event, listener);
  }

  emit(event: ConnectionEventType, data: ConnectionEvent): boolean;
  emit(event: string, ...args: any[]): boolean;
  emit(event: string | ConnectionEventType, ...args: any[]): boolean {
    return super.emit(event, ...args);
  }
}
