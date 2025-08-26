/**
 * PersonaMcpIntegration Implementation
 *
 * This module implements integration with the MCP configuration system to apply
 * persona-specific server configurations. When a persona is activated, its MCP
 * configuration is merged with the existing MCP configuration, and when deactivated,
 * the original configuration is restored.
 *
 * @fileoverview MCP configuration integration for persona content pack system
 */

import { promises as fs } from "fs";
import { createChildLogger } from "../utils/logging.js";
import { MCPConfigParser } from "../config/mcpConfigParser.js";
import type { MCPConfig, ServerEntry } from "../types/config.js";
import type { PersonaAssets } from "./types.js";
import {
  PersonaError,
  createMcpConfigConflictError,
  createFileSystemError,
} from "./errors.js";
import { PersonaErrorCode } from "./types.js";

const logger = createChildLogger({ module: "persona/mcp-integration" });

/**
 * MCP configuration backup for restoration
 */
export interface McpConfigBackup {
  /** Original MCP configuration */
  originalConfig: MCPConfig;

  /** Backup timestamp */
  backupTimestamp: Date;

  /** Source of the backup (e.g., "file", "database") */
  source: string;

  /** Original config file path if applicable */
  originalConfigPath?: string;

  /** Additional metadata */
  metadata?: Record<string, any>;
}

/**
 * Configuration merge options
 */
export interface McpConfigMergeOptions {
  /** How to resolve server name conflicts */
  conflictResolution: "persona-wins" | "base-wins" | "user-choice" | "error";

  /** Whether to preserve environment variables from base config */
  preserveBaseEnv?: boolean;

  /** Whether to merge environment variables or replace them */
  mergeEnvironment?: boolean;

  /** Custom conflict resolver function */
  customResolver?: (
    serverName: string,
    baseServer: ServerEntry,
    personaServer: ServerEntry
  ) => ServerEntry | null;
}

/**
 * Configuration merge result
 */
export interface McpConfigMergeResult {
  /** Whether merge was successful */
  success: boolean;

  /** Merged configuration */
  mergedConfig?: MCPConfig;

  /** List of conflicts encountered */
  conflicts: string[];

  /** Warnings during merge */
  warnings: string[];

  /** Errors during merge */
  errors: string[];

  /** Statistics about the merge */
  stats: {
    baseServersCount: number;
    personaServersCount: number;
    mergedServersCount: number;
    conflictsResolved: number;
  };
}

/**
 * PersonaMcpIntegration class for handling MCP config operations
 *
 * Provides functionality to merge persona MCP configurations with existing
 * configurations, handle conflicts, backup and restore configurations, and
 * manage server connections during persona activation/deactivation.
 */
export class PersonaMcpIntegration {
  private currentBackup: McpConfigBackup | null = null;
  private readonly parser: MCPConfigParser;
  private readonly defaultMergeOptions: McpConfigMergeOptions;

  constructor(
    private readonly getCurrentConfig: () => Promise<MCPConfig | null>,
    private readonly setCurrentConfig: (config: MCPConfig) => Promise<void>,
    private readonly restartConnections?: () => Promise<void>,
    mergeOptions?: Partial<McpConfigMergeOptions>
  ) {
    this.parser = new MCPConfigParser({
      validatePaths: true,
      allowRelativePaths: true,
      strict: false,
    });

    this.defaultMergeOptions = {
      conflictResolution: "persona-wins",
      preserveBaseEnv: true,
      mergeEnvironment: true,
      ...mergeOptions,
    };
  }

  /**
   * Apply persona MCP configuration
   *
   * Loads the persona's MCP configuration, merges it with the current configuration,
   * and applies the result. Creates a backup for later restoration.
   *
   * @param mcpConfigFile - Path to persona's mcp.json file
   * @param options - Merge options
   * @returns Promise resolving to merge result
   */
  public async applyPersonaConfig(
    mcpConfigFile: string,
    options?: Partial<McpConfigMergeOptions>
  ): Promise<McpConfigMergeResult> {
    try {
      logger.info(`Loading persona MCP configuration from: ${mcpConfigFile}`);

      // Load persona MCP configuration
      const personaConfig = await this.loadPersonaMcpConfig(mcpConfigFile);

      // Log the servers found in the persona config
      const serverNames = Object.keys(personaConfig.mcpServers);
      if (serverNames.length > 0) {
        logger.info(
          `Found ${serverNames.length} MCP server${serverNames.length !== 1 ? "s" : ""} in persona config: ${serverNames.join(", ")}`
        );
      } else {
        logger.info("No MCP servers found in persona configuration");
      }

      // Get current MCP configuration
      const currentConfig = await this.getCurrentConfig();

      if (!currentConfig) {
        logger.info(
          "No current MCP config found, using persona config directly"
        );

        // No base config to merge, just apply the persona config
        await this.setCurrentConfig(personaConfig);

        const warnings: string[] = [];

        // Note: setCurrentConfig already handles connecting to the servers,
        // so no need to call restartConnections() here

        return {
          success: true,
          mergedConfig: personaConfig,
          conflicts: [],
          warnings,
          errors: [],
          stats: {
            baseServersCount: 0,
            personaServersCount: Object.keys(personaConfig.mcpServers).length,
            mergedServersCount: Object.keys(personaConfig.mcpServers).length,
            conflictsResolved: 0,
          },
        };
      }

      // Create backup of current configuration
      await this.createConfigBackup(currentConfig);

      // Merge configurations
      const mergeResult = await this.mergeConfigurations(
        currentConfig,
        personaConfig,
        { ...this.defaultMergeOptions, ...options }
      );

      if (!mergeResult.success || !mergeResult.mergedConfig) {
        // Restore backup on merge failure
        if (this.currentBackup) {
          await this.restoreOriginalConfig();
        }
        return mergeResult;
      }

      // Apply merged configuration
      await this.setCurrentConfig(mergeResult.mergedConfig);

      // Restart connections if handler provided
      if (this.restartConnections) {
        try {
          await this.restartConnections();
        } catch (error) {
          logger.warn(
            "Failed to restart connections after applying persona config:",
            error
          );
          mergeResult.warnings.push(
            `Connection restart failed: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }

      logger.info("Successfully applied persona MCP configuration");
      return mergeResult;
    } catch (error) {
      const errorMessage = `Failed to apply persona MCP config: ${
        error instanceof Error ? error.message : String(error)
      }`;

      logger.error(errorMessage, error);

      return {
        success: false,
        conflicts: [],
        warnings: [],
        errors: [errorMessage],
        stats: {
          baseServersCount: 0,
          personaServersCount: 0,
          mergedServersCount: 0,
          conflictsResolved: 0,
        },
      };
    }
  }

  /**
   * Restore original MCP configuration
   *
   * Restores the configuration that was backed up before persona activation.
   *
   * @returns Promise resolving when restoration is complete
   */
  public async restoreOriginalConfig(): Promise<void> {
    if (!this.currentBackup) {
      logger.warn("No backup available for restoration");
      return;
    }

    try {
      logger.debug("Restoring original MCP configuration");

      // Restore the backed-up configuration
      await this.setCurrentConfig(this.currentBackup.originalConfig);

      // Restart connections if handler provided
      if (this.restartConnections) {
        try {
          await this.restartConnections();
        } catch (error) {
          logger.warn(
            "Failed to restart connections after restoring config:",
            error
          );
          // Don't throw here as the restore was successful
        }
      }

      // Clear the backup
      this.currentBackup = null;

      logger.info("Successfully restored original MCP configuration");
    } catch (error) {
      const errorMessage = `Failed to restore original MCP config: ${
        error instanceof Error ? error.message : String(error)
      }`;

      logger.error(errorMessage, error);
      throw new PersonaError(
        PersonaErrorCode.MCP_CONFIG_CONFLICT,
        errorMessage,
        {
          recoverable: false,
          suggestions: [
            "Check if the MCP configuration system is accessible",
            "Try manually restarting the MCP server",
            "Check system logs for additional error details",
          ],
        }
      );
    }
  }

  /**
   * Check if there's a backup available for restoration
   */
  public hasBackup(): boolean {
    return this.currentBackup !== null;
  }

  /**
   * Get backup information
   */
  public getBackupInfo(): McpConfigBackup | null {
    return this.currentBackup;
  }

  /**
   * Load persona MCP configuration from file
   */
  private async loadPersonaMcpConfig(filePath: string): Promise<MCPConfig> {
    try {
      const parseResult = await this.parser.parseFile(filePath);

      if (!parseResult.success || !parseResult.config) {
        const errorMessage =
          parseResult.error ||
          `Parse failed: ${parseResult.validationErrors?.join(", ") || "Unknown error"}`;
        throw createFileSystemError(
          "parsing persona MCP config",
          filePath,
          new Error(errorMessage)
        );
      }

      if (
        parseResult.validationErrors &&
        parseResult.validationErrors.length > 0
      ) {
        logger.warn(
          `Persona MCP config has warnings: ${parseResult.validationErrors.join(", ")}`
        );
      }

      return parseResult.config;
    } catch (error) {
      if (error instanceof PersonaError) {
        throw error;
      }

      throw createFileSystemError(
        "loading persona MCP config",
        filePath,
        error as Error
      );
    }
  }

  /**
   * Create backup of current configuration
   */
  private async createConfigBackup(config: MCPConfig): Promise<void> {
    this.currentBackup = {
      originalConfig: JSON.parse(JSON.stringify(config)), // Deep copy
      backupTimestamp: new Date(),
      source: "persona-integration",
      metadata: {
        configHash: this.generateConfigHash(config),
      },
    };

    logger.debug("Created MCP configuration backup");
  }

  /**
   * Merge base and persona MCP configurations
   */
  private async mergeConfigurations(
    baseConfig: MCPConfig,
    personaConfig: MCPConfig,
    options: McpConfigMergeOptions
  ): Promise<McpConfigMergeResult> {
    const conflicts: string[] = [];
    const warnings: string[] = [];
    const errors: string[] = [];
    const mergedServers: Record<string, ServerEntry> = {};

    let conflictsResolved = 0;

    try {
      // Start with base config servers
      const baseServers = { ...baseConfig.mcpServers };
      const personaServers = { ...personaConfig.mcpServers };

      // Copy all base servers first
      for (const [serverName, serverConfig] of Object.entries(baseServers)) {
        mergedServers[serverName] = { ...serverConfig };
      }

      // Process persona servers
      for (const [serverName, personaServer] of Object.entries(
        personaServers
      )) {
        const baseServer = baseServers[serverName];

        if (!baseServer) {
          // No conflict, add persona server
          mergedServers[serverName] = { ...personaServer };
          continue;
        }

        // Conflict detected
        conflicts.push(
          `Server "${serverName}" exists in both base and persona configurations`
        );

        let resolvedServer: ServerEntry | null = null;

        // Apply conflict resolution strategy
        // Custom resolver takes precedence if provided
        if (options.customResolver) {
          resolvedServer = options.customResolver(
            serverName,
            baseServer,
            personaServer
          );
        } else {
          switch (options.conflictResolution) {
            case "persona-wins":
              resolvedServer = this.mergeServerConfigs(
                baseServer,
                personaServer,
                options
              );
              break;

            case "base-wins":
              resolvedServer = this.mergeServerConfigs(
                personaServer,
                baseServer,
                options
              );
              warnings.push(`Using base config for server "${serverName}"`);
              break;

            case "user-choice":
              // In a real implementation, this would prompt the user
              // For now, default to persona-wins
              resolvedServer = this.mergeServerConfigs(
                baseServer,
                personaServer,
                options
              );
              warnings.push(
                `Auto-resolved conflict for server "${serverName}" (persona wins)`
              );
              break;

            case "error":
              errors.push(
                `Configuration conflict for server "${serverName}" - resolution required`
              );
              continue;

            default:
              resolvedServer = this.mergeServerConfigs(
                baseServer,
                personaServer,
                options
              );
          }
        }

        if (resolvedServer) {
          mergedServers[serverName] = resolvedServer;
          conflictsResolved++;
        }
      }

      const success = errors.length === 0;
      const mergedConfig: MCPConfig = {
        mcpServers: mergedServers,
      };

      return {
        success,
        mergedConfig: success ? mergedConfig : undefined,
        conflicts,
        warnings,
        errors,
        stats: {
          baseServersCount: Object.keys(baseServers).length,
          personaServersCount: Object.keys(personaServers).length,
          mergedServersCount: Object.keys(mergedServers).length,
          conflictsResolved,
        },
      };
    } catch (error) {
      const errorMessage = `Merge operation failed: ${
        error instanceof Error ? error.message : String(error)
      }`;

      errors.push(errorMessage);

      return {
        success: false,
        conflicts,
        warnings,
        errors,
        stats: {
          baseServersCount: Object.keys(baseConfig.mcpServers).length,
          personaServersCount: Object.keys(personaConfig.mcpServers).length,
          mergedServersCount: 0,
          conflictsResolved: 0,
        },
      };
    }
  }

  /**
   * Merge two server configurations
   */
  private mergeServerConfigs(
    baseServer: ServerEntry,
    personaServer: ServerEntry,
    options: McpConfigMergeOptions
  ): ServerEntry {
    // Create a deep copy of the persona server as the base
    const merged = JSON.parse(JSON.stringify(personaServer));

    // Handle environment variable merging if both have env
    if (
      options.preserveBaseEnv &&
      options.mergeEnvironment &&
      "env" in baseServer &&
      baseServer.env &&
      "env" in personaServer &&
      personaServer.env
    ) {
      merged.env = {
        ...baseServer.env,
        ...personaServer.env, // Persona env takes precedence
      };
    } else if (
      options.preserveBaseEnv &&
      "env" in baseServer &&
      baseServer.env &&
      !("env" in merged)
    ) {
      // Preserve base env if persona doesn't have env
      merged.env = { ...baseServer.env };
    }

    return merged;
  }

  /**
   * Generate a simple hash of the configuration for tracking changes
   */
  private generateConfigHash(config: MCPConfig): string {
    const configString = JSON.stringify(config, Object.keys(config).sort());

    // Simple hash function (not cryptographically secure, but sufficient for tracking)
    let hash = 0;
    for (let i = 0; i < configString.length; i++) {
      const char = configString.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }

    return hash.toString(16);
  }

  /**
   * Validate MCP configuration format
   */
  public static validateMcpConfig(config: unknown): config is MCPConfig {
    if (!config || typeof config !== "object") {
      return false;
    }

    const mcpConfig = config as any;

    if (!mcpConfig.mcpServers || typeof mcpConfig.mcpServers !== "object") {
      return false;
    }

    // Additional validation could be added here
    return true;
  }

  /**
   * Create a PersonaMcpIntegration instance for personas that don't have MCP configs
   */
  public static createNullIntegration(): PersonaMcpIntegration {
    return new PersonaMcpIntegration(
      async () => null,
      async () => {},
      undefined
    );
  }

  /**
   * Dispose of the integration and clean up resources
   */
  public dispose(): void {
    this.currentBackup = null;
  }
}

/**
 * Create a PersonaMcpIntegration instance with default configuration handlers
 */
export function createPersonaMcpIntegration(
  getCurrentConfig: () => Promise<MCPConfig | null>,
  setCurrentConfig: (config: MCPConfig) => Promise<void>,
  restartConnections?: () => Promise<void>,
  mergeOptions?: Partial<McpConfigMergeOptions>
): PersonaMcpIntegration {
  return new PersonaMcpIntegration(
    getCurrentConfig,
    setCurrentConfig,
    restartConnections,
    mergeOptions
  );
}

/**
 * Helper function to check if persona assets include MCP configuration
 */
export function personaHasMcpConfig(assets: PersonaAssets): boolean {
  return Boolean(assets.mcpConfigFile);
}

/**
 * Helper function to validate persona MCP config file exists and is readable
 */
export async function validatePersonaMcpConfigFile(filePath: string): Promise<{
  isValid: boolean;
  error?: string;
}> {
  try {
    await fs.access(filePath);

    // Try to parse it to ensure it's valid
    const parser = new MCPConfigParser();
    const result = await parser.parseFile(filePath);

    if (!result.success) {
      return {
        isValid: false,
        error:
          result.error ||
          result.validationErrors?.join(", ") ||
          "Unknown parsing error",
      };
    }

    return { isValid: true };
  } catch (error) {
    return {
      isValid: false,
      error: `File access error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
