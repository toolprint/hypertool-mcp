/**
 * Stdio client implementation for MCP servers using official MCP SDK
 */

import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { EventEmitter } from "events";
import { StdioServerConfig } from "../../types/config";
import { ConnectionOptions } from "../types";
import { BaseConnection } from "./base";
import { MCPMessage } from "./types";

/**
 * Stdio client wrapper for MCP SDK StdioClientTransport
 */
export class StdioClient extends EventEmitter {
  private transport: StdioClientTransport | null = null;
  private isConnected = false;

  constructor(private config: StdioServerConfig) {
    super();
  }

  get isRunning(): boolean {
    return this.isConnected && this.transport !== null;
  }

  /**
   * Start the MCP server process using SDK transport
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      return;
    }

    try {
      this.transport = new StdioClientTransport({
        command: this.config.command,
        args: this.config.args,
        env: this.config.env,
      });

      // Setup event handlers
      this.transport.onmessage = (message) => {
        this.emit("message", message);
      };

      this.transport.onerror = (error) => {
        this.emit("error", error);
      };

      this.transport.onclose = () => {
        this.isConnected = false;
        this.emit("disconnect");
      };

      await this.transport.start();
      this.isConnected = true;
    } catch (error) {
      this.transport = null;
      throw new Error(`Failed to start stdio transport: ${(error as Error).message}`);
    }
  }

  /**
   * Stop the MCP server process
   */
  async stop(): Promise<void> {
    if (!this.transport) {
      return;
    }

    try {
      await this.transport.close();
    } catch (error) {
      console.error("Error closing stdio transport:", error);
    } finally {
      this.transport = null;
      this.isConnected = false;
    }
  }

  /**
   * Send a message to the MCP server
   */
  async send(message: MCPMessage): Promise<void> {
    if (!this.transport) {
      throw new Error("Transport not initialized");
    }

    // Convert MCPMessage to JSONRPCMessage format expected by the SDK
    if (!message.method) {
      throw new Error("Message must have a method field");
    }

    const jsonRpcMessage = {
      jsonrpc: "2.0" as const,
      id: message.id || Date.now(),
      method: message.method,
      params: message.params,
    };

    await this.transport.send(jsonRpcMessage);
  }

  /**
   * Ping the server to check if it's responsive
   */
  async ping(): Promise<boolean> {
    if (!this.isRunning) {
      return false;
    }

    try {
      const pingMessage: MCPMessage = {
        jsonrpc: "2.0",
        id: Date.now(),
        method: "ping",
      };

      await this.send(pingMessage);
      return true;
    } catch {
      return false;
    }
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

  /**
   * Get connection type
   */
  getType(): string {
    return "stdio";
  }
}
