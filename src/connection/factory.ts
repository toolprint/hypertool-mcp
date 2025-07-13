/**
 * Connection factory for creating transport-specific connections
 */

import {
  ServerConfig,
  StdioServerConfig,
  HttpServerConfig,
} from "../types/config";
import {
  Connection,
  ConnectionOptions,
  ConnectionFactory as IConnectionFactory,
} from "./types";
import { StdioConnection } from "./clients/stdio";
import { HttpConnection } from "./clients/http";

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

      case "http":
        return new HttpConnection(
          serverName,
          config as HttpServerConfig,
          options
        );

      default:
        throw new Error(`Unsupported transport type: ${(config as any).type}`);
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
   * Create an HTTP connection
   */
  createHttpConnection(
    serverName: string,
    config: HttpServerConfig,
    options: ConnectionOptions = {}
  ): HttpConnection {
    return new HttpConnection(serverName, config, options);
  }

  /**
   * Validate if a server configuration is supported
   */
  isConfigSupported(config: ServerConfig): boolean {
    return config.type === "stdio" || config.type === "http";
  }

  /**
   * Get supported transport types
   */
  getSupportedTransports(): string[] {
    return ["stdio", "http"];
  }
}
