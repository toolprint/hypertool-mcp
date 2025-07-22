/**
 * HTTP client implementation for MCP servers using official MCP SDK
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import {
  ListToolsResult,
  CallToolRequest,
} from "@modelcontextprotocol/sdk/types.js";
import { EventEmitter } from "events";
import { HttpServerConfig } from "../../types/config.js";
import { ConnectionOptions } from "../types.js";
import { BaseConnection } from "./base.js";
import { createChildLogger } from "../../utils/logging.js";

const logger = createChildLogger({ module: "clients/http" });

/**
 * HTTP client wrapper using proper MCP SDK Client
 */
export class HttpClient extends EventEmitter {
  private client: Client | null = null;
  private isConnected = false;

  constructor(private config: HttpServerConfig) {
    super();
  }

  get url(): string {
    return this.config.url;
  }

  /**
   * Connect to the HTTP server using SDK Client
   */
  async connect(): Promise<void> {
    if (this.isConnected) {
      return;
    }

    try {
      const transport = new StreamableHTTPClientTransport(
        new URL(this.config.url)
      );
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
      this.emit("connect");
    } catch (error) {
      this.client = null;
      throw new Error(
        `Failed to connect HTTP client: ${(error as Error).message}`
      );
    }
  }

  /**
   * Disconnect from the HTTP server
   */
  async disconnect(): Promise<void> {
    if (!this.client) {
      return;
    }

    try {
      await this.client.close();
    } catch (error) {
      logger.error("Error closing HTTP client:", error);
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
   * Ping the server to check if it's responsive
   */
  async ping(): Promise<boolean> {
    if (!this.isConnected) {
      return false;
    }

    try {
      await this.listTools();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get the SDK client instance for advanced operations
   */
  get sdkClient(): Client | null {
    return this.client;
  }
}

/**
 * HTTP connection implementation
 */
export class HttpConnection extends BaseConnection<HttpClient> {
  protected _client: HttpClient | null = null;

  constructor(
    serverName: string,
    config: HttpServerConfig,
    options: ConnectionOptions = {}
  ) {
    super(serverName, config, options);
  }

  /**
   * Connect to the HTTP server
   */
  protected async doConnect(): Promise<void> {
    this._client = new HttpClient(this.config as HttpServerConfig);

    // Forward client events
    this._client.on("error", (error) => {
      this.emit("error", this.createEvent("error", { error }));
    });

    this._client.on("disconnect", () => {
      this.emit("disconnected", this.createEvent("disconnected"));
    });

    this._client.on("message", (message) => {
      this.emit("message", message);
    });

    await this._client.connect();
  }

  /**
   * Disconnect from the HTTP server
   */
  protected async doDisconnect(): Promise<void> {
    if (this._client) {
      await this._client.disconnect();
      this._client = null;
    }
  }

  /**
   * Ping the HTTP server
   */
  protected async doPing(): Promise<boolean> {
    if (!this._client) {
      return false;
    }
    return await this._client.ping();
  }
}
