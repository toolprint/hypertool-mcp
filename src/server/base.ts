/**
 * Base Meta-MCP server implementation
 * Provides core MCP server functionality with transport abstraction
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import {
  MetaMCPServerConfig,
  ServerInitOptions,
  ServerState,
  ServerStatus,
} from "./types";
import { EventEmitter } from "events";
import { createServer } from "http";

/**
 * Base Meta-MCP server class
 * Handles MCP protocol implementation with pluggable transport layer
 */
export class MetaMCPServer extends EventEmitter {
  private server: Server;
  private transport: StdioServerTransport | SSEServerTransport | null = null;
  private httpServer?: ReturnType<typeof createServer>;
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
  protected async handleToolCall(name: string, args?: any): Promise<any> {
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
        this.transport = new StdioServerTransport();
      } else if (options.transport.type === "sse") {
        await this.setupHttpServer(options.transport);
      } else {
        throw new Error(
          `Unsupported transport type: ${options.transport.type}`
        );
      }

      // Connect server to transport
      if (this.transport) {
        await this.server.connect(this.transport);
      }

      this.setState(ServerState.RUNNING);
      this.emit("started");

      if (options.debug) {
        console.log(
          `Meta-MCP server started with ${options.transport.type} transport`
        );
      }
    } catch (error) {
      this.setState(ServerState.ERROR);
      this.emit("error", error);
      throw error;
    }
  }

  /**
   * Setup HTTP server for SSE transport
   */
  private async setupHttpServer(transport: {
    host?: string;
    port?: number;
  }): Promise<void> {
    const host = transport.host || "localhost";
    const port = transport.port || 3000;

    this.httpServer = createServer((req, res) => {
      const url = new URL(req.url || "", `http://${host}:${port}`);

      if (req.method === "GET" && url.pathname === "/sse") {
        // SSE connection
        this.transport = new SSEServerTransport("/message", res);
        this.transport.start();
        this.onClientConnected();
      } else if (req.method === "POST" && url.pathname === "/message") {
        // Handle POST messages
        if (this.transport instanceof SSEServerTransport) {
          this.transport.handlePostMessage(req, res);
        }
      } else {
        res.writeHead(404);
        res.end("Not found");
      }
    });

    return new Promise((resolve, reject) => {
      this.httpServer!.listen(port, host, () => {
        resolve();
      });
      this.httpServer!.on("error", reject);
    });
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

      if (this.transport) {
        await this.transport.close();
        this.transport = null;
      }

      if (this.httpServer) {
        await new Promise<void>((resolve) => {
          this.httpServer!.close(() => resolve());
        });
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
