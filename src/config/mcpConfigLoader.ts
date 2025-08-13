/**
 * MCP configuration loading - routes between database and file-based approaches
 */

import * as path from "path";
import { loadUserPreferences } from "./preferenceStore.js";
import { APP_TECHNICAL_NAME, BRAND_NAME } from "./appConfig.js";
import { createChildLogger } from "../utils/logging.js";
import { getCompositeDatabaseService } from "../db/compositeDatabaseService.js";
import { ServerConfig } from "../types/config.js";
import { IConfigSource } from "../db/interfaces.js";
import { getFeatureFlagService } from "./featureFlagService.js";
import {
  discoverMcpConfigFile,
  loadMcpConfigFile,
} from "./mcpConfigFileLoader.js";

const logger = createChildLogger({ module: "config/discovery" });

/**
 * Get configuration source from database
 */
async function getConfigSource(
  sourceType: "global" | "app" | "profile",
  appId?: string,
  profileId?: string
): Promise<IConfigSource | null> {
  try {
    const dbService = getCompositeDatabaseService();
    await dbService.init();

    // Find the most appropriate config source
    const sources = await dbService.configSources.findAll();

    let matchingSource: IConfigSource | null = null;
    let highestPriority = -1;

    for (const source of sources) {
      if (source.type === sourceType) {
        if (sourceType === "global" && source.priority > highestPriority) {
          matchingSource = source;
          highestPriority = source.priority;
        } else if (
          sourceType === "app" &&
          source.appId === appId &&
          source.priority > highestPriority
        ) {
          matchingSource = source;
          highestPriority = source.priority;
        } else if (
          sourceType === "profile" &&
          source.appId === appId &&
          source.profileId === profileId &&
          source.priority > highestPriority
        ) {
          matchingSource = source;
          highestPriority = source.priority;
        }
      }
    }

    return matchingSource;
  } catch (error) {
    logger.debug("Failed to get config source:", error);
    return null;
  }
}

/**
 * Discover MCP configuration - routes to database or file-based based on feature flag
 *
 * @param cliConfigPath - Path provided via --mcp-config flag (for backward compatibility)
 * @param updatePreference - Whether to update user preference when using CLI path
 * @param linkedApp - Application ID to load config for
 * @param profile - Profile ID for workspace/project config
 * @returns Object with config and source information
 */
export async function discoverMcpConfig(
  cliConfigPath?: string,
  updatePreference: boolean = true,
  linkedApp?: string,
  profile?: string
): Promise<{
  configPath: string | null;
  source: "cli" | "app" | "preference" | "discovered" | "none";
  errorMessage?: string;
  configSource?: IConfigSource;
}> {
  // Use file-based configuration discovery
  logger.debug("Using file-based configuration");
  return discoverMcpConfigFile(
    cliConfigPath,
    updatePreference,
    linkedApp,
    profile
  );

  // Database configuration discovery (legacy code - removed as unreachable)
  // This section was unreachable after file-based return above
  /* try {
    const dbService = getCompositeDatabaseService();
    await dbService.init();

    // 1. Check for linked app with profile (highest priority)
    if (linkedApp && profile) {
      const source = await getConfigSource("profile", linkedApp, profile);
      if (source) {
        return {
          configPath: source.path ?? "", // Keep for backward compatibility
          source: "app",
          configSource: source ?? undefined,
        };
      }
    }

    // 2. Check for linked app without profile
    if (linkedApp) {
      const source = await getConfigSource("app", linkedApp);
      if (source) {
        return {
          configPath: source.path ?? "", // Keep for backward compatibility
          source: "app",
          configSource: source ?? undefined,
        };
      } else {
        return {
          configPath: null,
          source: "none",
          errorMessage: `Could not find configuration for app '${linkedApp}'${profile ? ` with profile '${profile}'` : ""}`,
        };
      }
    }

    // 3. Check user preference (from database)
    try {
      const preferences = await loadUserPreferences();
      if (preferences.mcpConfigPath) {
        // Find config source by path
        const sources = await dbService.configSources.findByPath(
          preferences.mcpConfigPath!
        );
        if (sources) {
          return {
            configPath: sources.path ?? "",
            source: "preference",
            configSource: sources ?? undefined,
          };
        }
      }
    } catch (error) {
      logger.warn("Warning: Could not load user preferences:", error);
    }

    // 4. Use global config source
    const globalSource = await getConfigSource("global");
    if (globalSource) {
      return {
        configPath: globalSource.path ?? "",
        source: "discovered",
        configSource: globalSource ?? undefined,
      };
    }

    // 5. No config found
    return {
      configPath: null,
      source: "none",
      errorMessage: generateNoConfigFoundMessage(),
    };
  } catch (error) {
    logger.error("Failed to discover MCP config:", error);
    return {
      configPath: null,
      source: "none",
      errorMessage: `Failed to load configuration: ${error instanceof Error ? error.message : String(error)}`,
    };
  } */
}

/**
 * Generate helpful error message when no config is found
 */
function generateNoConfigFoundMessage(): string {
  return `No MCP configuration found in database.

To get started:
  1. Run '${APP_TECHNICAL_NAME} config backup' to import configurations from applications
  2. Run '${APP_TECHNICAL_NAME} config link' to link applications to HyperTool
  3. Run '${APP_TECHNICAL_NAME} --help' for more configuration options`;
}

/**
 * Load and validate MCP configuration - routes to database or file-based based on feature flag
 */
export async function loadMcpConfig(
  configPath: string,
  configSource?: IConfigSource
): Promise<any> {
  // Use file-based configuration loading
  logger.debug("Loading from file");
  return loadMcpConfigFile(configPath, configSource);

  // Database configuration loading (legacy code - removed as unreachable)
  // This section was unreachable after file-based return above
  /* try {
    const dbService = getCompositeDatabaseService();
    await dbService.init();

    // If we have a config source, load servers associated with it
    if (configSource) {
      const servers = await dbService.servers.findAll();
      const sourceServers = servers.filter(
        (s) => s.sourceId === configSource!.id
      );

      // Convert to MCP config format
      const mcpServers: Record<string, ServerConfig> = {};
      for (const server of sourceServers) {
        mcpServers[server.name] = server.config;
      }

      const config = {
        mcpServers,
        _metadata: {
          source: configSource?.type,
          sourceId: configSource?.id,
          path: configSource?.path,
        },
      };

      // Basic validation - ensure mcpServers field exists
      if (!config.mcpServers || typeof config.mcpServers !== "object") {
        throw new Error("Invalid MCP config: missing 'mcpServers' field");
      }

      return config;
    }

    // Fallback: load all servers if no specific source
    const servers = await dbService.servers.findAll();
    const mcpServers: Record<string, ServerConfig> = {};

    for (const server of servers) {
      mcpServers[server.name] = server.config;
    }

    const config = {
      mcpServers,
      _metadata: {
        source: "database",
        loadedFrom: "all-servers",
      },
    };

    return config;
  } catch (error) {
    logger.error("Failed to load MCP config from database:", error);
    throw error;
  } */
}
