/**
 * TypeScript interfaces for MCP configuration
 * Based on the .mcp.json file format
 */

export type TransportType = "stdio" | "http";

/**
 * Base configuration for an MCP server
 */
export interface BaseServerConfig {
  type: TransportType;
  env?: Record<string, string>;
}

/**
 * Configuration for stdio-based MCP servers
 */
export interface StdioServerConfig extends BaseServerConfig {
  type: "stdio";
  command: string;
  args?: string[];
}

/**
 * Configuration for HTTP-based MCP servers
 */
export interface HttpServerConfig extends BaseServerConfig {
  type: "http";
  url: string;
  headers?: Record<string, string>;
}

/**
 * Union type for all server configurations
 */
export type ServerConfig = StdioServerConfig | HttpServerConfig;

/**
 * Root configuration structure matching .mcp.json format
 */
export interface MCPConfig {
  mcpServers: Record<string, ServerConfig>;
}

/**
 * Result of parsing a configuration file
 */
export interface ParseResult {
  success: boolean;
  config?: MCPConfig;
  error?: string;
  validationErrors?: string[];
}

/**
 * Options for the configuration parser
 */
export interface ParserOptions {
  validatePaths?: boolean;
  allowRelativePaths?: boolean;
  strict?: boolean;
}
