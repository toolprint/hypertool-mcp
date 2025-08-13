/**
 * Type definitions for MCP server management
 */

export interface MCPServerConfig {
  type: "stdio" | "http" | "sse" | "websocket" | "dxt-extension";
  command?: string;
  args?: string[];
  url?: string;
  path?: string; // For DXT extension type
  env?: Record<string, string>;
  headers?: Record<string, string>;
  [key: string]: any;
}

export interface MCPServerMetadata {
  app: string;
  importedAt: string;
  addedManually?: boolean;
}

export interface MCPServersConfig {
  mcpServers: Record<string, MCPServerConfig>;
  _metadata?: {
    sources: Record<string, MCPServerMetadata>;
  };
}

export interface MCPServerDetails {
  name: string;
  config: MCPServerConfig;
  metadata?: MCPServerMetadata;
}

export interface AddServerOptions {
  transport?: "stdio" | "http" | "sse" | "dxt-extension";
  env?: string[];
  header?: string[];
}

export interface ListServerOptions {
  json?: boolean;
  verbose?: boolean;
}
