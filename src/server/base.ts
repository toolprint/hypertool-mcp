/**
 * Base Hypertool MCP server implementation
 * Provides core MCP server functionality with transport abstraction
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createLogger } from "../logging/index.js";

const logger = createLogger({ module: "server/base" });
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  Tool,
  Notification,
} from "@modelcontextprotocol/sdk/types.js";
import {
  MetaMCPServerConfig,
  ServerInitOptions,
  ServerState,
  ServerStatus,
} from "./types.js";
import { EventEmitter } from "events";
import { McpHttpServer } from "./http-server.js";

/**
 * Base Hypertool MCP server class
 * Handles MCP protocol implementation with pluggable transport layer
 */
export class MetaMCPServer extends EventEmitter {
  private server: Server;
  private stdioTransport: StdioServerTransport | null = null;
  private httpServer?: McpHttpServer;
  private config: MetaMCPServerConfig;
  private state: ServerState = ServerState.STOPPED;
  private startTime?: Date;
  private connectedClients: number = 0;

  constructor(config: MetaMCPServerConfig) {
    super();
    this.config = config;

    // Initialize MCP server
    this.server = new Server(
      {
        name: config.name,
        version: config.version,
        description: config.description,
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupHandlers();
  }

  /**
   * Setup MCP protocol handlers
   */
  private setupHandlers(): void {
    // Handle list_tools requests
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: await this.getAvailableTools(),
      };
    });

    // Handle call_tool requests
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      return await this.handleToolCall(
        request.params.name,
        request.params.arguments
      );
    });
  }

  /**
   * Get available tools from underlying servers
   * To be implemented by subclasses
   */
  protected async getAvailableTools(): Promise<Tool[]> {
    return [];
  }

  /**
   * Handle tool call requests
   * To be implemented by subclasses
   */
  protected async handleToolCall(
    name: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _args?: unknown
  ): Promise<any> {
    throw new Error(`Tool "${name}" not implemented`);
  }

  /**
   * Initialize and start the server
   */
  async start(options: ServerInitOptions): Promise<void> {
    if (this.state !== ServerState.STOPPED) {
      throw new Error(`Server is already ${this.state}`);
    }

    try {
      this.setState(ServerState.STARTING);
      this.startTime = new Date();

      // Initialize transport layer
      if (options.transport.type === "stdio") {
        this.stdioTransport = new StdioServerTransport();
        await this.server.connect(this.stdioTransport);
      } else if (options.transport.type === "http") {
        await this.setupHttpServer(options.transport);
      } else {
        throw new Error(
          `Unsupported transport type: ${options.transport.type}`
        );
      }

      this.setState(ServerState.RUNNING);
      this.emit("started");
    } catch (error) {
      this.setState(ServerState.ERROR);
      this.emit("error", error);
      throw error;
    }
  }

  /**
   * Setup Express.js HTTP server for streamable MCP transport
   */
  private async setupHttpServer(transport: {
    host?: string;
    port?: number;
  }): Promise<void> {
    const host = transport.host || "localhost";
    const port = transport.port || 3000;

    this.httpServer = new McpHttpServer(this.server, port, host);
    await this.httpServer.start();
    this.onClientConnected();
  }

  /**
   * Stop the server
   */
  async stop(): Promise<void> {
    if (this.state === ServerState.STOPPED) {
      return;
    }

    try {
      this.setState(ServerState.STOPPING);

      if (this.stdioTransport) {
        await this.stdioTransport.close();
        this.stdioTransport = null;
      }

      if (this.httpServer) {
        await this.httpServer.stop();
        this.httpServer = undefined;
      }

      this.setState(ServerState.STOPPED);
      this.emit("stopped");
    } catch (error) {
      this.setState(ServerState.ERROR);
      this.emit("error", error);
      throw error;
    }
  }

  /**
   * Get current server status
   */
  getStatus(): ServerStatus {
    const status: ServerStatus = {
      state: this.state,
      connectedClients: this.connectedClients,
    };

    if (this.startTime && this.state === ServerState.RUNNING) {
      status.uptime = Date.now() - this.startTime.getTime();
    }

    return status;
  }

  /**
   * Get server configuration
   */
  getConfig(): MetaMCPServerConfig {
    return { ...this.config };
  }

  /**
   * Send tools list changed notification to clients
   */
  protected async notifyToolsChanged(): Promise<void> {
    if (!this.server) {
      return;
    }

    const toolsChangedNotification: Notification = {
      method: "notifications/tools/list_changed",
    };

    try {
      logger.info("Sending tools list changed notification");

      if (this.stdioTransport) {
        // stdio transport - send to single client
        await this.server.notification(toolsChangedNotification);
        logger.debug(
          "Tools list changed notification sent via stdio transport"
        );
      } else if (this.httpServer) {
        // HTTP transport - broadcast to all connected clients
        await this.httpServer.broadcastNotification(toolsChangedNotification);
        logger.debug(
          "Tools list changed notification broadcasted via HTTP transport"
        );
      }
    } catch (error) {
      logger.error("Failed to send tools list changed notification:", error);
    }
  }

  /**
   * Set server state and emit event
   */
  private setState(state: ServerState): void {
    const oldState = this.state;
    this.state = state;
    this.emit("stateChanged", { from: oldState, to: state });
  }

  /**
   * Handle client connection events
   */
  protected onClientConnected(): void {
    this.connectedClients++;
    this.emit("clientConnected", { count: this.connectedClients });
  }

  /**
   * Handle client disconnection events
   */
  protected onClientDisconnected(): void {
    this.connectedClients = Math.max(0, this.connectedClients - 1);
    this.emit("clientDisconnected", { count: this.connectedClients });
  }
}
