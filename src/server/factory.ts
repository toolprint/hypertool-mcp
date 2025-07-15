/**
 * Server factory for creating Hypertool MCP server instances
 */

import { MetaMCPServer } from "./base.js";
import { EnhancedMetaMCPServer } from "./enhanced.js";
import {
  MetaMCPServerConfig,
  ServerInitOptions,
  TransportConfig,
} from "./types.js";
import { APP_NAME, APP_VERSION, APP_DESCRIPTION } from "../config/appConfig.js";

/**
 * Factory class for creating Hypertool MCP server instances
 */
export class MetaMCPServerFactory {
  /**
   * Create a new Hypertool MCP server instance
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
      name: APP_NAME,
      version: APP_VERSION,
      description: APP_DESCRIPTION,
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
