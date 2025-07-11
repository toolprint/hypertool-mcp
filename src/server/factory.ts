/**
 * Server factory for creating Meta-MCP server instances
 */

import { MetaMCPServer } from "./base";
import { EnhancedMetaMCPServer } from "./enhanced";
import {
  MetaMCPServerConfig,
  ServerInitOptions,
  TransportConfig,
} from "./types";

/**
 * Factory class for creating Meta-MCP server instances
 */
export class MetaMCPServerFactory {
  /**
   * Create a new Meta-MCP server instance
   */
  static createServer(config: MetaMCPServerConfig): MetaMCPServer {
    return new MetaMCPServer(config);
  }

  /**
   * Create server with default configuration
   */
  static createDefaultServer(
    transport: TransportConfig
  ): EnhancedMetaMCPServer {
    const config: MetaMCPServerConfig = {
      name: "meta-mcp",
      version: "1.0.0",
      description:
        "Meta-MCP proxy server for routing requests between clients and multiple underlying MCP servers",
      transport,
    };

    return new EnhancedMetaMCPServer(config);
  }

  /**
   * Create server initialization options
   */
  static createInitOptions(
    overrides: Partial<ServerInitOptions> = {}
  ): ServerInitOptions {
    return {
      transport: {
        type: "stdio",
        ...overrides.transport,
      },
      debug: false,
      ...overrides,
    };
  }
}
