/**
 * HTTP client implementation for MCP servers using official MCP SDK
 */

import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { EventEmitter } from "events";
import { HttpServerConfig } from "../../types/config";
import { ConnectionOptions } from "../types";
import { BaseConnection } from "./base";
import { MCPMessage } from "./types";

/**
 * HTTP client wrapper for MCP SDK StreamableHTTPClientTransport
 */
export class HttpClient extends EventEmitter {
  private transport: StreamableHTTPClientTransport | null = null;
  private isConnected = false;

  constructor(private config: HttpServerConfig) {
    super();
  }

  get url(): string {
    return this.config.url;
  }

  /**
   * Connect to the HTTP server using SDK transport
   */
  async connect(): Promise<void> {
    if (this.isConnected) {
      return;
    }

    try {
      this.transport = new StreamableHTTPClientTransport(new URL(this.config.url));

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
      this.emit("connect");
    } catch (error) {
      this.transport = null;
      throw new Error(`Failed to start HTTP transport: ${(error as Error).message}`);
    }
  }

  /**
   * Disconnect from the HTTP server
   */
  async disconnect(): Promise<void> {
    if (!this.transport) {
      return;
    }

    try {
      await this.transport.close();
    } catch (error) {
      console.error("Error closing HTTP transport:", error);
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
    if (!this.isConnected) {
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