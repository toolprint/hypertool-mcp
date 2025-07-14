/**
 * Client-specific types for MCP connections
 */

/**
 * MCP protocol message types
 */
export interface MCPMessage {
  jsonrpc: "2.0";
  id?: string | number;
  method?: string;
  params?: any;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

/**
 * Client configuration options
 */
export interface ClientOptions {
  timeout?: number;
  retryAttempts?: number;
  retryDelay?: number;
  debug?: boolean;
}
