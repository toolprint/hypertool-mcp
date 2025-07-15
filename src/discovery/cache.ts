/**
 * Tool cache implementation using node-cache with TTL support
 */

import { EventEmitter } from "events";
import NodeCache from "node-cache";
import {
  IToolCache,
  DiscoveredTool,
  DiscoveryConfig,
} from "./types.js";

/**
 * Tool cache implementation using node-cache with TTL and server indexing
 */
export class ToolCache extends EventEmitter implements IToolCache {
  private cache: NodeCache;
  private serverIndex = new Map<string, Set<string>>();
  private stats = {
    hits: 0,
    misses: 0,
    sets: 0,
    deletes: 0,
  };
  private config: DiscoveryConfig;

  constructor(config: DiscoveryConfig) {
    super();
    this.config = config;
    
    // Initialize node-cache with TTL in seconds
    const ttlSeconds = Math.floor((config.cacheTtl || 300000) / 1000);
    this.cache = new NodeCache({
      stdTTL: ttlSeconds,
      checkperiod: Math.floor(ttlSeconds * 0.1), // Check for expired keys every 10% of TTL
      useClones: false, // Better performance, we manage object mutations ourselves
    });

    // Listen for cache events
    this.cache.on("set", (key, value) => {
      this.emit("set", { key, tool: value });
    });

    this.cache.on("del", (key, value) => {
      this.emit("delete", { key, tool: value });
    });

    this.cache.on("expired", (key, value) => {
      this.emit("expired", { key, tool: value });
      // Clean up server index when items expire
      this.removeFromServerIndex(key, value?.serverName);
    });
  }

  /**
   * Store a tool in the cache
   */
  async set(key: string, tool: DiscoveredTool, ttl?: number): Promise<void> {
    // Set TTL in seconds if provided, otherwise use default
    if (ttl) {
      const ttlSeconds = Math.ceil(ttl / 1000); // Convert ms to seconds, round up
      this.cache.set(key, tool, ttlSeconds);
    } else {
      this.cache.set(key, tool);
    }

    // Update server index
    const serverKey = tool.serverName;
    if (!this.serverIndex.has(serverKey)) {
      this.serverIndex.set(serverKey, new Set());
    }
    this.serverIndex.get(serverKey)!.add(key);

    this.stats.sets++;
  }

  /**
   * Retrieve a tool from the cache
   */
  async get(key: string): Promise<DiscoveredTool | null> {
    const tool = this.cache.get<DiscoveredTool>(key);
    
    if (tool) {
      this.stats.hits++;
      this.emit("hit", { key, tool });
      return tool;
    } else {
      this.stats.misses++;
      this.emit("miss", { key });
      return null;
    }
  }

  /**
   * Check if a tool exists in cache
   */
  async has(key: string): Promise<boolean> {
    return this.cache.has(key);
  }

  /**
   * Remove a tool from cache
   */
  async delete(key: string): Promise<void> {
    const tool = this.cache.get<DiscoveredTool>(key);
    const success = this.cache.del(key);
    
    if (success && tool) {
      this.removeFromServerIndex(key, tool.serverName);
      this.stats.deletes++;
    }
  }

  /**
   * Clear all tools for a server
   */
  async clearServer(serverName: string): Promise<void> {
    const serverTools = this.serverIndex.get(serverName);
    if (serverTools) {
      const keys = Array.from(serverTools);
      const toolCount = keys.length;
      this.cache.del(keys);
      this.serverIndex.delete(serverName);
      this.stats.deletes += toolCount;
      
      this.emit("serverCleared", { 
        serverName, 
        toolCount,
        clearedKeys: keys
      });
    }
  }

  /**
   * Clear entire cache
   */
  async clear(): Promise<void> {
    this.cache.flushAll();
    this.serverIndex.clear();
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
    };
  }

  /**
   * Get tools by server name
   */
  getToolsByServer(serverName: string): DiscoveredTool[] {
    const serverTools = this.serverIndex.get(serverName);
    if (!serverTools) {
      return [];
    }

    const tools: DiscoveredTool[] = [];
    for (const key of serverTools) {
      const tool = this.cache.get<DiscoveredTool>(key);
      if (tool) {
        tools.push(tool);
      } else {
        // Clean up stale index entry
        serverTools.delete(key);
      }
    }

    return tools;
  }

  /**
   * Get all cached tools
   */
  getAllTools(): DiscoveredTool[] {
    const keys = this.cache.keys();
    const tools: DiscoveredTool[] = [];

    for (const key of keys) {
      const tool = this.cache.get<DiscoveredTool>(key);
      if (tool) {
        tools.push(tool);
      }
    }

    return tools;
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<{
    size: number;
    hitRate: number;
    missRate: number;
  }> {
    const total = this.stats.hits + this.stats.misses;
    return {
      size: this.cache.keys().length,
      hitRate: total > 0 ? this.stats.hits / total : 0,
      missRate: total > 0 ? this.stats.misses / total : 0,
    };
  }

  /**
   * Get internal cache statistics
   */
  getCacheStats() {
    return {
      ...this.stats,
      keys: this.cache.keys().length,
      serverCount: this.serverIndex.size,
    };
  }

  /**
   * Manually trigger cleanup of expired entries
   */
  async cleanupExpiredEntries(): Promise<void> {
    // node-cache handles this automatically, but we can emit a cleanup event
    const beforeKeys = this.cache.keys().length;
    // Force a check for expired keys
    this.cache.keys().forEach(key => {
      this.cache.get(key); // This will trigger expiration check
    });
    const afterKeys = this.cache.keys().length;
    const cleanedCount = beforeKeys - afterKeys;
    
    if (cleanedCount > 0) {
      this.emit("cleanup", { cleanedCount });
    }
  }

  /**
   * Destroy the cache and cleanup resources
   */
  destroy(): void {
    this.cache.close();
    this.serverIndex.clear();
    this.removeAllListeners();
  }

  /**
   * Remove a key from the server index
   */
  private removeFromServerIndex(key: string, serverName?: string): void {
    if (!serverName) return;
    
    const serverTools = this.serverIndex.get(serverName);
    if (serverTools) {
      serverTools.delete(key);
      if (serverTools.size === 0) {
        this.serverIndex.delete(serverName);
      }
    }
  }
}