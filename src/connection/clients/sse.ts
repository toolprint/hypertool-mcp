/**
 * SSE (Server-Sent Events) client implementation for MCP servers
 */

import { EventEmitter } from "events";
import { SSEServerConfig } from "../../types/config";
import { ConnectionOptions } from "../types";
import { BaseConnection } from "./base";
import {
  MCPMessage,
  ISSEClient,
  ClientOptions,
  DEFAULT_CLIENT_OPTIONS,
} from "./types";

/**
 * SSE client for communicating with MCP servers via HTTP/SSE
 */
export class SSEClient extends EventEmitter implements ISSEClient {
  private eventSource: EventSource | null = null;
  private options: Required<ClientOptions>;
  private pendingRequests = new Map<
    string | number,
    {
      resolve: (value: MCPMessage) => void;
      reject: (error: Error) => void;
      timeout: NodeJS.Timeout;
    }
  >();

  constructor(
    private config: SSEServerConfig,
    options: ClientOptions = {}
  ) {
    super();
    this.options = { ...DEFAULT_CLIENT_OPTIONS, ...options };
  }

  get isConnected(): boolean {
    return this.eventSource?.readyState === EventSource.OPEN;
  }

  get url(): string {
    return this.config.url;
  }

  /**
   * Connect to the SSE server
   */
  async connect(): Promise<void> {
    if (this.isConnected) {
      return;
    }

    return new Promise((resolve, reject) => {
      try {
        // Note: EventSource is not available in Node.js by default
        // This is a placeholder for where you would use a library like 'eventsource'
        // or implement your own SSE client

        this.eventSource = new (global as any).EventSource(this.config.url, {
          headers: this.config.headers,
        });

        this.setupEventSourceHandlers(resolve, reject);
      } catch (error) {
        reject(
          new Error(`Failed to create EventSource: ${(error as Error).message}`)
        );
      }
    });
  }

  /**
   * Disconnect from the SSE server
   */
  async disconnect(): Promise<void> {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }

    // Reject all pending requests
    for (const [, request] of this.pendingRequests) {
      clearTimeout(request.timeout);
      request.reject(new Error("Connection closed"));
    }
    this.pendingRequests.clear();

    this.emit("disconnect");
  }

  /**
   * Send a message to the MCP server and wait for response
   */
  async send(message: MCPMessage): Promise<MCPMessage> {
    if (!this.isConnected) {
      throw new Error("Not connected to server");
    }

    return new Promise((resolve, reject) => {
      if (!message.id) {
        reject(
          new Error("Message must have an ID for request-response pattern")
        );
        return;
      }

      // Setup timeout
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(message.id!);
        reject(new Error(`Request timeout after ${this.options.timeout}ms`));
      }, this.options.timeout);

      // Store the request
      this.pendingRequests.set(message.id, {
        resolve,
        reject,
        timeout,
      });

      // Send via HTTP POST (SSE is typically read-only, so we use HTTP for sending)
      this.sendViaHTTP(message).catch((error) => {
        this.pendingRequests.delete(message.id!);
        clearTimeout(timeout);
        reject(error);
      });
    });
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

  /**
   * Send message via HTTP POST
   */
  private async sendViaHTTP(message: MCPMessage): Promise<void> {
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
  }

  /**
   * Setup EventSource event handlers
   */
  private setupEventSourceHandlers(
    resolve: () => void,
    reject: (error: Error) => void
  ): void {
    if (!this.eventSource) {
      return;
    }

    let isResolved = false;

    this.eventSource.onopen = () => {
      if (!isResolved) {
        isResolved = true;
        resolve();
      }
    };

    this.eventSource.onerror = () => {
      const error = new Error("SSE connection error");

      if (!isResolved) {
        isResolved = true;
        reject(error);
      } else {
        this.emit("error", error);
      }
    };

    this.eventSource.onmessage = (event) => {
      try {
        const message: MCPMessage = JSON.parse(event.data);

        // Handle response to pending request
        if (message.id && this.pendingRequests.has(message.id)) {
          const request = this.pendingRequests.get(message.id)!;
          this.pendingRequests.delete(message.id);
          clearTimeout(request.timeout);
          request.resolve(message);
        } else {
          // Handle notification or unsolicited message
          this.emit("message", message);
        }
      } catch (error) {
        if (this.options.debug) {
          console.error("Failed to parse SSE message:", event.data, error);
        }
        this.emit("error", new Error(`Invalid JSON message: ${event.data}`));
      }
    };
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
   * Connect to the SSE server
   */
  protected async doConnect(): Promise<void> {
    this._client = new SSEClient(this.config as SSEServerConfig, {
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
    return await this._client.ping();
  }
}
