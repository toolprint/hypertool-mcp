/**
 * HTTP client implementation for MCP servers
 */

import { EventEmitter } from "events";
import { HttpServerConfig } from "../../types/config";
import { ConnectionOptions } from "../types";
import { BaseConnection } from "./base";
import {
  MCPMessage,
  IHttpClient,
  ClientOptions,
  DEFAULT_CLIENT_OPTIONS,
} from "./types";

/**
 * HTTP client for communicating with MCP servers via HTTP
 */
export class HttpClient extends EventEmitter implements IHttpClient {
  private options: Required<ClientOptions>;
  private isConnectedState = false;

  constructor(
    private config: HttpServerConfig,
    options: ClientOptions = {}
  ) {
    super();
    this.options = { ...DEFAULT_CLIENT_OPTIONS, ...options };
  }

  get isConnected(): boolean {
    return this.isConnectedState;
  }

  get url(): string {
    return this.config.url;
  }

  /**
   * Connect to the HTTP server
   */
  async connect(): Promise<void> {
    if (this.isConnected) {
      return;
    }

    try {
      // Test connection with a simple health check or ping
      const response = await fetch(this.config.url + '/health', {
        method: 'GET',
        headers: this.config.headers,
      });

      if (response.ok) {
        this.isConnectedState = true;
        this.emit('connect');
      } else {
        throw new Error(`HTTP server returned status: ${response.status}`);
      }
    } catch (error) {
      throw new Error(`Failed to connect to HTTP server: ${(error as Error).message}`);
    }
  }

  /**
   * Disconnect from the HTTP server
   */
  async disconnect(): Promise<void> {
    this.isConnectedState = false;
    this.emit("disconnect");
  }

  /**
   * Send a message to the MCP server and wait for response
   */
  async send(message: MCPMessage): Promise<MCPMessage> {
    if (!this.isConnected) {
      throw new Error("Not connected to server");
    }

    try {
      const response = await fetch(this.config.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...this.config.headers,
        },
        body: JSON.stringify(message),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const responseData = await response.json();
      return responseData as MCPMessage;
    } catch (error) {
      throw new Error(`Failed to send message: ${(error as Error).message}`);
    }
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
    this._client = new HttpClient(this.config as HttpServerConfig, {
      timeout: this.options.connectionTimeout,
      debug: this.options.debug,
    });

    // Forward client events
    this._client.on("error", (error) => {
      this.emit("error", this.createEvent("error", { error }));
    });

    this._client.on("disconnect", () => {
      this.emit("disconnected", this.createEvent("disconnected"));
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