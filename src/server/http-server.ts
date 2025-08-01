/**
 * Express.js HTTP server for streamable MCP transport
 */

import express, { Express, Request, Response } from "express";
import { Server as HttpServer } from "http";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { randomUUID } from "node:crypto";
import {
  isInitializeRequest,
  Notification,
} from "@modelcontextprotocol/sdk/types.js";
import { createChildLogger } from "../utils/logging.js";
import { output } from "../utils/output.js";
// import chalk from "chalk";
import { APP_TECHNICAL_NAME } from "../config/appConfig.js";

const logger = createChildLogger({ module: "server/http-server" });

/**
 * Express.js-based HTTP server for MCP protocol with streamable transport
 * Implements /mcp endpoint for bidirectional communication
 */
export class McpHttpServer {
  private app: Express;
  private httpServer: HttpServer | null = null;
  private mcpServer: Server;
  private port: number;
  private host: string;
  private transports: Record<string, StreamableHTTPServerTransport> = {};
  private connectionString: string;

  constructor(
    mcpServer: Server,
    port: number = 3000,
    host: string = "localhost"
  ) {
    this.app = express();
    this.mcpServer = mcpServer;
    this.port = port;
    this.host = host;
    this.setupMiddleware();
    this.setupRoutes();
    this.connectionString = `http://${this.host}:${this.port}/mcp`;
  }

  /**
   * Setup Express middleware
   */
  private setupMiddleware(): void {
    // Enable JSON parsing
    this.app.use(express.json());

    // Enable CORS for development with MCP session support
    this.app.use((req, res, next) => {
      res.header("Access-Control-Allow-Origin", "*");
      res.header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
      res.header(
        "Access-Control-Allow-Headers",
        "Content-Type, Authorization, Mcp-Session-Id"
      );
      res.header("Access-Control-Expose-Headers", "Mcp-Session-Id");

      if (req.method === "OPTIONS") {
        res.sendStatus(200);
        return;
      }

      next();
    });
  }

  /**
   * Setup Express routes
   */
  private setupRoutes(): void {
    // Health check endpoint
    this.app.get("/health", (_req: Request, res: Response) => {
      res.json({
        status: "healthy",
        transport: "http",
        timestamp: new Date().toISOString(),
      });
    });

    // MCP endpoint for streamable HTTP transport - handle all methods
    this.app.all("/mcp", async (req: Request, res: Response) => {
      try {
        await this.handleMcpRequest(req, res);
      } catch (error) {
        logger.error("Error handling MCP request:", error);
        if (!res.headersSent) {
          res.status(500).json({
            jsonrpc: "2.0",
            error: {
              code: -32603,
              message: "Internal server error",
            },
            id: null,
          });
        }
      }
    });

    // Fallback for unsupported routes
    this.app.use((req: Request, res: Response) => {
      res.status(404).json({
        error: "Not found",
        message: `Route ${req.method} ${req.path} not found`,
      });
    });
  }

  /**
   * Handle MCP protocol requests over HTTP using Streamable HTTP Transport
   */
  private async handleMcpRequest(req: Request, res: Response): Promise<void> {
    logger.info(`Received ${req.method} request to /mcp`);

    // Check for existing session ID
    const sessionId = req.headers["mcp-session-id"] as string;
    let transport: StreamableHTTPServerTransport;

    if (sessionId && this.transports[sessionId]) {
      // Reuse existing transport
      transport = this.transports[sessionId];
    } else if (
      !sessionId &&
      req.method === "POST" &&
      isInitializeRequest(req.body)
    ) {
      // Create new transport for initialization request
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (sessionId) => {
          logger.info(
            `Streamable HTTP session initialized with ID: ${sessionId}`
          );
          this.transports[sessionId] = transport;
        },
      });

      // Set up cleanup when transport closes
      transport.onclose = () => {
        const sid = transport.sessionId;
        if (sid && this.transports[sid]) {
          logger.info(
            `Transport closed for session ${sid}, removing from transports map`
          );
          delete this.transports[sid];
        }
      };

      // Connect the transport to the MCP server
      await this.mcpServer.connect(transport);
    } else {
      // Invalid request - no session ID or not initialization request
      res.status(400).json({
        jsonrpc: "2.0",
        error: {
          code: -32000,
          message:
            "Bad Request: No valid session ID provided or not an initialization request",
        },
        id: null,
      });
      return;
    }

    // Handle the request with the transport
    await transport.handleRequest(req, res, req.body);
  }

  /**
   * Start the HTTP server
   */
  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.httpServer = this.app.listen(this.port, this.host, () => {
          output.displaySeparator();
          output.displaySubHeader(
            `Connect to ${APP_TECHNICAL_NAME} Instructions\n`
          );
          output.displayHelpContext(`Server available on [http]`);
          output.displayInstruction(
            `http://${this.host}:${this.port}/mcp`,
            true
          );
          output.displaySpaceBuffer();
          output.displayHelpContext(`Connect using MCP Inspector`);
          output.displayInstruction(
            `npx @modelcontextprotocol/inspector`,
            true
          );
          output.displaySpaceBuffer();
          output.displayHelpContext(`Add this to your MCP config:`);
          output.displayInstruction(
            JSON.stringify(
              {
                "hypertool": {
                  type: "streamable-http",
                  url: this.connectionString,
                },
              },
              null,
              2
            ),
            true
          );
          resolve();
        });

        this.httpServer.on("error", (error) => {
          reject(error);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Stop the HTTP server
   */
  async stop(): Promise<void> {
    // Close all active transports
    for (const sessionId in this.transports) {
      try {
        logger.info(`Closing transport for session ${sessionId}`);
        await this.transports[sessionId].close();
        delete this.transports[sessionId];
      } catch (error) {
        logger.error(
          `Error closing transport for session ${sessionId}:`,
          error
        );
      }
    }

    if (this.httpServer) {
      return new Promise<void>((resolve) => {
        this.httpServer!.close(() => {
          this.httpServer = null;
          resolve();
        });
      });
    }
  }

  /**
   * Get server instance for testing or advanced configuration
   */
  getApp(): Express {
    return this.app;
  }

  /**
   * Get the HTTP server instance
   */
  getHttpServer(): HttpServer | null {
    return this.httpServer;
  }

  /**
   * Check if server is running
   */
  isRunning(): boolean {
    return this.httpServer !== null && this.httpServer.listening;
  }

  /**
   * Broadcast notification to all connected clients
   */
  async broadcastNotification(notification: Notification): Promise<void> {
    const sessionIds = Object.keys(this.transports);
    logger.info(
      `Broadcasting notification to ${sessionIds.length} connected sessions`
    );
    await this.mcpServer.notification(notification);
  }
}
