/**
 * High-Performance Persona Cache System
 *
 * This module implements a comprehensive caching system for LoadedPersona objects
 * with TTL-based expiration, LRU eviction, memory management, and file system
 * monitoring for automatic invalidation. Designed for optimal performance with
 * minimal memory footprint and non-blocking operations.
 *
 * @fileoverview Advanced persona caching with performance monitoring and management
 */

import { EventEmitter } from "events";
import { watch, type FSWatcher } from "fs";
import { dirname } from "path";
import type {
  LoadedPersona,
  PersonaCacheConfig,
  PersonaCacheStats,
} from "./types.js";

/**
 * Cache entry with metadata for TTL and LRU management
 */
interface CacheEntry {
  /** Cached persona object */
  persona: LoadedPersona;

  /** Entry creation timestamp */
  createdAt: number;

  /** Last access timestamp for LRU */
  lastAccessedAt: number;

  /** TTL expiration timestamp */
  expiresAt: number;

  /** Access count for statistics */
  accessCount: number;

  /** File system watchers for auto-invalidation */
  watchers?: FSWatcher[];

  /** Estimated memory usage in bytes */
  memorySize: number;
}

/**
 * Cache key structure for efficient lookups
 */
interface CacheKey {
  /** Persona name */
  name: string;

  /** Source path hash for uniqueness */
  pathHash: string;
}

/**
 * Cache eviction reasons for monitoring
 */
export enum EvictionReason {
  TTL_EXPIRED = "ttl_expired",
  LRU_EVICTION = "lru_eviction",
  MEMORY_LIMIT = "memory_limit",
  FILE_CHANGED = "file_changed",
  MANUAL_CLEAR = "manual_clear",
}

/**
 * Cache operation metrics for performance monitoring
 */
export interface CacheMetrics {
  /** Total cache operations */
  operations: number;

  /** Average lookup time in microseconds */
  averageLookupTime: number;

  /** Cache hit ratio over time windows */
  hitRatioHistory: number[];

  /** Memory usage over time */
  memoryUsageHistory: number[];

  /** Eviction counts by reason */
  evictionCounts: Record<EvictionReason, number>;
}

/**
 * Cache events for monitoring and integration
 */
export enum CacheEvents {
  CACHE_HIT = "cache:hit",
  CACHE_MISS = "cache:miss",
  CACHE_SET = "cache:set",
  CACHE_EVICTED = "cache:evicted",
  CACHE_CLEARED = "cache:cleared",
  FILE_CHANGED = "cache:file_changed",
  MEMORY_WARNING = "cache:memory_warning",
}

/**
 * High-performance PersonaCache with comprehensive features
 *
 * Features:
 * - TTL-based expiration with configurable defaults
 * - LRU eviction for memory management
 * - File system monitoring for auto-invalidation
 * - Memory usage tracking and limits
 * - Performance metrics and statistics
 * - Thread-safe operations
 * - Event emission for monitoring
 */
export class PersonaCache extends EventEmitter {
  private readonly config: Required<PersonaCacheConfig>;
  private readonly cache = new Map<string, CacheEntry>();
  private readonly accessOrder: string[] = [];
  private stats: PersonaCacheStats;
  private metrics: CacheMetrics;
  private totalMemoryUsage = 0;
  private operationCounter = 0;
  private lookupTimes: number[] = [];

  // Cleanup intervals
  private ttlCleanupInterval?: NodeJS.Timeout;
  private metricsUpdateInterval?: NodeJS.Timeout;

  constructor(config: PersonaCacheConfig = {}) {
    super();

    // Apply defaults
    this.config = {
      ttl: config.ttl ?? 5 * 60 * 1000, // 5 minutes
      maxSize: config.maxSize ?? 100,
      enableStats: config.enableStats ?? true,
    };

    // Initialize statistics
    this.stats = {
      hits: 0,
      misses: 0,
      size: 0,
      hitRate: 0,
      memoryUsage: 0,
    };

    // Initialize metrics
    this.metrics = {
      operations: 0,
      averageLookupTime: 0,
      hitRatioHistory: [],
      memoryUsageHistory: [],
      evictionCounts: {
        [EvictionReason.TTL_EXPIRED]: 0,
        [EvictionReason.LRU_EVICTION]: 0,
        [EvictionReason.MEMORY_LIMIT]: 0,
        [EvictionReason.FILE_CHANGED]: 0,
        [EvictionReason.MANUAL_CLEAR]: 0,
      },
    };

    this.startBackgroundTasks();
  }

  /**
   * Get a cached persona with performance tracking
   */
  public get(name: string, sourcePath?: string): LoadedPersona | null {
    const startTime = process.hrtime.bigint();
    this.operationCounter++;

    try {
      const key = this.createCacheKey(name, sourcePath);
      const keyString = this.serializeCacheKey(key);
      const entry = this.cache.get(keyString);

      if (!entry) {
        this.recordCacheMiss();
        return null;
      }

      // Check TTL expiration
      const now = Date.now();
      if (now > entry.expiresAt) {
        this.evictEntry(keyString, EvictionReason.TTL_EXPIRED);
        this.recordCacheMiss();
        return null;
      }

      // Update access tracking for LRU
      entry.lastAccessedAt = now;
      entry.accessCount++;
      this.updateAccessOrder(keyString);

      this.recordCacheHit();
      this.emit(CacheEvents.CACHE_HIT, {
        name,
        sourcePath,
        persona: entry.persona,
      });

      return entry.persona;
    } finally {
      // Record lookup time
      const endTime = process.hrtime.bigint();
      const durationMicros = Number(endTime - startTime) / 1000;
      this.lookupTimes.push(durationMicros);

      // Keep only recent lookup times for rolling average
      if (this.lookupTimes.length > 1000) {
        this.lookupTimes = this.lookupTimes.slice(-500);
      }
    }
  }

  /**
   * Set a persona in the cache with file system monitoring
   */
  public set(persona: LoadedPersona): void {
    const key = this.createCacheKey(persona.config.name, persona.sourcePath);
    const keyString = this.serializeCacheKey(key);
    const now = Date.now();

    // Check if we need to evict before adding
    this.enforceMemoryLimits();
    this.enforceSizeLimit();

    // Remove existing entry if present
    if (this.cache.has(keyString)) {
      this.evictEntry(keyString, EvictionReason.MANUAL_CLEAR);
    }

    // Estimate memory usage
    const memorySize = this.estimatePersonaMemoryUsage(persona);

    // Create cache entry
    const entry: CacheEntry = {
      persona,
      createdAt: now,
      lastAccessedAt: now,
      expiresAt: now + this.config.ttl,
      accessCount: 1,
      memorySize,
      watchers: this.setupFileWatchers(persona, keyString),
    };

    // Add to cache
    this.cache.set(keyString, entry);
    this.accessOrder.push(keyString);
    this.totalMemoryUsage += memorySize;

    this.updateStats();
    this.emit(CacheEvents.CACHE_SET, {
      name: persona.config.name,
      sourcePath: persona.sourcePath,
    });
  }

  /**
   * Check if a persona is cached
   */
  public has(name: string, sourcePath?: string): boolean {
    const key = this.createCacheKey(name, sourcePath);
    const keyString = this.serializeCacheKey(key);
    const entry = this.cache.get(keyString);

    if (!entry) {
      return false;
    }

    // Check TTL
    const now = Date.now();
    if (now > entry.expiresAt) {
      this.evictEntry(keyString, EvictionReason.TTL_EXPIRED);
      return false;
    }

    return true;
  }

  /**
   * Remove a specific persona from cache
   */
  public delete(name: string, sourcePath?: string): boolean {
    const key = this.createCacheKey(name, sourcePath);
    const keyString = this.serializeCacheKey(key);

    if (this.cache.has(keyString)) {
      this.evictEntry(keyString, EvictionReason.MANUAL_CLEAR);
      return true;
    }

    return false;
  }

  /**
   * Clear all cached personas
   */
  public clear(): void {
    const keysToEvict = Array.from(this.cache.keys());

    for (const key of keysToEvict) {
      this.evictEntry(key, EvictionReason.MANUAL_CLEAR);
    }

    this.emit(CacheEvents.CACHE_CLEARED, { count: keysToEvict.length });
  }

  /**
   * Get current cache statistics
   */
  public getStats(): PersonaCacheStats {
    return { ...this.stats };
  }

  /**
   * Get detailed cache metrics
   */
  public getMetrics(): CacheMetrics {
    return {
      ...this.metrics,
      averageLookupTime: this.calculateAverageLookupTime(),
    };
  }

  /**
   * Get all cached persona names
   */
  public getCachedPersonaNames(): string[] {
    const names = new Set<string>();

    this.cache.forEach((_, keyString) => {
      const key = this.deserializeCacheKey(keyString);
      names.add(key.name);
    });

    return Array.from(names);
  }

  /**
   * Invalidate cache entries for a specific source path
   */
  public invalidateByPath(sourcePath: string): number {
    let invalidatedCount = 0;
    const keysToInvalidate: string[] = [];

    this.cache.forEach((entry, keyString) => {
      if (entry.persona.sourcePath === sourcePath) {
        keysToInvalidate.push(keyString);
      }
    });

    for (const key of keysToInvalidate) {
      this.evictEntry(key, EvictionReason.FILE_CHANGED);
      invalidatedCount++;
    }

    return invalidatedCount;
  }

  /**
   * Refresh TTL for a cached persona
   */
  public refreshTTL(
    name: string,
    sourcePath?: string,
    customTTL?: number
  ): boolean {
    const key = this.createCacheKey(name, sourcePath);
    const keyString = this.serializeCacheKey(key);
    const entry = this.cache.get(keyString);

    if (!entry) {
      return false;
    }

    const ttl = customTTL ?? this.config.ttl;
    entry.expiresAt = Date.now() + ttl;
    entry.lastAccessedAt = Date.now();
    this.updateAccessOrder(keyString);

    return true;
  }

  /**
   * Cleanup and destroy cache
   */
  public destroy(): void {
    this.clear();
    this.stopBackgroundTasks();
    this.removeAllListeners();
  }

  /**
   * Create cache key for a persona
   */
  private createCacheKey(name: string, sourcePath?: string): CacheKey {
    // Create a simple hash of the source path for uniqueness
    const pathHash = sourcePath ? this.hashString(sourcePath) : "default";

    return {
      name,
      pathHash,
    };
  }

  /**
   * Serialize cache key to string
   */
  private serializeCacheKey(key: CacheKey): string {
    return `${key.name}:${key.pathHash}`;
  }

  /**
   * Deserialize cache key from string
   */
  private deserializeCacheKey(keyString: string): CacheKey {
    const [name, pathHash] = keyString.split(":", 2);
    return { name, pathHash };
  }

  /**
   * Simple string hashing function
   */
  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Setup file system watchers for auto-invalidation
   */
  private setupFileWatchers(
    persona: LoadedPersona,
    cacheKey: string
  ): FSWatcher[] {
    const watchers: FSWatcher[] = [];

    try {
      // Watch the main config file
      if (persona.assets.configFile) {
        const configWatcher = watch(persona.assets.configFile, {
          persistent: false,
        });
        configWatcher.on("change", () =>
          this.handleFileChange(cacheKey, persona.assets.configFile)
        );
        watchers.push(configWatcher);
      }

      // Watch MCP config file if present
      if (persona.assets.mcpConfigFile) {
        const mcpWatcher = watch(persona.assets.mcpConfigFile, {
          persistent: false,
        });
        mcpWatcher.on("change", () =>
          this.handleFileChange(cacheKey, persona.assets.mcpConfigFile!)
        );
        watchers.push(mcpWatcher);
      }

      // Watch the persona directory for structural changes
      const dirWatcher = watch(dirname(persona.assets.configFile), {
        persistent: false,
      });
      dirWatcher.on("change", () =>
        this.handleFileChange(cacheKey, persona.sourcePath)
      );
      watchers.push(dirWatcher);
    } catch (error) {
      // File watching is best-effort, don't fail the cache operation
      console.warn(
        `Failed to setup file watchers for persona "${persona.config.name}":`,
        error
      );
    }

    return watchers;
  }

  /**
   * Handle file system changes
   */
  private handleFileChange(cacheKey: string, filePath: string): void {
    this.emit(CacheEvents.FILE_CHANGED, { cacheKey, filePath });
    this.evictEntry(cacheKey, EvictionReason.FILE_CHANGED);
  }

  /**
   * Evict a cache entry with cleanup
   */
  private evictEntry(keyString: string, reason: EvictionReason): void {
    const entry = this.cache.get(keyString);
    if (!entry) {
      return;
    }

    // Cleanup file watchers
    if (entry.watchers) {
      for (const watcher of entry.watchers) {
        try {
          watcher.close();
        } catch (error) {
          // Ignore cleanup errors
        }
      }
    }

    // Remove from cache and tracking
    this.cache.delete(keyString);
    this.totalMemoryUsage -= entry.memorySize;

    const orderIndex = this.accessOrder.indexOf(keyString);
    if (orderIndex >= 0) {
      this.accessOrder.splice(orderIndex, 1);
    }

    // Update metrics
    this.metrics.evictionCounts[reason]++;
    this.updateStats();

    this.emit(CacheEvents.CACHE_EVICTED, {
      name: entry.persona.config.name,
      sourcePath: entry.persona.sourcePath,
      reason,
    });
  }

  /**
   * Update access order for LRU
   */
  private updateAccessOrder(keyString: string): void {
    const index = this.accessOrder.indexOf(keyString);
    if (index >= 0) {
      // Move to end (most recently used)
      this.accessOrder.splice(index, 1);
      this.accessOrder.push(keyString);
    }
  }

  /**
   * Enforce memory limits with LRU eviction
   */
  private enforceMemoryLimits(): void {
    // Simple memory pressure check (could be made more sophisticated)
    const memoryLimitBytes = 100 * 1024 * 1024; // 100MB default limit

    while (
      this.totalMemoryUsage > memoryLimitBytes &&
      this.accessOrder.length > 0
    ) {
      const lruKey = this.accessOrder[0];
      this.evictEntry(lruKey, EvictionReason.MEMORY_LIMIT);
    }

    // Emit warning if memory usage is still high
    if (this.totalMemoryUsage > memoryLimitBytes * 0.8) {
      this.emit(CacheEvents.MEMORY_WARNING, {
        currentUsage: this.totalMemoryUsage,
        limit: memoryLimitBytes,
      });
    }
  }

  /**
   * Enforce maximum cache size with LRU eviction
   */
  private enforceSizeLimit(): void {
    while (
      this.cache.size >= this.config.maxSize &&
      this.accessOrder.length > 0
    ) {
      const lruKey = this.accessOrder[0];
      this.evictEntry(lruKey, EvictionReason.LRU_EVICTION);
    }
  }

  /**
   * Estimate memory usage of a persona
   */
  private estimatePersonaMemoryUsage(persona: LoadedPersona): number {
    // Rough estimation based on JSON serialization
    try {
      const jsonSize = JSON.stringify(persona).length * 2; // UTF-16 characters
      const overhead = 200; // Object overhead
      return jsonSize + overhead;
    } catch {
      // Fallback to a reasonable estimate
      return 10 * 1024; // 10KB per persona
    }
  }

  /**
   * Record cache hit with statistics update
   */
  private recordCacheHit(): void {
    this.stats.hits++;
    this.updateHitRate();
  }

  /**
   * Record cache miss with statistics update
   */
  private recordCacheMiss(): void {
    this.stats.misses++;
    this.updateHitRate();
  }

  /**
   * Update hit rate calculation
   */
  private updateHitRate(): void {
    const total = this.stats.hits + this.stats.misses;
    this.stats.hitRate = total > 0 ? this.stats.hits / total : 0;
  }

  /**
   * Update cache statistics
   */
  private updateStats(): void {
    this.stats.size = this.cache.size;
    this.stats.memoryUsage = this.totalMemoryUsage;
    this.metrics.operations = this.operationCounter;
  }

  /**
   * Calculate average lookup time
   */
  private calculateAverageLookupTime(): number {
    if (this.lookupTimes.length === 0) {
      return 0;
    }

    const sum = this.lookupTimes.reduce((a, b) => a + b, 0);
    return sum / this.lookupTimes.length;
  }

  /**
   * Start background cleanup tasks
   */
  private startBackgroundTasks(): void {
    // TTL cleanup every 30 seconds
    this.ttlCleanupInterval = setInterval(() => {
      this.cleanupExpiredEntries();
    }, 30000);

    // Metrics update every 60 seconds
    this.metricsUpdateInterval = setInterval(() => {
      this.updateMetricsHistory();
    }, 60000);
  }

  /**
   * Stop background cleanup tasks
   */
  private stopBackgroundTasks(): void {
    if (this.ttlCleanupInterval) {
      clearInterval(this.ttlCleanupInterval);
      this.ttlCleanupInterval = undefined;
    }

    if (this.metricsUpdateInterval) {
      clearInterval(this.metricsUpdateInterval);
      this.metricsUpdateInterval = undefined;
    }
  }

  /**
   * Cleanup expired cache entries
   */
  private cleanupExpiredEntries(): void {
    const now = Date.now();
    const expiredKeys: string[] = [];

    this.cache.forEach((entry, keyString) => {
      if (now > entry.expiresAt) {
        expiredKeys.push(keyString);
      }
    });

    for (const key of expiredKeys) {
      this.evictEntry(key, EvictionReason.TTL_EXPIRED);
    }
  }

  /**
   * Update metrics history for trending
   */
  private updateMetricsHistory(): void {
    // Keep last 60 data points (1 hour with 1-minute intervals)
    const maxHistoryLength = 60;

    // Update hit ratio history
    this.metrics.hitRatioHistory.push(this.stats.hitRate);
    if (this.metrics.hitRatioHistory.length > maxHistoryLength) {
      this.metrics.hitRatioHistory =
        this.metrics.hitRatioHistory.slice(-maxHistoryLength);
    }

    // Update memory usage history
    this.metrics.memoryUsageHistory.push(this.totalMemoryUsage);
    if (this.metrics.memoryUsageHistory.length > maxHistoryLength) {
      this.metrics.memoryUsageHistory =
        this.metrics.memoryUsageHistory.slice(-maxHistoryLength);
    }
  }
}

/**
 * Create a persona cache with default configuration
 */
export function createPersonaCache(config?: PersonaCacheConfig): PersonaCache {
  return new PersonaCache(config);
}

/**
 * Singleton cache instance for application-wide use
 */
export const defaultPersonaCache = new PersonaCache();

/**
 * Cache factory for testing and multiple cache instances
 */
export class PersonaCacheFactory {
  private static instances = new Map<string, PersonaCache>();

  /**
   * Get or create a named cache instance
   */
  public static getInstance(
    name: string,
    config?: PersonaCacheConfig
  ): PersonaCache {
    if (!this.instances.has(name)) {
      this.instances.set(name, new PersonaCache(config));
    }
    return this.instances.get(name)!;
  }

  /**
   * Destroy a named cache instance
   */
  public static destroyInstance(name: string): boolean {
    const instance = this.instances.get(name);
    if (instance) {
      instance.destroy();
      this.instances.delete(name);
      return true;
    }
    return false;
  }

  /**
   * Destroy all cache instances
   */
  public static destroyAll(): void {
    this.instances.forEach((instance, name) => {
      instance.destroy();
    });
    this.instances.clear();
  }

  /**
   * Get all active cache instance names
   */
  public static getActiveInstances(): string[] {
    return Array.from(this.instances.keys());
  }
}
