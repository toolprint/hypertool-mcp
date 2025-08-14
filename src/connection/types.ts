/**
 * TypeScript interfaces for connection management
 */

import { ServerConfig } from "../types/config.js";

/**
 * Connection state enumeration
 */
export enum ConnectionState {
  DISCONNECTED = "disconnected",
  CONNECTING = "connecting",
  CONNECTED = "connected",
  RECONNECTING = "reconnecting",
  FAILED = "failed",
}

/**
 * Connection status information
 */
export interface ConnectionStatus {
  state: ConnectionState;
  serverId: string;
  serverName: string;
  connectedAt?: Date;
  lastPing?: Date;
  lastError?: string;
  retryCount: number;
  transport: "stdio" | "http" | "sse" | "dxt";
}

/**
 * Connection configuration options
 */
export interface ConnectionOptions {
  maxRetries?: number;
  retryDelay?: number;
  backoffMultiplier?: number;
  maxRetryDelay?: number;
  pingInterval?: number;
  connectionTimeout?: number;
  debug?: boolean;
}

/**
 * Connection pool configuration
 */
export interface ConnectionPoolConfig {
  maxConcurrentConnections?: number;
  idleTimeout?: number;
  healthCheckInterval?: number;
  connectionOptions?: ConnectionOptions;
}

/**
 * Connection event types
 */
export type ConnectionEventType =
  | "connecting"
  | "connected"
  | "disconnected"
  | "reconnecting"
  | "failed"
  | "error";

/**
 * Connection event payload
 */
export interface ConnectionEvent {
  type: ConnectionEventType;
  serverId: string;
  serverName: string;
  timestamp: Date;
  error?: Error;
  metadata?: Record<string, unknown>;
}

/**
 * Connection lifecycle callback
 */
export type ConnectionEventCallback = (event: ConnectionEvent) => void;

/**
 * Generic connection interface
 */
export interface Connection<T = any> {
  readonly id: string;
  readonly serverName: string;
  readonly config: ServerConfig;
  readonly status: ConnectionStatus;
  readonly client: T;

  connect(): Promise<void>;
  disconnect(): Promise<void>;
  ping(): Promise<boolean>;
  isConnected(): boolean;

  on(event: ConnectionEventType, callback: ConnectionEventCallback): void;
  off(event: ConnectionEventType, callback: ConnectionEventCallback): void;
  emit(event: ConnectionEventType, payload?: Partial<ConnectionEvent>): void;
}

/**
 * Connection factory interface
 */
export interface ConnectionFactory<T = any> {
  createConnection(
    serverName: string,
    config: ServerConfig,
    options?: ConnectionOptions
  ): Connection<T>;
}

/**
 * Connection pool interface
 */
export interface IConnectionPool {
  readonly size: number;
  readonly activeConnections: number;
  readonly status: Record<string, ConnectionStatus>;

  addConnection(serverName: string, config: ServerConfig): Promise<Connection>;
  removeConnection(serverName: string): Promise<void>;
  getConnection(serverName: string): Connection | undefined;
  getConnections(): Connection[];
  getConnectedServers(): string[];

  start(): Promise<void>;
  stop(): Promise<void>;

  on(event: ConnectionEventType, callback: ConnectionEventCallback): void;
  off(event: ConnectionEventType, callback: ConnectionEventCallback): void;
}

/**
 * Connection manager interface
 */
export interface IConnectionManager {
  readonly pool: IConnectionPool;
  readonly status: Record<string, ConnectionStatus>;

  initialize(servers: Record<string, ServerConfig>): Promise<void>;
  connect(serverName: string): Promise<void>;
  disconnect(serverName: string): Promise<void>;
  reconnect(serverName: string): Promise<void>;

  getConnection(serverName: string): Connection | undefined;
  getConnectedServers(): string[];
  isServerConnected(serverName: string): boolean;

  start(): Promise<void>;
  stop(): Promise<void>;

  on(event: ConnectionEventType, callback: ConnectionEventCallback): void;
  off(event: ConnectionEventType, callback: ConnectionEventCallback): void;
}

/**
 * Default connection options
 */
export const DEFAULT_CONNECTION_OPTIONS: Required<ConnectionOptions> = {
  maxRetries: 3,
  retryDelay: 1000,
  backoffMultiplier: 2,
  maxRetryDelay: 30000,
  pingInterval: 30000,
  connectionTimeout: 10000,
  debug: false,
};

/**
 * Default connection pool configuration
 */
export const DEFAULT_POOL_CONFIG: Required<ConnectionPoolConfig> = {
  maxConcurrentConnections: 20,
  idleTimeout: 300000, // 5 minutes
  healthCheckInterval: 60000, // 1 minute
  connectionOptions: DEFAULT_CONNECTION_OPTIONS,
};
