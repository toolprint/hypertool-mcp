/**
 * SSE client implementation for connecting to external MCP servers using official MCP SDK
 * This is used when the Meta-MCP server acts as a CLIENT to SSE-based MCP servers (like Context7)
 */

import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { EventEmitter } from "events";
import { BaseConnection } from "./base";
import { SSEServerConfig } from "../../types/config";
import { MCPMessage } from "./types";
import { ConnectionOptions } from "../types";

/**
 * SSE client wrapper for MCP SDK SSEClientTransport
 */
export class SSEClient extends EventEmitter {
  private transport: SSEClientTransport | null = null;
  private isConnected = false;

  constructor(private config: SSEServerConfig) {
    super();
  }

  /**
   * Connect to the SSE-based MCP server using SDK transport
   */
  async connect(): Promise<void> {
    if (this.isConnected) {
      return;
    }

    try {
      this.transport = new SSEClientTransport(new URL(this.config.url));

      // Setup event handlers
      this.transport.onmessage = (message) => {
        this.emit("message", message);
      };

      this.transport.onerror = (error) => {
        this.emit("error", error);
      };

      this.transport.onclose = () => {
        this.isConnected = false;
        this.emit("disconnected");
      };

      await this.transport.start();
      this.isConnected = true;
      this.emit("connected");
    } catch (error) {
      this.transport = null;
      throw new Error(`Failed to start SSE transport: ${(error as Error).message}`);
    }
  }

  /**
   * Disconnect from the SSE server
   */
  async disconnect(): Promise<void> {
    if (!this.transport) {
      return;
    }

    try {
      await this.transport.close();
    } catch (error) {
      console.error("Error closing SSE transport:", error);
    } finally {
      this.transport = null;
      this.isConnected = false;
    }
  }

  /**
   * Send message to SSE server
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
      const pingMessage: MCPMessage = {
        jsonrpc: "2.0",
        id: Date.now(),
        method: "ping",
      };

      await this._client.send(pingMessage);
      return true;
    } catch {
      return false;
    }
  }

}