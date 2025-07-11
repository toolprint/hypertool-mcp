/**
 * TypeScript interfaces for tool discovery and caching
 */

/**
 * MCP tool schema definition
 */
export interface ToolSchema {
  type: "object";
  properties?: Record<string, any>;
  required?: string[];
  additionalProperties?: boolean;
}

/**
 * MCP tool definition from list_tools response
 */
export interface MCPToolDefinition {
  name: string;
  description?: string;
  inputSchema: ToolSchema;
}

/**
 * Enhanced tool metadata with discovery information
 */
export interface DiscoveredTool {
  /** Original tool name from the server */
  name: string;
  /** Name of the server this tool came from */
  serverName: string;
  /** Namespaced name to avoid conflicts (e.g., "git.status") */
  namespacedName: string;
  /** Tool input schema */
  schema: ToolSchema;
  /** Tool description */
  description?: string;
  /** When this tool was discovered */
  discoveredAt: Date;
  /** When this tool entry was last updated */
  lastUpdated: Date;
  /** Server connection status when discovered */
  serverStatus: "connected" | "disconnected";
  /** Hash of tool structure for change detection */
  structureHash: string;
  /** Hash of the entire tool definition including metadata */
  fullHash: string;
}

/**
 * Tool cache entry with TTL information
 */
export interface CachedToolEntry {
  tool: DiscoveredTool;
  /** Cache entry expiration time */
  expiresAt: Date;
  /** Cache hit count for performance monitoring */
  hitCount: number;
}

/**
 * Tool change detection result
 */
export interface ToolChangeInfo {
  tool: DiscoveredTool;
  changeType: "added" | "updated" | "removed" | "unchanged";
  previousHash?: string;
  currentHash?: string;
  changedFields?: string[];
}

/**
 * Server tool discovery state
 */
export interface ServerToolState {
  serverName: string;
  isConnected: boolean;
  lastDiscovery?: Date;
  toolCount: number;
  tools: DiscoveredTool[];
  lastError?: string;
  /** Hash of all tools for this server */
  serverToolsHash?: string;
  /** Last known tool hashes for change detection */
  previousToolHashes?: Map<string, string>;
}

/**
 * Tool discovery configuration
 */
export interface DiscoveryConfig {
  /** Cache TTL in milliseconds (default: 5 minutes) */
  cacheTtl?: number;
  /** Auto-refresh interval in milliseconds (default: 30 seconds) */
  refreshInterval?: number;
  /** Whether to enable automatic discovery on server connection */
  autoDiscovery?: boolean;
  /** Namespace separator (default: ".") */
  namespaceSeparator?: string;
  /** Maximum number of tools to cache per server */
  maxToolsPerServer?: number;
  /** Enable performance monitoring */
  enableMetrics?: boolean;
}

/**
 * Tool lookup options
 */
export interface ToolLookupOptions {
  /** Filter by server name */
  serverName?: string;
  /** Filter by tool name pattern (supports regex) */
  namePattern?: string;
  /** Include only connected servers */
  connectedOnly?: boolean;
  /** Include namespaced names in search */
  includeNamespaced?: boolean;
}

/**
 * Tool discovery statistics
 */
export interface DiscoveryStats {
  totalServers: number;
  connectedServers: number;
  totalTools: number;
  cacheHitRate: number;
  lastDiscoveryTime?: Date;
  averageDiscoveryTime: number;
  toolsByServer: Record<string, number>;
}

/**
 * Tool discovery engine interface
 */
export interface IToolDiscoveryEngine {
  /**
   * Initialize the discovery engine
   */
  initialize(config?: DiscoveryConfig): Promise<void>;

  /**
   * Discover tools from a specific server or all connected servers
   */
  discoverTools(serverName?: string): Promise<DiscoveredTool[]>;

  /**
   * Get a tool by its name or namespaced name
   */
  getToolByName(name: string): Promise<DiscoveredTool | null>;

  /**
   * Search for tools matching criteria
   */
  searchTools(options: ToolLookupOptions): Promise<DiscoveredTool[]>;

  /**
   * Get all available tools
   */
  getAvailableTools(connectedOnly?: boolean): DiscoveredTool[];

  /**
   * Refresh tool cache for a specific server or all servers
   */
  refreshCache(serverName?: string): Promise<void>;

  /**
   * Get discovery statistics
   */
  getStats(): DiscoveryStats;

  /**
   * Get server tool states
   */
  getServerStates(): ServerToolState[];

  /**
   * Clear cache for a specific server or all servers
   */
  clearCache(serverName?: string): Promise<void>;

  /**
   * Start automatic discovery and refresh
   */
  start(): Promise<void>;

  /**
   * Stop automatic discovery and refresh
   */
  stop(): Promise<void>;
}

/**
 * Tool cache interface
 */
export interface IToolCache {
  /**
   * Store a tool in the cache
   */
  set(key: string, tool: DiscoveredTool, ttl?: number): Promise<void>;

  /**
   * Retrieve a tool from the cache
   */
  get(key: string): Promise<DiscoveredTool | null>;

  /**
   * Check if a tool exists in cache
   */
  has(key: string): Promise<boolean>;

  /**
   * Remove a tool from cache
   */
  delete(key: string): Promise<void>;

  /**
   * Clear all tools for a server
   */
  clearServer(serverName: string): Promise<void>;

  /**
   * Clear entire cache
   */
  clear(): Promise<void>;

  /**
   * Get cache statistics
   */
  getStats(): Promise<{
    size: number;
    hitRate: number;
    missRate: number;
  }>;
}

/**
 * Default discovery configuration
 */
export const DEFAULT_DISCOVERY_CONFIG: Required<DiscoveryConfig> = {
  cacheTtl: 5 * 60 * 1000, // 5 minutes
  refreshInterval: 30 * 1000, // 30 seconds
  autoDiscovery: true,
  namespaceSeparator: ".",
  maxToolsPerServer: 1000,
  enableMetrics: true,
};
