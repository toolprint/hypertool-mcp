/**
 * Persona Discovery Engine
 *
 * This module implements the main discovery engine that orchestrates finding,
 * quick-validating, and cataloging personas with caching support. The discovery
 * engine coordinates file system scanning, quick validation, and result caching
 * to provide efficient persona discovery across all configured search paths.
 *
 * @fileoverview Main persona discovery orchestration engine
 */

import { EventEmitter } from "events";
import { promises as fs } from "fs";
import { basename, extname } from "path";
import type {
  PersonaReference,
  PersonaDiscoveryResult,
  PersonaDiscoveryConfig,
  PersonaCacheConfig,
  PersonaCacheStats,
} from "./types.js";
import { PersonaEvents } from "./types.js";
import {
  scanForPersonas,
  getStandardSearchPaths,
  validateSearchPath,
  hasPersonasInPaths,
} from "./scanner.js";
import {
  createFileSystemError,
  createPersonaNotFoundError,
  isPersonaError,
  PersonaError,
} from "./errors.js";
import { getSupportedPersonaFiles, isValidYAMLSyntax } from "./parser.js";

/**
 * Discovery cache entry interface
 */
interface DiscoveryCacheEntry {
  /** Discovery result data */
  result: PersonaDiscoveryResult;
  /** Cache entry timestamp */
  cachedAt: Date;
  /** Time to live in milliseconds */
  ttl: number;
  /** Hash of discovery configuration for invalidation */
  configHash: string;
}

/**
 * Discovery cache statistics
 */
interface DiscoveryStats {
  /** Total discovery operations */
  totalDiscoveries: number;
  /** Cache hits */
  cacheHits: number;
  /** Cache misses */
  cacheMisses: number;
  /** Last discovery timestamp */
  lastDiscovery?: Date;
  /** Average discovery time in milliseconds */
  averageDiscoveryTime: number;
  /** Total personas found in last discovery */
  lastPersonaCount: number;
}

/**
 * Internal discovery context for tracking state
 */
interface DiscoveryContext {
  /** Configuration used for discovery */
  config: PersonaDiscoveryConfig;
  /** Start time for performance tracking */
  startTime: Date;
  /** Collected errors during discovery */
  errors: string[];
  /** Collected warnings during discovery */
  warnings: string[];
  /** Search paths being processed */
  searchPaths: string[];
}

/**
 * Quick validation result for persona references
 */
interface QuickValidationResult {
  /** Whether the persona appears valid */
  isValid: boolean;
  /** Brief description if extractable */
  description?: string;
  /** Issues found during quick validation */
  issues: string[];
}

/**
 * Main persona discovery engine class
 *
 * Orchestrates the discovery of personas across all configured search paths,
 * providing quick validation, result caching, and change detection capabilities.
 * Extends EventEmitter to provide real-time updates on discovery progress.
 */
export class PersonaDiscovery extends EventEmitter {
  private readonly cache = new Map<string, DiscoveryCacheEntry>();
  private readonly stats: DiscoveryStats = {
    totalDiscoveries: 0,
    cacheHits: 0,
    cacheMisses: 0,
    averageDiscoveryTime: 0,
    lastPersonaCount: 0,
  };

  private readonly cacheConfig: Required<PersonaCacheConfig>;
  private lastCleanup = new Date();

  constructor(cacheConfig?: PersonaCacheConfig) {
    super();

    // Set default cache configuration
    this.cacheConfig = {
      ttl: cacheConfig?.ttl ?? 5 * 60 * 1000, // 5 minutes
      maxSize: cacheConfig?.maxSize ?? 100,
      enableStats: cacheConfig?.enableStats ?? true,
    };

    // Setup periodic cache cleanup
    this.setupCacheCleanup();
  }

  /**
   * Discover personas from all configured paths
   *
   * @param config Discovery configuration options
   * @returns Promise resolving to discovery result
   */
  public async discoverPersonas(
    config: PersonaDiscoveryConfig = {}
  ): Promise<PersonaDiscoveryResult> {
    const context = this.createDiscoveryContext(config);

    try {
      // Check cache first
      const cacheKey = this.generateCacheKey(config);
      const cachedResult = this.getCachedResult(cacheKey);

      if (cachedResult) {
        this.stats.cacheHits++;
        this.emit(PersonaEvents.PERSONA_DISCOVERED, {
          count: cachedResult.personas.length,
          fromCache: true,
        });
        return cachedResult;
      }

      this.stats.cacheMisses++;

      // Perform discovery
      const result = await this.performDiscovery(context);

      // Cache the result
      this.cacheResult(cacheKey, result, config);

      // Update statistics
      this.updateStats(context, result);

      // Emit discovery event
      this.emit(PersonaEvents.PERSONA_DISCOVERED, {
        count: result.personas.length,
        fromCache: false,
        duration: Date.now() - context.startTime.getTime(),
      });

      return result;
    } catch (error) {
      const personaError = isPersonaError(error)
        ? error
        : createFileSystemError(
            "discovering personas",
            "multiple paths",
            error as Error
          );

      context.errors.push(personaError.message);

      // Return partial result with errors
      const result: PersonaDiscoveryResult = {
        personas: [],
        errors: context.errors,
        warnings: context.warnings,
        searchPaths: context.searchPaths,
      };

      return result;
    }
  }

  /**
   * Refresh discovery cache and rescan for personas
   *
   * @param config Discovery configuration options
   * @returns Promise resolving to fresh discovery result
   */
  public async refreshDiscovery(
    config: PersonaDiscoveryConfig = {}
  ): Promise<PersonaDiscoveryResult> {
    // Clear relevant cache entries
    const cacheKey = this.generateCacheKey(config);
    this.cache.delete(cacheKey);

    // Perform fresh discovery
    return this.discoverPersonas(config);
  }

  /**
   * Check if personas are available without full discovery
   *
   * @param config Discovery configuration options
   * @returns Promise resolving to true if personas are likely available
   */
  public async hasPersonas(
    config: PersonaDiscoveryConfig = {}
  ): Promise<boolean> {
    try {
      return await hasPersonasInPaths(config);
    } catch (error) {
      // If we can't determine, assume false
      return false;
    }
  }

  /**
   * Get discovery cache statistics
   *
   * @returns Current cache statistics
   */
  public getCacheStats(): PersonaCacheStats {
    const totalRequests = this.stats.cacheHits + this.stats.cacheMisses;
    const hitRate =
      totalRequests > 0 ? this.stats.cacheHits / totalRequests : 0;

    return {
      hits: this.stats.cacheHits,
      misses: this.stats.cacheMisses,
      size: this.cache.size,
      hitRate,
      memoryUsage: this.estimateMemoryUsage(),
    };
  }

  /**
   * Get discovery statistics
   *
   * @returns Current discovery statistics
   */
  public getDiscoveryStats(): DiscoveryStats {
    return { ...this.stats };
  }

  /**
   * Clear discovery cache
   */
  public clearCache(): void {
    this.cache.clear();
    this.stats.cacheHits = 0;
    this.stats.cacheMisses = 0;
  }

  /**
   * Get standard search paths
   *
   * @returns Array of standard search paths
   */
  public getStandardSearchPaths(): string[] {
    return getStandardSearchPaths();
  }

  /**
   * Validate a search path
   *
   * @param path Path to validate
   * @returns Promise resolving to true if path is valid
   */
  public async validateSearchPath(path: string): Promise<boolean> {
    return validateSearchPath(path);
  }

  /**
   * Create discovery context for tracking state
   */
  private createDiscoveryContext(
    config: PersonaDiscoveryConfig
  ): DiscoveryContext {
    const standardPath = getStandardSearchPaths()[0]; // Now always returns single path
    const additionalPaths = config.additionalPaths ?? [];

    // Only include additional paths if explicitly provided
    const searchPaths =
      additionalPaths.length > 0
        ? Array.from(new Set([standardPath, ...additionalPaths]))
        : [standardPath];

    return {
      config,
      startTime: new Date(),
      errors: [],
      warnings: [],
      searchPaths,
    };
  }

  /**
   * Perform the actual discovery operation
   */
  private async performDiscovery(
    context: DiscoveryContext
  ): Promise<PersonaDiscoveryResult> {
    try {
      // Use the scanner to find persona references
      const personas = await scanForPersonas(context.config);

      // Perform quick validation on each discovered persona
      const validatedPersonas = await Promise.all(
        personas.map(async (persona) =>
          this.quickValidatePersona(persona, context)
        )
      );

      // Filter out any null results from validation failures
      const finalPersonas = validatedPersonas.filter(
        (p): p is PersonaReference => p !== null
      );

      // Check for duplicate names and add warnings
      this.checkForDuplicates(finalPersonas, context);

      return {
        personas: finalPersonas,
        errors: context.errors,
        warnings: context.warnings,
        searchPaths: context.searchPaths,
      };
    } catch (error) {
      // Handle discovery errors gracefully
      if (isPersonaError(error)) {
        context.errors.push(error.message);
      } else {
        context.errors.push(
          `Discovery failed: ${error instanceof Error ? error.message : String(error)}`
        );
      }

      return {
        personas: [],
        errors: context.errors,
        warnings: context.warnings,
        searchPaths: context.searchPaths,
      };
    }
  }

  /**
   * Perform quick validation on a persona without full parsing
   */
  private async quickValidatePersona(
    persona: PersonaReference,
    context: DiscoveryContext
  ): Promise<PersonaReference | null> {
    try {
      if (persona.isArchive) {
        // For archives, basic file existence check was already done
        return persona;
      }

      // For directories, perform more thorough quick validation
      const validation = await this.performQuickValidation(persona.path);

      return {
        ...persona,
        isValid: validation.isValid,
        description: validation.description || persona.description,
        issues: validation.issues.length > 0 ? validation.issues : undefined,
      };
    } catch (error) {
      // Log validation error but don't fail entire discovery
      context.warnings.push(
        `Failed to validate persona at ${persona.path}: ${error instanceof Error ? error.message : String(error)}`
      );

      // Return persona as invalid but still discoverable
      return {
        ...persona,
        isValid: false,
        issues: ["Quick validation failed"],
      };
    }
  }

  /**
   * Perform quick validation without full YAML parsing
   */
  private async performQuickValidation(
    personaPath: string
  ): Promise<QuickValidationResult> {
    const result: QuickValidationResult = {
      isValid: false,
      issues: [],
    };

    try {
      // Find persona config file
      const supportedFiles = getSupportedPersonaFiles();
      let configContent: string | null = null;
      let configFile: string | null = null;

      for (const fileName of supportedFiles) {
        try {
          const filePath = `${personaPath}/${fileName}`;
          configContent = await fs.readFile(filePath, "utf-8");
          configFile = fileName;
          break;
        } catch {
          // File doesn't exist, try next
          continue;
        }
      }

      if (!configContent || !configFile) {
        result.issues.push("No persona.yaml or persona.yml file found");
        return result;
      }

      // Quick YAML syntax check without full parsing
      if (!isValidYAMLSyntax(configContent)) {
        result.issues.push("Invalid YAML syntax");
        return result;
      }

      // Extract basic information using regex (quick and dirty)
      const nameMatch = configContent.match(/^name:\s*["']?([^"'\n\r]+)["']?/m);
      const descMatch = configContent.match(
        /^description:\s*["']?([^"'\n\r]+)["']?/m
      );

      if (!nameMatch) {
        result.issues.push("Missing required 'name' field");
      } else {
        const name = nameMatch[1].trim();
        const expectedName = basename(personaPath);

        // Basic name format validation
        if (!/^[a-z][a-z0-9-]*[a-z0-9]$/.test(name)) {
          result.issues.push(
            "Invalid name format (should be hyphen-delimited lowercase)"
          );
        }

        // Name should match folder name
        if (name !== expectedName) {
          result.issues.push(
            `Name "${name}" doesn't match folder name "${expectedName}"`
          );
        }
      }

      if (!descMatch) {
        result.issues.push("Missing required 'description' field");
      } else {
        result.description = descMatch[1].trim();
        if (result.description.length < 10) {
          result.issues.push(
            "Description should be at least 10 characters long"
          );
        }
      }

      // Check for toolsets structure (basic)
      const toolsetsMatch = configContent.match(/^toolsets:\s*$/m);
      if (toolsetsMatch) {
        // Has toolsets, do basic validation
        const toolsetMatches = configContent.match(
          /^\s*-\s*name:\s*["']?([^"'\n\r]+)["']?/gm
        );
        if (!toolsetMatches) {
          result.issues.push("Toolsets section exists but no toolsets defined");
        } else {
          // Basic tool ID format validation
          const toolIdIssues = this.validateToolIdsInYaml(configContent);
          if (toolIdIssues.length > 0) {
            result.issues.push(...toolIdIssues);
          }
        }
      }

      // If we have only minor issues, consider it valid
      result.isValid = result.issues.length === 0;

      return result;
    } catch (error) {
      result.issues.push(
        `Validation error: ${error instanceof Error ? error.message : String(error)}`
      );
      return result;
    }
  }

  /**
   * Validate tool IDs in YAML content using basic regex matching
   *
   * This provides basic format validation during discovery without full parsing
   * to catch obvious tool ID format errors early.
   */
  private validateToolIdsInYaml(configContent: string): string[] {
    const issues: string[] = [];

    try {
      // Find toolsets section and extract only tool IDs from toolIds arrays
      const toolsetsSection = configContent.match(
        /^toolsets:\s*$(.*?)^(?:\w+:|$)/ms
      );

      if (toolsetsSection && toolsetsSection[1]) {
        const toolsetsContent = toolsetsSection[1];

        // Extract tool IDs only from toolIds sections
        // Look for "toolIds:" followed by list items
        const toolIdsMatches = toolsetsContent.match(
          /toolIds:\s*$((?:\s*-\s+[^\n\r]*$)+)/gm
        );

        if (toolIdsMatches) {
          // Basic tool ID format validation using the same pattern as ToolIdSchema
          const toolIdPattern =
            /^[a-zA-Z][a-zA-Z0-9_-]*(\.[a-zA-Z][a-zA-Z0-9_-]*)+$/;
          const invalidToolIds: string[] = [];

          for (const toolIdsBlock of toolIdsMatches) {
            // Extract individual tool ID lines
            const toolIdLines = toolIdsBlock.match(/^\s*-\s+(.+)$/gm);

            if (toolIdLines) {
              for (const line of toolIdLines) {
                const toolId = line.replace(/^\s*-\s+/, "").trim();

                // Skip if it looks like a YAML key (contains :)
                if (toolId.includes(":")) continue;

                // Validate against tool ID pattern
                if (!toolIdPattern.test(toolId)) {
                  invalidToolIds.push(toolId);
                }
              }
            }
          }

          if (invalidToolIds.length > 0) {
            issues.push(
              `Invalid tool ID format(s): ${invalidToolIds.join(", ")} - must follow namespacedName format (e.g., 'server.tool-name' or 'server.compound.tool-name')`
            );
          }
        }
      }
    } catch (error) {
      // Don't fail discovery for regex errors, just skip validation
      // This is best-effort validation
    }

    return issues;
  }

  /**
   * Check for duplicate persona names
   */
  private checkForDuplicates(
    personas: PersonaReference[],
    context: DiscoveryContext
  ): void {
    const nameMap = new Map<string, PersonaReference[]>();

    // Group personas by name
    for (const persona of personas) {
      if (!nameMap.has(persona.name)) {
        nameMap.set(persona.name, []);
      }
      nameMap.get(persona.name)!.push(persona);
    }

    // Check for duplicates
    for (const [name, personaGroup] of Array.from(nameMap.entries())) {
      if (personaGroup.length > 1) {
        const paths = personaGroup.map((p) => p.path);
        context.warnings.push(
          `Duplicate persona name "${name}" found in multiple locations: ${paths.join(", ")}`
        );
      }
    }
  }

  /**
   * Generate cache key for discovery configuration
   */
  private generateCacheKey(config: PersonaDiscoveryConfig): string {
    const configStr = JSON.stringify({
      additionalPaths: config.additionalPaths?.sort() ?? [],
      maxDepth: config.maxDepth ?? 3,
      followSymlinks: config.followSymlinks ?? false,
      ignorePatterns: config.ignorePatterns?.sort() ?? [],
      parallelScan: config.parallelScan ?? true,
    });

    // Simple hash function for cache key
    let hash = 0;
    for (let i = 0; i < configStr.length; i++) {
      const char = configStr.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }

    return `discovery_${hash}`;
  }

  /**
   * Get cached discovery result if valid
   */
  private getCachedResult(cacheKey: string): PersonaDiscoveryResult | null {
    const entry = this.cache.get(cacheKey);
    if (!entry) {
      return null;
    }

    // Check if entry is expired
    const now = new Date();
    const age = now.getTime() - entry.cachedAt.getTime();

    if (age > entry.ttl) {
      this.cache.delete(cacheKey);
      return null;
    }

    return entry.result;
  }

  /**
   * Cache discovery result
   */
  private cacheResult(
    cacheKey: string,
    result: PersonaDiscoveryResult,
    config: PersonaDiscoveryConfig
  ): void {
    // Enforce cache size limit
    if (this.cache.size >= this.cacheConfig.maxSize) {
      this.evictOldestEntry();
    }

    const configHash = this.generateCacheKey(config);
    const entry: DiscoveryCacheEntry = {
      result,
      cachedAt: new Date(),
      ttl: this.cacheConfig.ttl,
      configHash,
    };

    this.cache.set(cacheKey, entry);
  }

  /**
   * Evict oldest cache entry to make room
   */
  private evictOldestEntry(): void {
    let oldestKey: string | null = null;
    let oldestTime = new Date();

    for (const [key, entry] of Array.from(this.cache.entries())) {
      if (entry.cachedAt < oldestTime) {
        oldestTime = entry.cachedAt;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
    }
  }

  /**
   * Update discovery statistics
   */
  private updateStats(
    context: DiscoveryContext,
    result: PersonaDiscoveryResult
  ): void {
    const duration = Date.now() - context.startTime.getTime();

    this.stats.totalDiscoveries++;
    this.stats.lastDiscovery = new Date();
    this.stats.lastPersonaCount = result.personas.length;

    // Update rolling average
    const totalTime =
      this.stats.averageDiscoveryTime * (this.stats.totalDiscoveries - 1) +
      duration;
    this.stats.averageDiscoveryTime = Math.round(
      totalTime / this.stats.totalDiscoveries
    );
  }

  /**
   * Estimate memory usage of cache
   */
  private estimateMemoryUsage(): number {
    let totalSize = 0;

    for (const entry of Array.from(this.cache.values())) {
      // Rough estimate: JSON size * 2 (for object overhead)
      const entrySize = JSON.stringify(entry).length * 2;
      totalSize += entrySize;
    }

    return totalSize;
  }

  /**
   * Setup periodic cache cleanup
   */
  private setupCacheCleanup(): void {
    // Clean up expired entries every 2 minutes
    const intervalId = setInterval(
      () => {
        this.cleanupExpiredEntries();
      },
      2 * 60 * 1000
    );

    // Allow process to exit even if interval is active (see docs/bugs/process-exit-unref.md)
    intervalId.unref();
  }

  /**
   * Clean up expired cache entries
   */
  private cleanupExpiredEntries(): void {
    const now = new Date();
    const keysToDelete: string[] = [];

    for (const [key, entry] of Array.from(this.cache.entries())) {
      const age = now.getTime() - entry.cachedAt.getTime();
      if (age > entry.ttl) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      this.cache.delete(key);
    }

    this.lastCleanup = now;
  }

  /**
   * Clean up resources and stop timers
   */
  public dispose(): void {
    this.removeAllListeners();
    this.clearCache();
    // Note: The interval timer will be cleaned up automatically when the process exits
  }
}

/**
 * Default persona discovery instance
 *
 * Pre-configured discovery instance with default settings for common use cases.
 */
export const defaultPersonaDiscovery = new PersonaDiscovery();

/**
 * Discover personas using default discovery instance
 *
 * @param config Discovery configuration options
 * @returns Promise resolving to discovery result
 */
export async function discoverPersonas(
  config?: PersonaDiscoveryConfig
): Promise<PersonaDiscoveryResult> {
  return defaultPersonaDiscovery.discoverPersonas(config);
}

/**
 * Refresh personas using default discovery instance
 *
 * @param config Discovery configuration options
 * @returns Promise resolving to fresh discovery result
 */
export async function refreshPersonaDiscovery(
  config?: PersonaDiscoveryConfig
): Promise<PersonaDiscoveryResult> {
  return defaultPersonaDiscovery.refreshDiscovery(config);
}

/**
 * Check if personas are available using default discovery instance
 *
 * @param config Discovery configuration options
 * @returns Promise resolving to true if personas are likely available
 */
export async function hasAvailablePersonas(
  config?: PersonaDiscoveryConfig
): Promise<boolean> {
  return defaultPersonaDiscovery.hasPersonas(config);
}

/**
 * Get discovery cache statistics from default instance
 *
 * @returns Current cache statistics
 */
export function getDiscoveryCacheStats(): PersonaCacheStats {
  return defaultPersonaDiscovery.getCacheStats();
}

/**
 * Clear discovery cache from default instance
 */
export function clearDiscoveryCache(): void {
  defaultPersonaDiscovery.clearCache();
}
