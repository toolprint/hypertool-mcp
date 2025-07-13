/**
 * Client-specific types for MCP connections
 */

import { ChildProcess } from "child_process";

/**
 * MCP protocol message types
 */
export interface MCPMessage {
  jsonrpc: "2.0";
  id?: string | number;
  method?: string;
  params?: any;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

/**
 * Stdio client interface
 */
export interface IStdioClient {
  readonly process: ChildProcess | null;
  readonly isRunning: boolean;

  start(): Promise<void>;
  stop(): Promise<void>;
  send(message: MCPMessage): Promise<void>;
  ping(): Promise<boolean>;

  on(event: "message", listener: (message: MCPMessage) => void): this;
  on(event: "error", listener: (error: Error) => void): this;
  on(event: "disconnect", listener: () => void): this;
  off(event: string, listener: Function): this;
}

/**
 * HTTP client interface
 */
export interface IHttpClient {
  readonly isConnected: boolean;
  readonly url: string;

  connect(): Promise<void>;
  disconnect(): Promise<void>;
  send(message: MCPMessage): Promise<MCPMessage>;
  ping(): Promise<boolean>;

  on(event: "message", listener: (message: MCPMessage) => void): this;
  on(event: "error", listener: (error: Error) => void): this;
  on(event: "disconnect", listener: () => void): this;
  off(event: string, listener: Function): this;
}

/**
 * Client configuration options
 */
export interface ClientOptions {
  timeout?: number;
  retryAttempts?: number;
  retryDelay?: number;
  debug?: boolean;
}

/**
 * Default client options
 */
export const DEFAULT_CLIENT_OPTIONS: Required<ClientOptions> = {
  timeout: 10000,
  retryAttempts: 3,
  retryDelay: 1000,
  debug: false,
};
