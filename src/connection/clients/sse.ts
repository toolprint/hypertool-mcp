/**
 * SSE client implementation for connecting to external MCP servers using official MCP SDK
 * This is used when the Meta-MCP server acts as a CLIENT to SSE-based MCP servers (like Context7)
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import {
  ListToolsResult,
  CallToolRequest,
} from "@modelcontextprotocol/sdk/types.js";
import { EventEmitter } from "events";
import { BaseConnection } from "./base.js";
import { SSEServerConfig } from "../../types/config.js";
import { ConnectionOptions } from "../types.js";
import { createLogger } from "../../logging/index.js";

const logger = createLogger({ module: "clients/sse" });

/**
 * SSE client wrapper using proper MCP SDK Client
 */
export class SSEClient extends EventEmitter {
  private client: Client | null = null;
  private isConnected = false;

  constructor(private config: SSEServerConfig) {
    super();
  }

  /**
   * Connect to the SSE-based MCP server using SDK Client
   */
  async connect(): Promise<void> {
    if (this.isConnected) {
      return;
    }

    try {
      const transport = new SSEClientTransport(new URL(this.config.url));
      this.client = new Client(
        {
          name: "hypertool-mcp-client",
          version: "1.0.0",
        },
        {
          capabilities: {
            tools: {},
          },
        }
      );

      await this.client.connect(transport);
      this.isConnected = true;
      this.emit("connected");
    } catch (error) {
      this.client = null;
      throw new Error(
        `Failed to connect SSE client: ${(error as Error).message}`
      );
    }
  }

  /**
   * Disconnect from the SSE server
   */
  async disconnect(): Promise<void> {
    if (!this.client) {
      return;
    }

    try {
      await this.client.close();
    } catch (error) {
      logger.error("Error closing SSE client:", error);
    } finally {
      this.client = null;
      this.isConnected = false;
    }
  }

  /**
   * List tools from the MCP server
   */
  async listTools(): Promise<ListToolsResult> {
    if (!this.client) {
      throw new Error("Client not connected");
    }

    return await this.client.listTools();
  }

  /**
   * Call a tool on the MCP server
   */
  async callTool(params: CallToolRequest["params"]): Promise<any> {
    if (!this.client) {
      throw new Error("Client not connected");
    }

    return await this.client.callTool(params);
  }

  /**
   * Get the SDK client instance for advanced operations
   */
  get sdkClient(): Client | null {
    return this.client;
  }
}

/**
 * SSE connection implementation
 */
export class SSEConnection extends BaseConnection<SSEClient> {
  protected _client: SSEClient | null = null;

  constructor(
    serverName: string,
    config: SSEServerConfig,
    options: ConnectionOptions = {}
  ) {
    super(serverName, config, options);
  }

  /**
   * Create and return SSE client
   */
  protected createClient(): SSEClient {
    return new SSEClient(this.config as SSEServerConfig);
  }

  /**
   * Connect to the SSE server
   */
  protected async doConnect(): Promise<void> {
    this._client = new SSEClient(this.config as SSEServerConfig);

    // Forward client events
    this._client.on("error", (error) => {
      this.emit("error", this.createEvent("error", { error }));
    });

    this._client.on("disconnected", () => {
      this.emit("disconnected", this.createEvent("disconnected"));
    });

    this._client.on("message", (message) => {
      this.emit("message", message);
    });

    await this._client.connect();
  }

  /**
   * Disconnect from the SSE server
   */
  protected async doDisconnect(): Promise<void> {
    if (this._client) {
      await this._client.disconnect();
      this._client = null;
    }
  }

  /**
   * Ping the SSE server
   */
  protected async doPing(): Promise<boolean> {
    if (!this._client) {
      return false;
    }

    try {
      // Use SDK client to ping - may not have a direct ping method,
      // so we can try listing tools as a health check
      await this._client.listTools();
      return true;
    } catch {
      return false;
    }
  }
}
