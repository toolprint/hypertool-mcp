/**
 * Request router implementation
 * Routes tool calls to appropriate underlying MCP servers
 */

import { EventEmitter } from "events";
import { v4 as uuidv4 } from "uuid";
import { CallToolRequest, CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import {
  IRequestRouter,
  ToolRoute,
  RouteContext,
  RoutingResult,
  RouterConfig,
  RouterStats,
  DEFAULT_ROUTER_CONFIG,
  ROUTER_ERROR_CODES,
} from "./types";
import { IToolDiscoveryEngine, DiscoveredTool } from "../discovery/types";
import { IConnectionManager } from "../connection/types";

/**
 * Request router implementation
 */
export class RequestRouter extends EventEmitter implements IRequestRouter {
  private config: Required<RouterConfig>;
  private discoveryEngine: IToolDiscoveryEngine;
  private connectionManager: IConnectionManager;
  private stats: RouterStats;
  private requestLog: Map<string, RouteContext> = new Map();

  constructor(
    discoveryEngine: IToolDiscoveryEngine,
    connectionManager: IConnectionManager
  ) {
    super();
    this.discoveryEngine = discoveryEngine;
    this.connectionManager = connectionManager;
    this.config = { ...DEFAULT_ROUTER_CONFIG };
    this.stats = this.createEmptyStats();
  }

  /**
   * Initialize the router with configuration
   */
  async initialize(config?: RouterConfig): Promise<void> {
    if (config) {
      this.config = { ...this.config, ...config };
    }

    this.log("Request router initialized", {
      config: this.config,
    });
  }

  /**
   * Route a tool call request to the appropriate server
   */
  async routeToolCall(
    request: CallToolRequest["params"],
    context?: Partial<RouteContext>
  ): Promise<CallToolResult> {
    const requestId = uuidv4();
    const routeContext: RouteContext = {
      requestId,
      timestamp: new Date(),
      request,
      clientInfo: context?.clientInfo,
    };

    const startTime = Date.now();

    try {
      // Store request context if logging is enabled
      if (this.config.enableLogging) {
        this.requestLog.set(requestId, routeContext);
      }

      this.log("Routing tool call", {
        requestId,
        toolName: request.name,
        arguments: request.arguments,
      });

      // Resolve tool route
      const routingResult = await this.resolveToolRoute(request.name);
      if (!routingResult.success || !routingResult.route) {
        throw new Error(
          `Failed to resolve tool route: ${routingResult.error?.message || "Unknown error"}`
        );
      }

      const route = routingResult.route;
      routeContext.route = route;

      // Validate request parameters if enabled
      if (this.config.validateParameters) {
        const isValid = await this.validateRequest(request, route.tool);
        if (!isValid) {
          throw new Error("Invalid request parameters");
        }
      }

      // Get connection to target server
      const connection = this.connectionManager.getConnection(route.serverName);
      if (!connection || !connection.isConnected()) {
        throw new Error(`Server '${route.serverName}' is not connected`);
      }

      // Make the tool call to the underlying server
      const response = await this.makeToolCall(connection, route, request);

      // Ensure the response has proper error flag for successful calls
      const result: CallToolResult = {
        ...response,
        isError: response.isError || false,
      };

      // Update statistics
      this.updateStats(true, route.serverName, Date.now() - startTime);

      this.log("Tool call completed successfully", {
        requestId,
        serverName: route.serverName,
        duration: Date.now() - startTime,
      });

      return result;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      // Update statistics
      this.updateStats(
        false,
        routeContext.route?.serverName,
        Date.now() - startTime
      );

      this.log("Tool call failed", {
        requestId,
        error: errorMessage,
        duration: Date.now() - startTime,
      });

      // For protocol-level errors, throw the error to be handled by MCP error mechanism
      // Only tool-level errors should use CallToolResult with isError: true
      throw error;
    } finally {
      // Clean up request context after some time
      if (this.config.enableLogging) {
        setTimeout(() => {
          this.requestLog.delete(requestId);
        }, 300000); // 5 minutes
      }
    }
  }

  /**
   * Resolve tool name to routing information
   */
  async resolveToolRoute(toolName: string): Promise<RoutingResult> {
    try {
      // Check if tool name is namespaced
      const separator = this.config.namespaceSeparator;
      const isNamespaced = toolName.includes(separator);

      // Find the tool using discovery engine
      const tool = await this.discoveryEngine.getToolByName(toolName);
      if (!tool) {
        return {
          success: false,
          error: {
            code: ROUTER_ERROR_CODES.TOOL_NOT_FOUND,
            message: `Tool '${toolName}' not found`,
          },
        };
      }

      // Verify server is connected
      if (!this.connectionManager.isServerConnected(tool.serverName)) {
        return {
          success: false,
          error: {
            code: ROUTER_ERROR_CODES.SERVER_NOT_CONNECTED,
            message: `Server '${tool.serverName}' is not connected`,
          },
        };
      }

      const route: ToolRoute = {
        originalName: toolName,
        resolvedName: tool.name,
        serverName: tool.serverName,
        tool,
        isNamespaced,
      };

      return {
        success: true,
        route,
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: ROUTER_ERROR_CODES.ROUTING_ERROR,
          message: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }

  /**
   * Validate request parameters against tool schema
   */
  async validateRequest(
    request: CallToolRequest["params"],
    tool: DiscoveredTool
  ): Promise<boolean> {
    try {
      const schema = tool.tool.inputSchema;
      const args = request.arguments || {};

      // Basic validation - check required fields
      if (schema.required) {
        for (const requiredField of schema.required) {
          if (!(requiredField in args)) {
            throw new Error(`Missing required parameter: ${requiredField}`);
          }
        }
      }

      // TODO: Add more sophisticated JSON schema validation
      // For now, just check that we have the required fields

      return true;
    } catch (error) {
      this.log("Parameter validation failed", {
        toolName: tool.name,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Make tool call to underlying server
   */
  private async makeToolCall(
    connection: any,
    route: ToolRoute,
    request: CallToolRequest["params"]
  ): Promise<CallToolResult> {
    try {
      // Use the underlying tool's original name for the call
      const toolCallArgs = {
        name: route.resolvedName,
        arguments: request.arguments,
      };

      // Make the call through the connection's client and return result directly
      return await connection.client.callTool(toolCallArgs);
    } catch (error) {
      throw new Error(
        `Tool call failed on server '${route.serverName}': ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Get router statistics
   */
  getStats(): RouterStats {
    return { ...this.stats };
  }

  /**
   * Clear router statistics
   */
  clearStats(): void {
    this.stats = this.createEmptyStats();
  }

  /**
   * Enable or disable request logging
   */
  setLogging(enabled: boolean): void {
    this.config.enableLogging = enabled;
    if (!enabled) {
      this.requestLog.clear();
    }
  }

  /**
   * Create empty statistics object
   */
  private createEmptyStats(): RouterStats {
    return {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      averageRequestTime: 0,
      requestsByServer: {},
      errorsByType: {},
    };
  }

  /**
   * Update statistics after a request
   */
  private updateStats(
    success: boolean,
    serverName?: string,
    duration: number = 0
  ): void {
    if (!this.config.enableMetrics) return;

    this.stats.totalRequests++;

    if (success) {
      this.stats.successfulRequests++;
    } else {
      this.stats.failedRequests++;
    }

    // Update average request time
    if (this.stats.totalRequests > 0) {
      this.stats.averageRequestTime =
        (this.stats.averageRequestTime * (this.stats.totalRequests - 1) +
          duration) /
        this.stats.totalRequests;
    }

    // Update server-specific stats
    if (serverName) {
      this.stats.requestsByServer[serverName] =
        (this.stats.requestsByServer[serverName] || 0) + 1;
    }
  }

  /**
   * Log message if logging is enabled
   */
  private log(message: string, data?: any): void {
    if (this.config.enableLogging) {
      const logEntry = {
        timestamp: new Date().toISOString(),
        component: "RequestRouter",
        message,
        ...(data && { data }),
      };

      // Emit log event for external loggers
      this.emit("log", logEntry);

      // Simple console logging for now
      console.log(JSON.stringify(logEntry));
    }
  }
}
