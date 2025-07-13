/**
 * TypeScript interfaces for request routing
 */

import { DiscoveredTool } from "../discovery/types";

/**
 * Tool call request from MCP client
 */
export interface ToolCallRequest {
  name: string;
  arguments?: Record<string, any>;
}

/**
 * Tool call response to MCP client
 */
export interface ToolCallResponse {
  content: Array<{
    type: "text" | "image" | "resource";
    text?: string;
    data?: string;
    url?: string;
    mimeType?: string;
  }>;
  isError?: boolean;
}

/**
 * Routing information for a tool call
 */
export interface ToolRoute {
  /** Original tool name from request */
  originalName: string;
  /** Resolved tool name (may be namespaced) */
  resolvedName: string;
  /** Server that should handle this tool */
  serverName: string;
  /** Tool metadata from discovery */
  tool: DiscoveredTool;
  /** Whether this is a namespaced tool call */
  isNamespaced: boolean;
}

/**
 * Request context for routing
 */
export interface RouteContext {
  /** Unique request ID for tracking */
  requestId: string;
  /** Timestamp when request was received */
  timestamp: Date;
  /** Tool call request details */
  request: ToolCallRequest;
  /** Resolved routing information */
  route?: ToolRoute;
  /** Client information (if available) */
  clientInfo?: {
    transport: "stdio" | "http";
    remoteAddress?: string;
  };
}

/**
 * Request routing result
 */
export interface RoutingResult {
  /** Whether routing was successful */
  success: boolean;
  /** Routing information if successful */
  route?: ToolRoute;
  /** Error information if failed */
  error?: {
    code: string;
    message: string;
    details?: any;
  };
}

/**
 * Request router configuration
 */
export interface RouterConfig {
  /** Whether to enable request logging */
  enableLogging?: boolean;
  /** Whether to enable performance metrics */
  enableMetrics?: boolean;
  /** Default namespace separator */
  namespaceSeparator?: string;
  /** Request timeout in milliseconds */
  requestTimeout?: number;
  /** Whether to validate request parameters */
  validateParameters?: boolean;
  /** Whether to allow non-namespaced tool calls */
  allowNonNamespaced?: boolean;
}

/**
 * Request router statistics
 */
export interface RouterStats {
  /** Total number of requests processed */
  totalRequests: number;
  /** Number of successful requests */
  successfulRequests: number;
  /** Number of failed requests */
  failedRequests: number;
  /** Average request duration in milliseconds */
  averageRequestTime: number;
  /** Requests by server */
  requestsByServer: Record<string, number>;
  /** Common routing errors */
  errorsByType: Record<string, number>;
}

/**
 * Request router interface
 */
export interface IRequestRouter {
  /**
   * Initialize the router with configuration
   */
  initialize(config?: RouterConfig): Promise<void>;

  /**
   * Route a tool call request to the appropriate server
   */
  routeToolCall(
    request: ToolCallRequest,
    context?: Partial<RouteContext>
  ): Promise<ToolCallResponse>;

  /**
   * Resolve tool name to routing information
   */
  resolveToolRoute(toolName: string): Promise<RoutingResult>;

  /**
   * Validate request parameters against tool schema
   */
  validateRequest(
    request: ToolCallRequest,
    tool: DiscoveredTool
  ): Promise<boolean>;

  /**
   * Get router statistics
   */
  getStats(): RouterStats;

  /**
   * Clear router statistics
   */
  clearStats(): void;

  /**
   * Enable or disable request logging
   */
  setLogging(enabled: boolean): void;
}

/**
 * Default router configuration
 */
export const DEFAULT_ROUTER_CONFIG: Required<RouterConfig> = {
  enableLogging: true,
  enableMetrics: true,
  namespaceSeparator: ".",
  requestTimeout: 30000, // 30 seconds
  validateParameters: true,
  allowNonNamespaced: true,
};

/**
 * Router error codes
 */
export const ROUTER_ERROR_CODES = {
  TOOL_NOT_FOUND: "TOOL_NOT_FOUND",
  SERVER_NOT_CONNECTED: "SERVER_NOT_CONNECTED",
  INVALID_PARAMETERS: "INVALID_PARAMETERS",
  REQUEST_TIMEOUT: "REQUEST_TIMEOUT",
  ROUTING_ERROR: "ROUTING_ERROR",
  VALIDATION_ERROR: "VALIDATION_ERROR",
} as const;

export type RouterErrorCode =
  (typeof ROUTER_ERROR_CODES)[keyof typeof ROUTER_ERROR_CODES];
