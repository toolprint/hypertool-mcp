/**
 * Connection pool implementation for managing multiple MCP server connections
 */

import { EventEmitter } from "events";
import { ServerConfig } from "../types/config.js";
import { createLogger } from "../logging/index.js";

const logger = createLogger({ module: "connection/pool" });
import {
  Connection,
  ConnectionEventType,
  ConnectionEventCallback,
  ConnectionEvent,
  ConnectionPoolConfig,
  ConnectionStatus,
  IConnectionPool,
  DEFAULT_POOL_CONFIG,
} from "./types.js";
import { ConnectionFactory } from "./factory.js";

/**
 * Connection pool manages a collection of connections to MCP servers
 */
export class ConnectionPool extends EventEmitter implements IConnectionPool {
  private connections = new Map<string, Connection>();
  private config: Required<ConnectionPoolConfig>;
  private factory: ConnectionFactory;
  private healthCheckTimer?: NodeJS.Timeout;
  private isStarted = false;

  constructor(config: ConnectionPoolConfig = {}, factory?: ConnectionFactory) {
    super();
    this.config = { ...DEFAULT_POOL_CONFIG, ...config };
    this.factory = factory || new ConnectionFactory();
    this.setupEventHandlers();
  }

  /**
   * Get the total number of connections in the pool
   */
  get size(): number {
    return this.connections.size;
  }

  /**
   * Get the number of active connections
   */
  get activeConnections(): number {
    return Array.from(this.connections.values()).filter((conn) =>
      conn.isConnected()
    ).length;
  }

  /**
   * Get the status of all connections
   */
  get status(): Record<string, ConnectionStatus> {
    const status: Record<string, ConnectionStatus> = {};
    for (const [name, connection] of this.connections) {
      status[name] = connection.status;
    }
    return status;
  }

  /**
   * Add a new connection to the pool
   */
  async addConnection(
    serverName: string,
    config: ServerConfig
  ): Promise<Connection> {
    if (this.connections.has(serverName)) {
      const existingServers = Array.from(this.connections.keys());
      throw new Error(
        `❌ Server name conflict: Connection for server "${serverName}" already exists.\n` +
          `💡 Each server must have a unique name.\n` +
          `📋 Active servers: [${existingServers.join(", ")}]\n` +
          `🚫 Cannot create duplicate connections for the same server name.`
      );
    }

    if (this.size >= this.config.maxConcurrentConnections) {
      throw new Error(
        `Maximum number of connections (${this.config.maxConcurrentConnections}) reached`
      );
    }

    const connection = this.factory.createConnection(
      serverName,
      config,
      this.config.connectionOptions
    );

    // Setup connection event forwarding
    this.setupConnectionEventForwarding(connection);

    this.connections.set(serverName, connection);

    // Auto-connect if pool is started
    if (this.isStarted) {
      try {
        await connection.connect();
      } catch (error) {
        this.connections.delete(serverName);
        throw error;
      }
    }

    this.emit("connectionAdded", { serverName, connection });
    return connection;
  }

  /**
   * Remove a connection from the pool
   */
  async removeConnection(serverName: string): Promise<void> {
    const connection = this.connections.get(serverName);
    if (!connection) {
      return;
    }

    try {
      await connection.disconnect();
    } catch (error) {
      logger.warn(`Error disconnecting from server "${serverName}":`, error);
    }

    this.connections.delete(serverName);
    this.emit("connectionRemoved", { serverName });
  }

  /**
   * Get a specific connection by server name
   */
  getConnection(serverName: string): Connection | undefined {
    return this.connections.get(serverName);
  }

  /**
   * Get all connections
   */
  getConnections(): Connection[] {
    return Array.from(this.connections.values());
  }

  /**
   * Get names of all connected servers
   */
  getConnectedServers(): string[] {
    return Array.from(this.connections.entries())
      .filter(([, connection]) => connection.isConnected())
      .map(([name]) => name);
  }

  /**
   * Start the connection pool
   */
  async start(): Promise<void> {
    if (this.isStarted) {
      return;
    }

    this.isStarted = true;

    // Connect all existing connections
    const connectionPromises = Array.from(this.connections.entries()).map(
      async ([serverName, connection]) => {
        try {
          await connection.connect();
        } catch (error) {
          logger.error(`Failed to connect to server "${serverName}":`, error);
          this.emit("error", {
            type: "failed",
            serverId: connection.id,
            serverName,
            timestamp: new Date(),
            error: error as Error,
          });
        }
      }
    );

    await Promise.allSettled(connectionPromises);

    // Start health check timer
    this.startHealthCheck();

    this.emit("poolStarted");
  }

  /**
   * Stop the connection pool
   */
  async stop(): Promise<void> {
    if (!this.isStarted) {
      return;
    }

    this.isStarted = false;

    // Stop health check timer
    this.stopHealthCheck();

    // Disconnect all connections
    const disconnectionPromises = Array.from(this.connections.entries()).map(
      async ([serverName, connection]) => {
        try {
          await connection.disconnect();
        } catch (error) {
          logger.warn(
            `Error disconnecting from server "${serverName}":`,
            error
          );
        }
      }
    );

    await Promise.allSettled(disconnectionPromises);

    this.emit("poolStopped");
  }

  /**
   * Setup connection event forwarding to pool events
   */
  private setupConnectionEventForwarding(connection: Connection): void {
    const eventTypes: ConnectionEventType[] = [
      "connecting",
      "connected",
      "disconnected",
      "reconnecting",
      "failed",
      "error",
    ];

    eventTypes.forEach((eventType) => {
      connection.on(eventType, (event: ConnectionEvent) => {
        this.emit(eventType, event);
      });
    });
  }

  /**
   * Setup general event handlers
   */
  private setupEventHandlers(): void {
    // Handle connection failures
    this.on("failed", (event: ConnectionEvent) => {
      logger.error(
        `Connection to server "${event.serverName}" failed:`,
        event.error
      );
    });

    // Handle connection errors
    this.on("error", (event: ConnectionEvent) => {
      logger.error(
        `Connection error for server "${event.serverName}":`,
        event.error
      );
    });
  }

  /**
   * Start periodic health checks
   */
  private startHealthCheck(): void {
    if (this.healthCheckTimer) {
      return;
    }

    this.healthCheckTimer = setInterval(async () => {
      await this.performHealthCheck();
    }, this.config.healthCheckInterval);
  }

  /**
   * Stop periodic health checks
   */
  private stopHealthCheck(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = undefined;
    }
  }

  /**
   * Perform health check on all connections
   */
  private async performHealthCheck(): Promise<void> {
    const healthCheckPromises = Array.from(this.connections.entries()).map(
      async ([serverName, connection]) => {
        try {
          const isHealthy = await connection.ping();
          if (!isHealthy && connection.isConnected()) {
            logger.warn(`Health check failed for server "${serverName}"`);
            this.emit("error", {
              type: "error",
              serverId: connection.id,
              serverName,
              timestamp: new Date(),
              error: new Error("Health check failed"),
            });
          }
        } catch (error) {
          logger.warn(`Health check error for server "${serverName}":`, error);
        }
      }
    );

    await Promise.allSettled(healthCheckPromises);
  }

  /**
   * Override EventEmitter methods to provide type safety
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
