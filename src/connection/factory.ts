/**
 * Connection factory for creating transport-specific connections
 */

import { ServerConfig, StdioServerConfig, SSEServerConfig } from "../types/config";
import { Connection, ConnectionOptions, ConnectionFactory as IConnectionFactory } from "./types";
import { StdioConnection } from "./clients/stdio";
import { SSEConnection } from "./clients/sse";

/**
 * Factory for creating connections based on server configuration
 */
export class ConnectionFactory implements IConnectionFactory {
  /**
   * Create a connection based on server configuration
   */
  createConnection(
    serverName: string,
    config: ServerConfig,
    options: ConnectionOptions = {}
  ): Connection {
    switch (config.type) {
      case "stdio":
        return new StdioConnection(
          serverName,
          config as StdioServerConfig,
          options
        );
        
      case "sse":
        return new SSEConnection(
          serverName,
          config as SSEServerConfig,
          options
        );
        
      default:
        throw new Error(
          `Unsupported transport type: ${(config as any).type}`
        );
    }
  }

  /**
   * Create a stdio connection
   */
  createStdioConnection(
    serverName: string,
    config: StdioServerConfig,
    options: ConnectionOptions = {}
  ): StdioConnection {
    return new StdioConnection(serverName, config, options);
  }

  /**
   * Create an SSE connection
   */
  createSSEConnection(
    serverName: string,
    config: SSEServerConfig,
    options: ConnectionOptions = {}
  ): SSEConnection {
    return new SSEConnection(serverName, config, options);
  }

  /**
   * Validate if a server configuration is supported
   */
  isConfigSupported(config: ServerConfig): boolean {
    return config.type === "stdio" || config.type === "sse";
  }

  /**
   * Get supported transport types
   */
  getSupportedTransports(): string[] {
    return ["stdio", "sse"];
  }
}