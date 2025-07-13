/**
 * SSE client implementation for connecting to external MCP servers
 * This is used when the Meta-MCP server acts as a CLIENT to SSE-based MCP servers (like Context7)
 */

import { EventEmitter } from "events";
import { BaseConnection } from "./base";
import { SSEServerConfig } from "../../types/config";
import { MCPMessage } from "./types";
import { ConnectionOptions } from "../types";

/**
 * Low-level SSE client for MCP communication
 */
export class SSEClient extends EventEmitter {
  private eventSource?: EventSource;
  private config: SSEServerConfig;

  constructor(config: SSEServerConfig) {
    super();
    this.config = config;
  }

  /**
   * Connect to the SSE-based MCP server
   */
  async connect(): Promise<void> {
    try {
      // Create EventSource for SSE connection
      this.eventSource = new EventSource(this.config.url, {
        headers: this.config.headers || {},
      } as any);

      // Setup event listeners
      this.eventSource.onopen = () => {
        this.emit("connected");
      };

      this.eventSource.onmessage = (event) => {
        try {
          const message: MCPMessage = JSON.parse(event.data);
          this.emit("message", message);
        } catch (error) {
          this.emit("error", new Error(`Failed to parse SSE message: ${error}`));
        }
      };

      this.eventSource.onerror = (error) => {
        this.emit("error", new Error(`SSE connection error: ${error}`));
      };

      // Wait for connection to be established
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error("SSE connection timeout"));
        }, 10000);

        this.once("connected", () => {
          clearTimeout(timeout);
          resolve();
        });

        this.once("error", (error) => {
          clearTimeout(timeout);
          reject(error);
        });
      });
    } catch (error) {
      throw error;
    }
  }

  /**
   * Disconnect from the SSE server
   */
  async disconnect(): Promise<void> {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = undefined;
    }
    this.emit("disconnected");
  }

  /**
   * Send message to SSE server (via POST to companion endpoint)
   */
  async send(message: MCPMessage): Promise<void> {
    try {
      // For SSE, we typically POST messages to a companion endpoint
      const postUrl = this.config.url.replace("/sse", "/message");
      
      const response = await fetch(postUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...this.config.headers,
        },
        body: JSON.stringify(message),
      });

      if (!response.ok) {
        throw new Error(`SSE POST failed: ${response.status} ${response.statusText}`);
      }
    } catch (error) {
      this.emit("error", error);
      throw error;
    }
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

  /**
   * Get connection type
   */
  getType(): string {
    return "sse";
  }
}