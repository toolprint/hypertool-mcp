/**
 * Tool discovery service implementation
 */

import { EventEmitter } from "events";
import { IConnectionManager } from "../connection/types";
import { MCPMessage } from "../connection/clients/types";
import {
  IToolDiscoveryEngine,
  DiscoveryConfig,
  DiscoveredTool,
  ServerToolState,
  ToolLookupOptions,
  DiscoveryStats,
  MCPToolDefinition,
  DEFAULT_DISCOVERY_CONFIG,
} from "./types";
import { ToolCache } from "./cache";
import {
  ToolConflictResolver,
  ConflictResolutionConfig,
} from "./conflict-resolver";
import { ToolLookupManager, SearchQuery, SearchResult } from "./lookup";
import { ToolHashUtils, ToolHashManager } from "./hash-utils";

/**
 * Tool discovery engine implementation
 */
export class ToolDiscoveryEngine
  extends EventEmitter
  implements IToolDiscoveryEngine
{
  private connectionManager: IConnectionManager;
  private config: Required<DiscoveryConfig>;
  private cache: ToolCache;
  private conflictResolver: ToolConflictResolver;
  private lookupManager: ToolLookupManager;
  private hashManager: ToolHashManager;
  private isInitialized = false;
  private isStarted = false;
  private refreshTimer?: NodeJS.Timeout;
  private serverStates = new Map<string, ServerToolState>();
  private discoveryStats: DiscoveryStats;

  constructor(
    connectionManager: IConnectionManager,
    conflictConfig?: ConflictResolutionConfig
  ) {
    super();
    this.connectionManager = connectionManager;
    this.config = { ...DEFAULT_DISCOVERY_CONFIG };
    this.cache = new ToolCache(this.config);
    this.conflictResolver = new ToolConflictResolver(conflictConfig);
    this.lookupManager = new ToolLookupManager();
    this.hashManager = new ToolHashManager();
    this.discoveryStats = this.initializeStats();

    this.setupConnectionEvents();
  }

  /**
   * Initialize the discovery engine
   */
  async initialize(config: DiscoveryConfig = {}): Promise<void> {
    if (this.isInitialized) {
      throw new Error("Tool discovery engine is already initialized");
    }

    this.config = { ...DEFAULT_DISCOVERY_CONFIG, ...config };
    this.cache = new ToolCache(this.config);
    this.isInitialized = true;

    // Initial discovery if auto-discovery is enabled
    if (this.config.autoDiscovery) {
      await this.discoverTools();
    }

    this.emit("initialized", { config: this.config });
  }

  /**
   * Discover tools from a specific server or all connected servers
   */
  async discoverTools(serverName?: string): Promise<DiscoveredTool[]> {
    this.ensureInitialized();

    const startTime = Date.now();
    const servers = serverName
      ? [serverName]
      : this.connectionManager.getConnectedServers();

    const allDiscoveredTools: DiscoveredTool[] = [];

    for (const server of servers) {
      try {
        const tools = await this.discoverServerTools(server);
        allDiscoveredTools.push(...tools);

        this.updateServerState(server, {
          isConnected: true,
          lastDiscovery: new Date(),
          toolCount: tools.length,
          tools,
          lastError: undefined,
        });
      } catch (error) {
        console.error(
          `Failed to discover tools from server "${server}":`,
          error
        );

        this.updateServerState(server, {
          isConnected: false,
          lastError: (error as Error).message,
        });
      }
    }

    // Resolve conflicts in discovered tools
    const resolvedTools =
      this.conflictResolver.resolveConflicts(allDiscoveredTools);

    // Detect and log conflicts
    const conflicts = this.conflictResolver.detectConflicts(allDiscoveredTools);
    if (conflicts.length > 0) {
      this.emit("conflictsDetected", {
        conflicts,
        resolvedToolCount: resolvedTools.length,
        originalToolCount: allDiscoveredTools.length,
      });
    }

    // Update discovery stats
    const discoveryTime = Date.now() - startTime;
    this.updateDiscoveryStats(discoveryTime, resolvedTools.length);

    this.emit("toolsDiscovered", {
      serverName,
      toolCount: resolvedTools.length,
      tools: resolvedTools,
      conflicts,
    });

    return resolvedTools;
  }

  /**
   * Discover tools from a specific server
   */
  private async discoverServerTools(
    serverName: string
  ): Promise<DiscoveredTool[]> {
    const connection = this.connectionManager.getConnection(serverName);
    if (!connection || !connection.isConnected()) {
      throw new Error(`Server "${serverName}" is not connected`);
    }

    // Send list_tools request via MCP protocol
    const listToolsMessage: MCPMessage = {
      jsonrpc: "2.0",
      id: `list_tools_${Date.now()}`,
      method: "tools/list",
    };

    const response = await this.sendMCPRequest(connection, listToolsMessage);

    if (response.error) {
      throw new Error(`MCP error: ${response.error.message}`);
    }

    const toolDefinitions: MCPToolDefinition[] = response.result?.tools || [];
    const discoveredTools: DiscoveredTool[] = [];

    for (const toolDef of toolDefinitions) {
      const namespacedName = this.createNamespacedName(
        serverName,
        toolDef.name
      );

      // Create tool with proper hashing
      const discoveredTool = ToolHashUtils.createHashedTool(
        toolDef,
        serverName,
        namespacedName
      );

      discoveredTools.push(discoveredTool);

      // Add to lookup manager
      this.lookupManager.addTool(discoveredTool);

      // Add to hash history
      this.hashManager.addToHistory(discoveredTool);

      // Cache the tool
      await this.cache.set(namespacedName, discoveredTool);
    }

    return discoveredTools;
  }

  /**
   * Send an MCP request and wait for response
   */
  private async sendMCPRequest(
    connection: any,
    message: MCPMessage
  ): Promise<MCPMessage> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("MCP request timeout"));
      }, 10000);

      const handleResponse = (response: MCPMessage) => {
        if (response.id === message.id) {
          clearTimeout(timeout);
          connection.client.off("message", handleResponse);
          resolve(response);
        }
      };

      connection.client.on("message", handleResponse);
      connection.client.send(message).catch((error: Error) => {
        clearTimeout(timeout);
        connection.client.off("message", handleResponse);
        reject(error);
      });
    });
  }

  /**
   * Get a tool by its name or namespaced name
   */
  async getToolByName(name: string): Promise<DiscoveredTool | null> {
    this.ensureInitialized();

    // Try direct lookup first
    let tool = await this.cache.get(name);
    if (tool) {
      return tool;
    }

    // Try with namespace prefix for each connected server
    for (const serverName of this.connectionManager.getConnectedServers()) {
      const namespacedName = this.createNamespacedName(serverName, name);
      tool = await this.cache.get(namespacedName);
      if (tool) {
        return tool;
      }
    }

    return null;
  }

  /**
   * Search for tools matching criteria
   */
  async searchTools(options: ToolLookupOptions): Promise<DiscoveredTool[]> {
    this.ensureInitialized();

    // Use lookup manager for efficient searching
    const searchQuery: SearchQuery = {
      name: options.namePattern,
      server: options.serverName,
      fuzzy: true,
    };

    const results = this.lookupManager.search(searchQuery);

    // Filter by connection status if needed
    if (options.connectedOnly) {
      return results
        .filter((result) =>
          this.connectionManager.isServerConnected(result.tool.serverName)
        )
        .map((result) => result.tool);
    }

    return results.map((result) => result.tool);
  }

  /**
   * Advanced search with relevance scoring
   */
  searchToolsWithScoring(
    options: ToolLookupOptions & { keywords?: string[] }
  ): SearchResult[] {
    this.ensureInitialized();

    const searchQuery: SearchQuery = {
      name: options.namePattern,
      server: options.serverName,
      keywords: options.keywords,
      fuzzy: true,
    };

    const results = this.lookupManager.search(searchQuery);

    // Filter by connection status if needed
    if (options.connectedOnly) {
      return results.filter((result) =>
        this.connectionManager.isServerConnected(result.tool.serverName)
      );
    }

    return results;
  }

  /**
   * Get all available tools
   */
  getAvailableTools(connectedOnly = true): DiscoveredTool[] {
    this.ensureInitialized();

    const allTools: DiscoveredTool[] = [];

    for (const [, state] of this.serverStates) {
      if (connectedOnly && !state.isConnected) {
        continue;
      }
      allTools.push(...state.tools);
    }

    return allTools;
  }

  /**
   * Refresh tool cache for a specific server or all servers
   */
  async refreshCache(serverName?: string): Promise<void> {
    this.ensureInitialized();

    if (serverName) {
      await this.cache.clearServer(serverName);
    } else {
      await this.cache.clear();
    }

    await this.discoverTools(serverName);
  }

  /**
   * Get discovery statistics
   */
  getStats(): DiscoveryStats {
    return { ...this.discoveryStats };
  }

  /**
   * Get server tool states
   */
  getServerStates(): ServerToolState[] {
    return Array.from(this.serverStates.values());
  }

  /**
   * Get conflict statistics
   */
  getConflictStats() {
    const allTools = this.getAvailableTools(false);
    return this.conflictResolver.getConflictStats(allTools);
  }

  /**
   * Update conflict resolution configuration
   */
  updateConflictConfig(config: Partial<ConflictResolutionConfig>): void {
    this.conflictResolver.updateConfig(config);
  }

  /**
   * Get current conflict resolution configuration
   */
  getConflictConfig(): ConflictResolutionConfig {
    return this.conflictResolver.getConfig();
  }

  /**
   * Clear cache for a specific server or all servers
   */
  async clearCache(serverName?: string): Promise<void> {
    this.ensureInitialized();

    if (serverName) {
      await this.cache.clearServer(serverName);
      this.serverStates.delete(serverName);
    } else {
      await this.cache.clear();
      this.serverStates.clear();
    }
  }

  /**
   * Start automatic discovery and refresh
   */
  async start(): Promise<void> {
    this.ensureInitialized();

    if (this.isStarted) {
      return;
    }

    this.isStarted = true;

    // Start periodic refresh
    if (this.config.refreshInterval > 0) {
      this.refreshTimer = setInterval(() => {
        this.discoverTools().catch((error) => {
          console.error("Periodic tool discovery failed:", error);
        });
      }, this.config.refreshInterval);
    }

    this.emit("started");
  }

  /**
   * Stop automatic discovery and refresh
   */
  async stop(): Promise<void> {
    if (!this.isStarted) {
      return;
    }

    this.isStarted = false;

    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = undefined;
    }

    this.emit("stopped");
  }

  /**
   * Create namespaced tool name
   */
  private createNamespacedName(serverName: string, toolName: string): string {
    return `${serverName}${this.config.namespaceSeparator}${toolName}`;
  }

  /**
   * Update server state
   */
  private updateServerState(
    serverName: string,
    updates: Partial<ServerToolState>
  ): void {
    const currentState = this.serverStates.get(serverName) || {
      serverName,
      isConnected: false,
      toolCount: 0,
      tools: [],
    };

    this.serverStates.set(serverName, {
      ...currentState,
      ...updates,
    });
  }

  /**
   * Handle MCP tools list changed notification
   */
  async handleToolsListChanged(serverName: string): Promise<void> {
    console.log(
      `Received tools list changed notification from server: ${serverName}`
    );

    try {
      // Get current tools for comparison
      const previousTools = this.getToolsByServer(serverName);

      // Discover new tools
      const newTools = await this.discoverServerTools(serverName);

      // Detect changes
      const changes = ToolHashUtils.detectToolChanges(previousTools, newTools);
      const summary = ToolHashUtils.summarizeChanges(changes);

      console.log(`Tool changes detected for ${serverName}:`, summary);

      // Update lookup manager
      this.lookupManager.clearServer(serverName);
      for (const tool of newTools) {
        this.lookupManager.addTool(tool);
      }

      // Update cache
      await this.cache.clearServer(serverName);
      for (const tool of newTools) {
        await this.cache.set(tool.namespacedName, tool);
      }

      // Update server state
      this.updateServerState(serverName, {
        tools: newTools,
        toolCount: newTools.length,
        lastDiscovery: new Date(),
        serverToolsHash: ToolHashUtils.calculateServerToolsHash(newTools),
      });

      // Emit change event
      this.emit("toolsChanged", {
        serverName,
        changes,
        summary,
        newTools,
      });
    } catch (error) {
      console.error(
        `Failed to handle tools list changed for server "${serverName}":`,
        error
      );
      this.emit("error", error);
    }
  }

  /**
   * Get tools for a specific server
   */
  getToolsByServer(serverName: string): DiscoveredTool[] {
    const serverState = this.serverStates.get(serverName);
    return serverState?.tools || [];
  }

  /**
   * Setup connection manager event handlers
   */
  private setupConnectionEvents(): void {
    this.connectionManager.on("connected", (event) => {
      if (this.config.autoDiscovery && this.isInitialized) {
        this.discoverTools(event.serverName).catch((error) => {
          console.error(
            `Auto-discovery failed for server "${event.serverName}":`,
            error
          );
        });
      }
    });

    this.connectionManager.on("disconnected", (event) => {
      this.updateServerState(event.serverName, {
        isConnected: false,
      });

      // Clear tools for disconnected server from lookup
      this.lookupManager.clearServer(event.serverName);
    });

    // Listen for health-based tool availability changes
    this.connectionManager.on("serverToolsUnavailable" as any, (event: any) => {
      console.log(`Server "${event.serverName}" tools unavailable due to health: ${event.reason}`);
      
      this.updateServerState(event.serverName, {
        isConnected: false,
        lastError: event.error?.message,
      });
      
      // Clear tools for unhealthy server from lookup
      this.lookupManager.clearServer(event.serverName);
      
      // Emit tools unavailable event
      this.emit("toolsUnavailable", {
        serverName: event.serverName,
        reason: event.reason,
        error: event.error,
      });
    });

    this.connectionManager.on("serverToolsAvailable" as any, (event: any) => {
      console.log(`Server "${event.serverName}" tools available again, recovered from: ${event.recoveredFrom}`);
      
      // Trigger tool rediscovery if auto-discovery is enabled
      if (this.config.autoDiscovery && this.isInitialized) {
        this.discoverTools(event.serverName).catch((error) => {
          console.error(`Auto-discovery failed for recovered server "${event.serverName}":`, error);
        });
      }
      
      // Emit tools available event
      this.emit("toolsAvailable", {
        serverName: event.serverName,
        recoveredFrom: event.recoveredFrom,
      });
    });

    // Listen for MCP tools list changed notifications
    this.setupMCPNotificationHandlers();
  }

  /**
   * Setup MCP notification handlers for tool changes
   */
  private setupMCPNotificationHandlers(): void {
    // Note: This would be called when connections are established
    // For now, we'll set up handlers when connections are made
  }

  /**
   * Initialize discovery statistics
   */
  private initializeStats(): DiscoveryStats {
    return {
      totalServers: 0,
      connectedServers: 0,
      totalTools: 0,
      cacheHitRate: 0,
      averageDiscoveryTime: 0,
      toolsByServer: {},
    };
  }

  /**
   * Update discovery statistics
   */
  private updateDiscoveryStats(discoveryTime: number, toolCount: number): void {
    const connectedServers = this.connectionManager.getConnectedServers();

    this.discoveryStats = {
      totalServers: this.serverStates.size,
      connectedServers: connectedServers.length,
      totalTools: toolCount,
      cacheHitRate: 0, // TODO: Calculate from cache stats
      lastDiscoveryTime: new Date(),
      averageDiscoveryTime: discoveryTime,
      toolsByServer: Object.fromEntries(
        Array.from(this.serverStates.entries()).map(([name, state]) => [
          name,
          state.toolCount,
        ])
      ),
    };
  }

  /**
   * Resolve a tool reference and return tool + server metadata
   * Uses optimized lookup maps and strict validation by default
   * 
   * @param ref Tool reference with namespacedName and/or refId
   * @param options.allowStaleRefs If true, allows mismatched tools to continue (INSECURE)
   */
  resolveToolReference(
    ref: { namespacedName?: string; refId?: string },
    options?: { allowStaleRefs?: boolean }
  ): {
    exists: boolean;
    tool?: DiscoveredTool;
    serverName?: string;
    serverStatus?: import("../connection/types").ConnectionStatus;
    namespacedNameMatch: boolean;
    refIdMatch: boolean;
    warnings: string[];
    errors: string[];
  } {
    this.ensureInitialized();
    
    const allowStaleRefs = options?.allowStaleRefs ?? false; // Default to secure mode
    const warnings: string[] = [];
    const errors: string[] = [];
    
    if (!ref.namespacedName && !ref.refId) {
      return {
        exists: false,
        namespacedNameMatch: false,
        refIdMatch: false,
        warnings: [],
        errors: ["Tool reference must have either namespacedName or refId"],
        serverStatus: undefined
      };
    }
    
    const allTools = this.getAvailableTools(true);
    
    // Helper function to get server status from connection manager
    const getServerStatus = (serverName: string) => {
      return this.connectionManager?.status?.[serverName];
    };
    
    // Build optimized lookup maps for O(1) access
    const toolByNamespacedName = new Map<string, DiscoveredTool>();
    const toolByRefId = new Map<string, DiscoveredTool>();
    
    for (const tool of allTools) {
      toolByNamespacedName.set(tool.namespacedName, tool);
      toolByRefId.set(tool.fullHash, tool);
    }
    
    // Attempt resolution by both methods (refId is more reliable)
    const toolByRef = ref.refId ? toolByRefId.get(ref.refId) : undefined;
    const toolByName = ref.namespacedName ? toolByNamespacedName.get(ref.namespacedName) : undefined;
    
    // Handle different resolution scenarios
    if (!toolByName && !toolByRef) {
      // Neither identifier found the tool
      return {
        exists: false,
        namespacedNameMatch: false,
        refIdMatch: false,
        warnings: [],
        errors: [`Tool not found by any identifier: namespacedName='${ref.namespacedName}', refId='${ref.refId}'`],
        serverStatus: undefined
      };
    }
    
    if (toolByName && toolByRef) {
      // Both identifiers found tools - check if they're the same
      if (toolByName.namespacedName === toolByRef.namespacedName && toolByName.fullHash === toolByRef.fullHash) {
        // Perfect match - both identifiers point to same tool
        return {
          exists: true,
          tool: toolByName,
          serverName: toolByName.serverName,
          serverStatus: getServerStatus(toolByName.serverName),
          namespacedNameMatch: true,
          refIdMatch: true,
          warnings: [],
          errors: []
        };
      } else {
        // Conflict - identifiers point to different tools
        const conflictMsg = `Tool reference conflict: refId '${ref.refId}' points to tool '${toolByRef.namespacedName}', but namespacedName '${ref.namespacedName}' points to different tool.`;
        
        if (allowStaleRefs) {
          // INSECURE mode: Allow mismatch, prefer refId (more reliable)
          warnings.push(`${conflictMsg} Using refId match (more reliable). WARNING: This is insecure mode.`);
          return {
            exists: true,
            tool: toolByRef,
            serverName: toolByRef.serverName,
            serverStatus: getServerStatus(toolByRef.serverName),
            namespacedNameMatch: false,
            refIdMatch: true,
            warnings,
            errors: []
          };
        } else {
          // SECURE mode: Reject mismatch
          errors.push(`${conflictMsg} Tool reference rejected for security. Use allowStaleRefs=true to force.`);
          return {
            exists: false,
            namespacedNameMatch: false,
            refIdMatch: false,
            warnings: [],
            errors,
            serverStatus: undefined
          };
        }
      }
    }
    
    if (toolByRef) {
      // Found by refId but not by namespacedName (prefer refId - more reliable)
      const namespacedNameMatch = ref.namespacedName ? toolByRef.namespacedName === ref.namespacedName : true;
      if (!namespacedNameMatch) {
        const mismatchMsg = `Tool name changed: refId '${ref.refId}' found but namespacedName changed from '${ref.namespacedName}' to '${toolByRef.namespacedName}' (tool may have been renamed or moved)`;
        
        if (allowStaleRefs) {
          // INSECURE mode: Allow name mismatch
          warnings.push(`${mismatchMsg}. WARNING: This is insecure mode.`);
          return {
            exists: true,
            tool: toolByRef,
            serverName: toolByRef.serverName,
            serverStatus: getServerStatus(toolByRef.serverName),
            namespacedNameMatch: false,
            refIdMatch: true,
            warnings,
            errors: []
          };
        } else {
          // SECURE mode: Reject name mismatch
          errors.push(`${mismatchMsg}. Tool reference rejected for security. Use allowStaleRefs=true to force.`);
          return {
            exists: false,
            namespacedNameMatch: false,
            refIdMatch: false,
            warnings: [],
            errors,
            serverStatus: undefined
          };
        }
      }
      
      // Name matches or no name provided - safe to return
      return {
        exists: true,
        tool: toolByRef,
        serverName: toolByRef.serverName,
        serverStatus: getServerStatus(toolByRef.serverName),
        namespacedNameMatch,
        refIdMatch: true,
        warnings: [],
        errors: []
      };
    }
    
    if (toolByName) {
      // Found by namespacedName but not by refId (fallback - less reliable)
      const refIdMatch = ref.refId ? toolByName.fullHash === ref.refId : true;
      if (!refIdMatch) {
        const mismatchMsg = `Tool refId mismatch: '${ref.namespacedName}' found but refId changed from '${ref.refId}' to '${toolByName.fullHash}' (tool schema may have been updated)`;
        
        if (allowStaleRefs) {
          // INSECURE mode: Allow refId mismatch
          warnings.push(`${mismatchMsg}. WARNING: This is insecure mode.`);
          return {
            exists: true,
            tool: toolByName,
            serverName: toolByName.serverName,
            serverStatus: getServerStatus(toolByName.serverName),
            namespacedNameMatch: true,
            refIdMatch: false,
            warnings,
            errors: []
          };
        } else {
          // SECURE mode: Reject refId mismatch
          errors.push(`${mismatchMsg}. Tool reference rejected for security. Use allowStaleRefs=true to force.`);
          return {
            exists: false,
            namespacedNameMatch: false,
            refIdMatch: false,
            warnings: [],
            errors,
            serverStatus: undefined
          };
        }
      }
      
      // RefId matches or no refId provided - safe to return
      return {
        exists: true,
        tool: toolByName,
        serverName: toolByName.serverName,
        serverStatus: getServerStatus(toolByName.serverName),
        namespacedNameMatch: true,
        refIdMatch,
        warnings: [],
        errors: []
      };
    }
    
    // Should never reach here, but safety fallback
    return {
      exists: false,
      namespacedNameMatch: false,
      refIdMatch: false,
      warnings: [],
      errors: ["Unexpected error in tool resolution"],
      serverStatus: undefined
    };
  }

  /**
   * Ensure the engine is initialized
   */
  private ensureInitialized(): void {
    if (!this.isInitialized) {
      throw new Error(
        "Tool discovery engine not initialized. Call initialize() first."
      );
    }
  }
}
