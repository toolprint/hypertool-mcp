/**
 * Tool cache implementation with TTL and invalidation strategies
 */

import { EventEmitter } from "events";
import {
  IToolCache,
  DiscoveredTool,
  CachedToolEntry,
  DiscoveryConfig,
} from "./types";

/**
 * Tool cache implementation using in-memory storage with TTL
 */
export class ToolCache extends EventEmitter implements IToolCache {
  private cache = new Map<string, CachedToolEntry>();
  private serverIndex = new Map<string, Set<string>>();
  private stats = {
    hits: 0,
    misses: 0,
    sets: 0,
    deletes: 0,
  };
  private cleanupTimer?: NodeJS.Timeout;
  private config: DiscoveryConfig;

  constructor(config: DiscoveryConfig) {
    super();
    this.config = config;
    this.startCleanupTimer();
  }

  /**
   * Store a tool in the cache
   */
  async set(key: string, tool: DiscoveredTool, ttl?: number): Promise<void> {
    const expirationTime = ttl || this.config.cacheTtl || 300000; // 5 minutes default
    const expiresAt = new Date(Date.now() + expirationTime);

    const entry: CachedToolEntry = {
      tool,
      expiresAt,
      hitCount: 0,
    };

    // Check server tool limit
    const serverKey = tool.serverName;
    const serverTools = this.serverIndex.get(serverKey) || new Set();
    
    if (serverTools.size >= (this.config.maxToolsPerServer || 1000)) {
      // Remove oldest tool for this server
      await this.evictOldestForServer(serverKey);
    }

    this.cache.set(key, entry);
    
    // Update server index
    if (!this.serverIndex.has(serverKey)) {
      this.serverIndex.set(serverKey, new Set());
    }
    this.serverIndex.get(serverKey)!.add(key);

    this.stats.sets++;
    this.emit("set", { key, tool, expiresAt });
  }

  /**
   * Retrieve a tool from the cache
   */
  async get(key: string): Promise<DiscoveredTool | null> {
    const entry = this.cache.get(key);
    
    if (!entry) {
      this.stats.misses++;
      this.emit("miss", { key });
      return null;
    }

    // Check if expired
    if (entry.expiresAt < new Date()) {
      await this.delete(key);
      this.stats.misses++;
      this.emit("expired", { key, tool: entry.tool });
      return null;
    }

    // Update hit count and stats
    entry.hitCount++;
    this.stats.hits++;
    this.emit("hit", { key, tool: entry.tool, hitCount: entry.hitCount });
    
    return entry.tool;
  }

  /**
   * Check if a tool exists in cache
   */
  async has(key: string): Promise<boolean> {
    const entry = this.cache.get(key);
    
    if (!entry) {
      return false;
    }

    // Check if expired
    if (entry.expiresAt < new Date()) {
      await this.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Remove a tool from cache
   */
  async delete(key: string): Promise<void> {
    const entry = this.cache.get(key);
    
    if (entry) {
      const serverKey = entry.tool.serverName;
      
      // Remove from cache
      this.cache.delete(key);
      
      // Update server index
      const serverTools = this.serverIndex.get(serverKey);
      if (serverTools) {
        serverTools.delete(key);
        if (serverTools.size === 0) {
          this.serverIndex.delete(serverKey);
        }
      }

      this.stats.deletes++;
      this.emit("delete", { key, tool: entry.tool });
    }
  }

  /**
   * Clear all tools for a server
   */
  async clearServer(serverName: string): Promise<void> {
    const serverTools = this.serverIndex.get(serverName);
    
    if (serverTools) {
      const keys = Array.from(serverTools);
      
      for (const key of keys) {
        await this.delete(key);
      }
      
      this.emit("serverCleared", { serverName, toolCount: keys.length });
    }
  }

  /**
   * Clear entire cache
   */
  async clear(): Promise<void> {
    const toolCount = this.cache.size;
    
    this.cache.clear();
    this.serverIndex.clear();
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
    };

    this.emit("cleared", { toolCount });
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<{
    size: number;
    hitRate: number;
    missRate: number;
  }> {
    const totalRequests = this.stats.hits + this.stats.misses;
    
    return {
      size: this.cache.size,
      hitRate: totalRequests > 0 ? this.stats.hits / totalRequests : 0,
      missRate: totalRequests > 0 ? this.stats.misses / totalRequests : 0,
    };
  }

  /**
   * Get detailed cache information
   */
  getCacheInfo() {
    const servers = Array.from(this.serverIndex.entries()).map(([serverName, tools]) => ({
      serverName,
      toolCount: tools.size,
      tools: Array.from(tools),
    }));

    return {
      totalTools: this.cache.size,
      totalServers: this.serverIndex.size,
      servers,
      stats: { ...this.stats },
    };
  }

  /**
   * Get tools by server
   */
  getToolsByServer(serverName: string): DiscoveredTool[] {
    const serverTools = this.serverIndex.get(serverName);
    if (!serverTools) {
      return [];
    }

    const tools: DiscoveredTool[] = [];
    for (const key of serverTools) {
      const entry = this.cache.get(key);
      if (entry && entry.expiresAt >= new Date()) {
        tools.push(entry.tool);
      }
    }

    return tools;
  }

  /**
   * Get all cached tools
   */
  getAllTools(): DiscoveredTool[] {
    const tools: DiscoveredTool[] = [];
    const now = new Date();

    for (const entry of this.cache.values()) {
      if (entry.expiresAt >= now) {
        tools.push(entry.tool);
      }
    }

    return tools;
  }

  /**
   * Update tool TTL
   */
  async updateTTL(key: string, ttl: number): Promise<boolean> {
    const entry = this.cache.get(key);
    
    if (!entry) {
      return false;
    }

    entry.expiresAt = new Date(Date.now() + ttl);
    this.emit("ttlUpdated", { key, newExpiresAt: entry.expiresAt });
    return true;
  }

  /**
   * Get tools that will expire soon
   */
  getExpiringSoon(withinMs: number = 60000): DiscoveredTool[] {
    const expiresBefore = new Date(Date.now() + withinMs);
    const tools: DiscoveredTool[] = [];

    for (const entry of this.cache.values()) {
      if (entry.expiresAt <= expiresBefore && entry.expiresAt > new Date()) {
        tools.push(entry.tool);
      }
    }

    return tools;
  }

  /**
   * Refresh tool in cache (update lastUpdated timestamp)
   */
  async refreshTool(key: string): Promise<boolean> {
    const entry = this.cache.get(key);
    
    if (!entry) {
      return false;
    }

    entry.tool.lastUpdated = new Date();
    this.emit("toolRefreshed", { key, tool: entry.tool });
    return true;
  }

  /**
   * Start periodic cleanup of expired entries
   */
  private startCleanupTimer(): void {
    // Run cleanup every minute
    this.cleanupTimer = setInterval(() => {
      this.cleanupExpiredEntries();
    }, 60000);
  }

  /**
   * Stop cleanup timer
   */
  stopCleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
  }

  /**
   * Clean up expired cache entries
   */
  private async cleanupExpiredEntries(): Promise<void> {
    const now = new Date();
    const expiredKeys: string[] = [];

    for (const [key, entry] of this.cache) {
      if (entry.expiresAt < now) {
        expiredKeys.push(key);
      }
    }

    for (const key of expiredKeys) {
      await this.delete(key);
    }

    if (expiredKeys.length > 0) {
      this.emit("cleanup", { expiredCount: expiredKeys.length });
    }
  }

  /**
   * Evict oldest tool for a server to make room for new ones
   */
  private async evictOldestForServer(serverName: string): Promise<void> {
    const serverTools = this.serverIndex.get(serverName);
    if (!serverTools || serverTools.size === 0) {
      return;
    }

    let oldestKey = "";
    let oldestTime = new Date();

    // Find the oldest tool for this server
    for (const key of serverTools) {
      const entry = this.cache.get(key);
      if (entry && entry.tool.discoveredAt < oldestTime) {
        oldestTime = entry.tool.discoveredAt;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      await this.delete(oldestKey);
      this.emit("evicted", { key: oldestKey, serverName, reason: "server_limit" });
    }
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.stopCleanup();
    this.cache.clear();
    this.serverIndex.clear();
    this.removeAllListeners();
  }
}