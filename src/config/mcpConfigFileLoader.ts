/**
 * Legacy file-based MCP configuration loading
 * Used when HYPERTOOL_NEDB_ENABLED is false
 */

import * as path from "path";
import * as os from "os";
import * as fs from "fs/promises";
import { loadUserPreferences, saveUserPreferences } from "./preferenceStore.js";
import { APP_TECHNICAL_NAME } from "./appConfig.js";
import { createChildLogger } from "../utils/logging.js";
import { MCPConfigParser } from "./mcpConfigParser.js";
import { IConfigSource } from "../db/interfaces.js";

const logger = createChildLogger({ module: "config/file-discovery" });

/**
 * Check if a file exists
 */
async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Discover MCP configuration files from file system
 *
 * @param cliConfigPath - Path provided via --mcp-config flag
 * @param updatePreference - Whether to update user preference when using CLI path
 * @param linkedApp - Application ID to load config for
 * @param profile - Profile ID for workspace/project config
 * @returns Object with config and source information
 */
export async function discoverMcpConfigFile(
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
  // 1. Check for CLI-provided path (highest priority)
  if (cliConfigPath) {
    logger.debug(`Checking CLI-provided config path: ${cliConfigPath}`);

    if (await fileExists(cliConfigPath)) {
      logger.info(`Using config from CLI: ${cliConfigPath}`);

      // Update user preference if requested
      if (updatePreference) {
        try {
          const preferences = await loadUserPreferences();
          preferences.mcpConfigPath = cliConfigPath;
          await saveUserPreferences(preferences);
          logger.debug("Updated user preference with CLI path");
        } catch (error) {
          logger.warn("Failed to update user preference:", error);
        }
      }

      return {
        configPath: cliConfigPath,
        source: "cli",
        configSource: {
          id: "cli",
          type: "global",
          path: cliConfigPath,
          priority: 100,
          lastSynced: Date.now(),
        },
      };
    } else {
      return {
        configPath: null,
        source: "none",
        errorMessage: `Configuration file not found: ${cliConfigPath}`,
      };
    }
  }

  // 2. Check for linked app config (per-app config)
  if (linkedApp) {
    const basePath = path.join(os.homedir(), ".toolprint/hypertool-mcp");
    const perAppPath = path.join(basePath, "mcp", `${linkedApp}.json`);

    logger.debug(`Checking per-app config: ${perAppPath}`);

    if (await fileExists(perAppPath)) {
      logger.info(`Using per-app config for ${linkedApp}`);
      return {
        configPath: perAppPath,
        source: "app",
        configSource: {
          id: `app-${linkedApp}`,
          type: "app",
          appId: linkedApp,
          profileId: profile,
          path: perAppPath,
          priority: 90,
          lastSynced: Date.now(),
        },
      };
    } else {
      return {
        configPath: null,
        source: "none",
        errorMessage: `Could not find configuration for app '${linkedApp}'${profile ? ` with profile '${profile}'` : ""}`,
      };
    }
  }

  // 3. Check user preference
  try {
    const preferences = await loadUserPreferences();
    if (preferences.mcpConfigPath) {
      logger.debug(
        `Checking user preference path: ${preferences.mcpConfigPath}`
      );

      if (await fileExists(preferences.mcpConfigPath)) {
        logger.info(
          `Using config from user preference: ${preferences.mcpConfigPath}`
        );
        return {
          configPath: preferences.mcpConfigPath,
          source: "preference",
          configSource: {
            id: "preference",
            type: "global",
            path: preferences.mcpConfigPath,
            priority: 80,
            lastSynced: Date.now(),
          },
        };
      } else {
        logger.warn(
          `User preference path does not exist: ${preferences.mcpConfigPath}`
        );
      }
    }
  } catch (error) {
    logger.warn("Could not load user preferences:", error);
  }

  // 4. Check default location
  const defaultPath = path.join(
    os.homedir(),
    ".toolprint/hypertool-mcp/mcp.json"
  );
  logger.debug(`Checking default config path: ${defaultPath}`);

  if (await fileExists(defaultPath)) {
    logger.info(`Using default config: ${defaultPath}`);
    return {
      configPath: defaultPath,
      source: "discovered",
      configSource: {
        id: "default",
        type: "global",
        path: defaultPath,
        priority: 70,
        lastSynced: Date.now(),
      },
    };
  }

  // 5. No config found
  logger.warn("No MCP configuration found");
  return {
    configPath: null,
    source: "none",
    errorMessage: generateNoConfigFoundMessage(),
  };
}

/**
 * Generate helpful error message when no config is found
 */
function generateNoConfigFoundMessage(): string {
  const defaultPath = path.join(
    os.homedir(),
    ".toolprint/hypertool-mcp/mcp.json"
  );

  return `No MCP configuration found.

Searched locations:
  • Default: ${defaultPath}

To get started:
  1. Create an MCP configuration file at the default location
  2. Run '${APP_TECHNICAL_NAME} config link' to link applications to HyperTool
  3. Use '${APP_TECHNICAL_NAME} --mcp-config <path>' to specify a custom config file
  4. Run '${APP_TECHNICAL_NAME} --help' for more configuration options`;
}

/**
 * Load and validate MCP configuration from file
 */
export async function loadMcpConfigFile(
  configPath: string,
  configSource?: IConfigSource
): Promise<any> {
  try {
    logger.debug(`Loading MCP config from: ${configPath}`);

    const parser = new MCPConfigParser();
    const result = await parser.parseFile(configPath);

    if (!result.success) {
      const errorMessage = result.error || result.validationErrors?.join("\n");
      throw new Error(`Failed to parse MCP config: ${errorMessage}`);
    }

    if (!result.config) {
      throw new Error("Parser returned success but no config object");
    }

    // Add metadata about the source
    const config = {
      ...result.config,
      _metadata: {
        source: configSource?.type || "file",
        sourceId: configSource?.id || "unknown",
        path: configPath,
        loadedAt: new Date().toISOString(),
      },
    };

    return config;
  } catch (error) {
    logger.error(`Failed to load MCP config from ${configPath}:`, error);
    throw error;
  }
}

/**
 * Get all available per-app configurations
 */
export async function getAllAppConfigs(): Promise<Record<string, any>> {
  const basePath = path.join(os.homedir(), ".toolprint/hypertool-mcp");
  const mcpDir = path.join(basePath, "mcp");
  const configs: Record<string, any> = {};

  try {
    const files = await fs.readdir(mcpDir);

    for (const file of files) {
      if (file.endsWith(".json")) {
        const appId = file.replace(".json", "");
        const filePath = path.join(mcpDir, file);

        try {
          const config = await loadMcpConfigFile(filePath, {
            id: `app-${appId}`,
            type: "app",
            appId,
            path: filePath,
            priority: 90,
            lastSynced: Date.now(),
          });

          configs[appId] = config;
        } catch (error) {
          logger.warn(`Failed to load config for app ${appId}:`, error);
        }
      }
    }
  } catch (error) {
    if ((error as any).code !== "ENOENT") {
      logger.warn("Failed to read mcp directory:", error);
    }
  }

  return configs;
}
