/**
 * Base connection implementation with common functionality
 */

import { EventEmitter } from "events";
import { v4 as uuidv4 } from "uuid";
import { ServerConfig } from "../../types/config.js";
import {
  Connection,
  ConnectionState,
  ConnectionStatus,
  ConnectionOptions,
  ConnectionEventType,
  ConnectionEventCallback,
  ConnectionEvent,
  DEFAULT_CONNECTION_OPTIONS,
} from "../types.js";

/**
 * Base connection implementation providing common functionality
 */
export abstract class BaseConnection<T = any>
  extends EventEmitter
  implements Connection<T>
{
  public readonly id: string;
  public readonly serverName: string;
  public readonly config: ServerConfig;

  protected options: Required<ConnectionOptions>;
  protected connectionStatus: ConnectionStatus;
  protected retryTimer?: NodeJS.Timeout;
  protected pingTimer?: NodeJS.Timeout;
  protected abstract _client: T | null;

  constructor(
    serverName: string,
    config: ServerConfig,
    options: ConnectionOptions = {}
  ) {
    super();

    this.id = uuidv4();
    this.serverName = serverName;
    this.config = config;
    this.options = { ...DEFAULT_CONNECTION_OPTIONS, ...options };

    this.connectionStatus = {
      state: ConnectionState.DISCONNECTED,
      serverId: this.id,
      serverName,
      retryCount: 0,
      transport: config.type,
    };
  }

  /**
   * Get the current connection status
   */
  get status(): ConnectionStatus {
    return { ...this.connectionStatus };
  }

  /**
   * Get the underlying client instance
   */
  get client(): T {
    if (!this._client) {
      throw new Error(`Client not initialized for server "${this.serverName}"`);
    }
    return this._client;
  }

  /**
   * Check if the connection is active
   */
  isConnected(): boolean {
    return this.connectionStatus.state === ConnectionState.CONNECTED;
  }

  /**
   * Connect to the MCP server
   */
  async connect(): Promise<void> {
    if (this.isConnected()) {
      return;
    }

    this.updateStatus(ConnectionState.CONNECTING);
    this.emit("connecting", this.createEvent("connecting"));

    try {
      await this.doConnect();

      this.updateStatus(ConnectionState.CONNECTED, {
        connectedAt: new Date(),
        retryCount: 0,
        lastError: undefined,
      });

      this.emit("connected", this.createEvent("connected"));
      this.startPing();
    } catch (error) {
      this.updateStatus(ConnectionState.FAILED, {
        lastError: (error as Error).message,
      });

      this.emit(
        "failed",
        this.createEvent("failed", { error: error as Error })
      );

      if (this.connectionStatus.retryCount < this.options.maxRetries) {
        await this.scheduleReconnect();
      }

      throw error;
    }
  }

  /**
   * Disconnect from the MCP server
   */
  async disconnect(): Promise<void> {
    if (this.connectionStatus.state === ConnectionState.DISCONNECTED) {
      return;
    }

    this.stopPing();
    this.clearRetryTimer();

    try {
      await this.doDisconnect();
    } catch (error) {
      console.warn(
        `Error during disconnect for server "${this.serverName}":`,
        error
      );
    }

    this.updateStatus(ConnectionState.DISCONNECTED);
    this.emit("disconnected", this.createEvent("disconnected"));
  }

  /**
   * Ping the server to check if it's still responsive
   */
  async ping(): Promise<boolean> {
    if (!this.isConnected()) {
      return false;
    }

    try {
      const result = await this.doPing();
      this.updateStatus(this.connectionStatus.state, {
        lastPing: new Date(),
      });
      return result;
    } catch (error) {
      this.handlePingError(error as Error);
      return false;
    }
  }

  /**
   * Abstract methods to be implemented by transport-specific classes
   */
  protected abstract doConnect(): Promise<void>;
  protected abstract doDisconnect(): Promise<void>;
  protected abstract doPing(): Promise<boolean>;

  /**
   * Update connection status
   */
  protected updateStatus(
    state: ConnectionState,
    updates: Partial<ConnectionStatus> = {}
  ): void {
    this.connectionStatus = {
      ...this.connectionStatus,
      ...updates,
      state,
    };
  }

  /**
   * Create a connection event
   */
  protected createEvent(
    type: ConnectionEventType,
    overrides: Partial<ConnectionEvent> = {}
  ): ConnectionEvent {
    return {
      type,
      serverId: this.id,
      serverName: this.serverName,
      timestamp: new Date(),
      ...overrides,
    };
  }

  /**
   * Schedule a reconnection attempt
   */
  private async scheduleReconnect(): Promise<void> {
    this.clearRetryTimer();

    this.connectionStatus.retryCount++;
    this.updateStatus(ConnectionState.RECONNECTING);
    this.emit("reconnecting", this.createEvent("reconnecting"));

    const delay = Math.min(
      this.options.retryDelay *
        Math.pow(
          this.options.backoffMultiplier,
          this.connectionStatus.retryCount - 1
        ),
      this.options.maxRetryDelay
    );

    this.retryTimer = setTimeout(async () => {
      try {
        await this.connect();
      } catch {
        // Error handling is done in connect() method
      }
    }, delay);
  }

  /**
   * Start periodic ping checks
   */
  private startPing(): void {
    if (this.options.pingInterval <= 0) {
      return;
    }

    this.pingTimer = setInterval(async () => {
      await this.ping();
    }, this.options.pingInterval);
  }

  /**
   * Stop periodic ping checks
   */
  private stopPing(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = undefined;
    }
  }

  /**
   * Clear retry timer
   */
  private clearRetryTimer(): void {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = undefined;
    }
  }

  /**
   * Handle ping errors
   */
  private handlePingError(error: Error): void {
    this.emit("error", this.createEvent("error", { error }));

    // If ping fails, consider the connection as failed and try to reconnect
    if (
      this.isConnected() &&
      this.connectionStatus.retryCount < this.options.maxRetries
    ) {
      this.scheduleReconnect();
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

  emit(event: ConnectionEventType, payload: ConnectionEvent): boolean;
  emit(event: string, ...args: any[]): boolean;
  emit(event: string | ConnectionEventType, ...args: any[]): boolean {
    return super.emit(event, ...args);
  }
}
