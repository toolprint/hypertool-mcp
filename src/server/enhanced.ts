/**
 * Enhanced Meta-MCP server with request routing capabilities
 */

import { MetaMCPServer } from "./base";
import { MetaMCPServerConfig, ServerInitOptions } from "./types";
import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { IRequestRouter, RequestRouter } from "../router";
import { IToolDiscoveryEngine, ToolDiscoveryEngine } from "../discovery";
import { IConnectionManager, ConnectionManager } from "../connection";
import { MCPConfigParser } from "../config";

/**
 * Enhanced Meta-MCP server with routing capabilities
 */
export class EnhancedMetaMCPServer extends MetaMCPServer {
  private requestRouter?: IRequestRouter;
  private discoveryEngine?: IToolDiscoveryEngine;
  private connectionManager?: IConnectionManager;
  private configParser?: MCPConfigParser;
  private enableCallTool: boolean = false;

  constructor(config: MetaMCPServerConfig) {
    super(config);
  }

  /**
   * Enhanced start method with routing initialization
   */
  async start(options: ServerInitOptions): Promise<void> {
    this.enableCallTool = options.enableCallTool || false;

    if (this.enableCallTool) {
      await this.initializeRouting(options);
    }

    await super.start(options);
  }

  /**
   * Initialize routing components
   */
  private async initializeRouting(options: ServerInitOptions): Promise<void> {
    try {
      // Initialize config parser
      this.configParser = new MCPConfigParser();
      
      // Load configuration if path provided
      let serverConfigs = {};
      if (options.configPath) {
        const parseResult = await this.configParser.parseFile(options.configPath);
        if (parseResult.success && parseResult.config) {
          serverConfigs = parseResult.config.mcpServers || {};
        } else {
          console.warn("Failed to load MCP config:", parseResult.error || parseResult.validationErrors);
        }
      }

      // Initialize connection manager
      this.connectionManager = new ConnectionManager();
      await this.connectionManager.initialize(serverConfigs);

      // Initialize discovery engine
      this.discoveryEngine = new ToolDiscoveryEngine(this.connectionManager);
      await this.discoveryEngine.initialize({
        autoDiscovery: true,
        enableMetrics: true,
      });

      // Initialize request router
      this.requestRouter = new RequestRouter(
        this.discoveryEngine,
        this.connectionManager
      );
      await this.requestRouter.initialize({
        enableLogging: options.debug || false,
        enableMetrics: true,
      });

      // Start all services
      await this.connectionManager.start();
      await this.discoveryEngine.start();

      if (options.debug) {
        console.log("Request routing initialized successfully");
      }
    } catch (error) {
      console.error("Failed to initialize routing:", error);
      throw error;
    }
  }

  /**
   * Get available tools from discovery engine
   */
  protected async getAvailableTools(): Promise<Tool[]> {
    if (!this.enableCallTool || !this.discoveryEngine) {
      return [];
    }

    try {
      const discoveredTools = this.discoveryEngine.getAvailableTools(true);
      
      // Convert discovered tools to MCP Tool format
      return discoveredTools.map(tool => ({
        name: tool.namespacedName,
        description: tool.description || `Tool from ${tool.serverName} server`,
        inputSchema: {
          ...tool.schema,
          type: "object" as const,
        },
      }));
    } catch (error) {
      console.error("Failed to get available tools:", error);
      return [];
    }
  }

  /**
   * Handle tool call requests via request router
   */
  protected async handleToolCall(name: string, args?: any): Promise<any> {
    if (!this.enableCallTool || !this.requestRouter) {
      throw new Error("Tool calling is not enabled. Use --enable-call-tool flag to enable.");
    }

    try {
      const response = await this.requestRouter.routeToolCall({
        name,
        arguments: args,
      });

      return response;
    } catch (error) {
      console.error("Tool call failed:", error);
      throw error;
    }
  }

  /**
   * Enhanced stop method
   */
  async stop(): Promise<void> {
    try {
      // Stop routing services
      if (this.discoveryEngine) {
        await this.discoveryEngine.stop();
      }
      
      if (this.connectionManager) {
        await this.connectionManager.stop();
      }

      // Stop the base server
      await super.stop();
    } catch (error) {
      console.error("Error stopping enhanced server:", error);
      throw error;
    }
  }

  /**
   * Get routing statistics (if enabled)
   */
  getRoutingStats() {
    if (!this.requestRouter) {
      return null;
    }
    
    return {
      router: this.requestRouter.getStats(),
      discovery: this.discoveryEngine?.getStats(),
      connections: this.connectionManager?.status,
    };
  }
}