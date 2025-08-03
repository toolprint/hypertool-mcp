/**
 * TypeScript interfaces for Hypertool MCP server implementation
 */

/**
 * Server transport types (inbound connections TO this server)
 */
export type ServerTransportType = "stdio" | "http";

/**
 * Transport configuration for the Hypertool MCP server
 */
export interface TransportConfig {
  type: ServerTransportType;
  port?: number;
  host?: string;
}

/**
 * Hypertool MCP server configuration
 */
export interface MetaMCPServerConfig {
  name: string;
  version: string;
  description: string;
  transport: TransportConfig;
  configPath?: string;
}

/**
 * Server initialization options
 */
export interface ServerInitOptions {
  transport: TransportConfig;
  configPath?: string;
  configSource?: any; // IConfigSource from db/interfaces
  debug?: boolean;
}

/**
 * Server state enumeration
 */
export enum ServerState {
  STOPPED = "stopped",
  STARTING = "starting",
  RUNNING = "running",
  STOPPING = "stopping",
  ERROR = "error",
}

/**
 * Server status information
 */
export interface ServerStatus {
  state: ServerState;
  uptime?: number;
  connectedClients?: number;
  underlyingServers?: number;
  lastError?: string;
}
