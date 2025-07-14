/**
 * Stdio client implementation for MCP servers using official MCP SDK
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { ListToolsResult } from "@modelcontextprotocol/sdk/types.js";
import { EventEmitter } from "events";
import { StdioServerConfig } from "../../types/config";
import { ConnectionOptions } from "../types";
import { BaseConnection } from "./base";

/**
 * Stdio client wrapper using proper MCP SDK Client
 */
export class StdioClient extends EventEmitter {
  private client: Client | null = null;
  private isConnected = false;

  constructor(private config: StdioServerConfig) {
    super();
  }

  get isRunning(): boolean {
    return this.isConnected && this.client !== null;
  }

  /**
   * Start the MCP server process using SDK Client
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      return;
    }

    try {
      const transport = new StdioClientTransport({
        command: this.config.command,
        args: this.config.args,
        env: this.config.env,
      });

      this.client = new Client({
        name: "meta-mcp-client",
        version: "1.0.0",
      }, {
        capabilities: {
          tools: {}
        }
      });

      await this.client.connect(transport);
      this.isConnected = true;
    } catch (error) {
      this.client = null;
      throw new Error(`Failed to start stdio client: ${(error as Error).message}`);
    }
  }

  /**
   * Stop the MCP server process
   */
  async stop(): Promise<void> {
    if (!this.client) {
      return;
    }

    try {
      await this.client.close();
    } catch (error) {
      console.error("Error closing stdio client:", error);
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
   * Ping the server to check if it's responsive
   */
  async ping(): Promise<boolean> {
    if (!this.isRunning) {
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
 * Stdio connection implementation
 */
export class StdioConnection extends BaseConnection<StdioClient> {
  protected _client: StdioClient | null = null;

  constructor(
    serverName: string,
    config: StdioServerConfig,
    options: ConnectionOptions = {}
  ) {
    super(serverName, config, options);
  }

  /**
   * Connect to the stdio server
   */
  protected async doConnect(): Promise<void> {
    this._client = new StdioClient(this.config as StdioServerConfig);

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

    await this._client.start();
  }

  /**
   * Disconnect from the stdio server
   */
  protected async doDisconnect(): Promise<void> {
    if (this._client) {
      await this._client.stop();
      this._client = null;
    }
  }

  /**
   * Ping the stdio server
   */
  protected async doPing(): Promise<boolean> {
    if (!this._client) {
      return false;
    }
    return await this._client.ping();
  }

}
