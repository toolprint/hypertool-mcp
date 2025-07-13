/**
 * Express.js HTTP server for streamable MCP transport
 */

import express, { Express, Request, Response } from "express";
import { Server as HttpServer } from "http";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";

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

  constructor(mcpServer: Server, port: number = 3000, host: string = "localhost") {
    this.app = express();
    this.mcpServer = mcpServer;
    this.port = port;
    this.host = host;
    this.setupMiddleware();
    this.setupRoutes();
  }

  /**
   * Setup Express middleware
   */
  private setupMiddleware(): void {
    // Enable JSON parsing
    this.app.use(express.json());
    
    // Enable CORS for development
    this.app.use((req, res, next) => {
      res.header("Access-Control-Allow-Origin", "*");
      res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
      
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
    this.app.get("/health", (req: Request, res: Response) => {
      res.json({ 
        status: "healthy", 
        transport: "http",
        timestamp: new Date().toISOString()
      });
    });

    // MCP endpoint for streamable HTTP transport
    this.app.post("/mcp", async (req: Request, res: Response) => {
      try {
        await this.handleMcpRequest(req, res);
      } catch (error) {
        console.error("Error handling MCP request:", error);
        res.status(500).json({ 
          error: "Internal server error",
          message: error instanceof Error ? error.message : "Unknown error"
        });
      }
    });

    // Fallback for unsupported routes
    this.app.use((req: Request, res: Response) => {
      res.status(404).json({ 
        error: "Not found",
        message: `Route ${req.method} ${req.path} not found`
      });
    });
  }

  /**
   * Handle MCP protocol requests over HTTP
   */
  private async handleMcpRequest(req: Request, res: Response): Promise<void> {
    // Set headers for streamable response
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "no-cache");
    
    // For now, implement basic JSON-RPC handling
    // This will be enhanced to support full MCP protocol streaming
    const mcpRequest = req.body;
    
    if (!mcpRequest || typeof mcpRequest !== "object") {
      res.status(400).json({
        error: "Invalid request",
        message: "Request body must be a valid JSON object"
      });
      return;
    }

    // Validate basic JSON-RPC structure
    if (!mcpRequest.jsonrpc || !mcpRequest.method) {
      res.status(400).json({
        error: "Invalid JSON-RPC request",
        message: "Request must include jsonrpc and method fields"
      });
      return;
    }

    // Echo the request for now - this will be replaced with actual MCP handling
    res.json({
      jsonrpc: "2.0",
      id: mcpRequest.id || null,
      result: {
        message: "MCP request received",
        echo: mcpRequest
      }
    });
  }

  /**
   * Start the HTTP server
   */
  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.httpServer = this.app.listen(this.port, this.host, () => {
          console.log(`MCP HTTP server listening on http://${this.host}:${this.port}`);
          console.log(`MCP endpoint available at: http://${this.host}:${this.port}/mcp`);
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
}