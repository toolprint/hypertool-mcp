/**
 * MCP configuration file discovery and loading
 */

import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { loadUserPreferences, updateMcpConfigPath } from "./preferenceStore.js";
import { APP_TECHNICAL_NAME, BRAND_NAME } from "./appConfig.js";
import { createChildLogger } from "../utils/logging.js";
import { MainConfig } from "../config-manager/types/index.js";

const logger = createChildLogger({ module: "config/discovery" });

/**
 * Standard locations to search for MCP configuration files
 */
const STANDARD_CONFIG_LOCATIONS = [
  // Current working directory
  ".mcp.json",
  "mcp.json",
  `.${APP_TECHNICAL_NAME}.json`,
  `${APP_TECHNICAL_NAME}.json`,

  // User home directory
  `~/.${BRAND_NAME.toLowerCase()}/${APP_TECHNICAL_NAME}/mcp.json`,
  `~/.${APP_TECHNICAL_NAME}.json`,
  "~/.mcp.json",
];

/**
 * Resolve home directory paths
 */
function resolvePath(filePath: string): string {
  if (filePath.startsWith("~/")) {
    return path.join(os.homedir(), filePath.slice(2));
  }
  return path.resolve(filePath);
}

/**
 * Check if a file exists and is readable
 */
async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(resolvePath(filePath), fs.constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolve app-specific configuration path
 */
async function resolveAppConfig(appId: string, profile?: string): Promise<string | null> {
  try {
    // Load main config to get app-specific config paths
    const configPath = path.join(
      os.homedir(),
      `.${BRAND_NAME.toLowerCase()}`,
      APP_TECHNICAL_NAME,
      'config.json'
    );
    
    const configContent = await fs.readFile(configPath, 'utf-8');
    const config: MainConfig = JSON.parse(configContent);
    
    const appConfig = config.applications?.[appId];
    if (!appConfig?.mcpConfig) {
      return null;
    }
    
    // If profile is specified, look for profile-specific config
    if (profile) {
      const profilePath = path.join(
        os.homedir(),
        `.${BRAND_NAME.toLowerCase()}`,
        APP_TECHNICAL_NAME,
        'mcp',
        'profiles',
        appId,
        `${profile}.json`
      );
      
      if (await fileExists(profilePath)) {
        return profilePath;
      }
    }
    
    // Return app's default config path
    return path.join(
      os.homedir(),
      `.${BRAND_NAME.toLowerCase()}`,
      APP_TECHNICAL_NAME,
      appConfig.mcpConfig
    );
  } catch (error) {
    logger.debug('Failed to resolve app config:', error);
    return null;
  }
}

/**
 * Discover MCP configuration file
 *
 * @param cliConfigPath - Path provided via --mcp-config flag (highest priority override)
 * @param updatePreference - Whether to update user preference when using CLI path
 * @param linkedApp - Application ID to load config for
 * @param profile - Profile ID for workspace/project config
 * @returns Object with config path and source information
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
}> {
  // Check for test environment override first (for test isolation)
  const testConfigPath = process.env.HYPERTOOL_TEST_CONFIG;
  if (testConfigPath) {
    const resolvedTestPath = resolvePath(testConfigPath);
    if (await fileExists(resolvedTestPath)) {
      return {
        configPath: resolvedTestPath,
        source: "cli",
      };
    }
  }
  
  
  // 1. Check CLI argument first (highest priority override)
  if (cliConfigPath) {
    const resolvedPath = resolvePath(cliConfigPath);

    if (await fileExists(resolvedPath)) {
      logger.debug(`[CONFIG] Using CLI config file: ${resolvedPath}`);
    } else {
      logger.debug(`[CONFIG] CLI config file not found: ${resolvedPath}`);
      return {
        configPath: null,
        source: "none",
        errorMessage: `MCP config file not found at specified path: ${resolvedPath}`,
      };
    }

    if (await fileExists(resolvedPath)) {
      // Update user preference if requested
      if (updatePreference) {
        try {
          await updateMcpConfigPath(resolvedPath);
        } catch (error) {
          // Don't fail if preference update fails
          logger.warn(
            "Warning: Could not update MCP config preference:",
            error
          );
        }
      }

      return {
        configPath: resolvedPath,
        source: "cli",
      };
    } else {
      return {
        configPath: null,
        source: "none",
        errorMessage: `MCP config file not found at specified path: ${resolvedPath}`,
      };
    }
  }

  // 2. Check for linked app (second priority)
  if (linkedApp) {
    const appConfigPath = await resolveAppConfig(linkedApp, profile);
    if (appConfigPath && await fileExists(appConfigPath)) {
      return {
        configPath: appConfigPath,
        source: "app",
      };
    } else {
      return {
        configPath: null,
        source: "none",
        errorMessage: `Could not find configuration for app '${linkedApp}'${profile ? ` with profile '${profile}'` : ''}`,
      };
    }
  }

  // 3. Check user preference
  try {
    const preferences = await loadUserPreferences();
    if (preferences.mcpConfigPath) {
      const resolvedPath = resolvePath(preferences.mcpConfigPath);

      if (await fileExists(resolvedPath)) {
        return {
          configPath: resolvedPath,
          source: "preference",
        };
      } else {
        // Preference points to non-existent file, continue to discovery
        logger.warn(
          `Warning: Preferred MCP config file not found: ${resolvedPath}`
        );
      }
    }
  } catch (error) {
    // Continue to discovery if preference loading fails
    logger.warn("Warning: Could not load user preferences:", error);
  }

  // 4. Search standard locations
  for (const location of STANDARD_CONFIG_LOCATIONS) {
    const resolvedPath = resolvePath(location);

    if (await fileExists(resolvedPath)) {
      return {
        configPath: resolvedPath,
        source: "discovered",
      };
    }
  }

  // 5. No config found
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
  const locations = STANDARD_CONFIG_LOCATIONS.map((loc) =>
    loc.startsWith("~/") ? loc : `./${loc}`
  ).join("\n  - ");

  return `No MCP configuration file found. Searched in:
  - ${locations}

To get started:
  1. Create a .mcp.json file in your current directory, or
  2. Use --mcp-config <path> to specify a custom location, or
  3. Run '${APP_TECHNICAL_NAME} --help' for more configuration options

Example .mcp.json:
{
  "mcpServers": {
    "example": {
      "type": "stdio",
      "command": "example-mcp-server",
      "args": []
    }
  }
}`;
}

/**
 * Load and validate MCP configuration from discovered path
 */
export async function loadMcpConfig(configPath: string): Promise<any> {
  try {
    const content = await fs.readFile(configPath, "utf-8");
    const config = JSON.parse(content);

    // Basic validation - ensure mcpServers field exists
    if (!config.mcpServers || typeof config.mcpServers !== "object") {
      throw new Error("Invalid MCP config: missing 'mcpServers' field");
    }

    return config;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Invalid JSON in MCP config file: ${error.message}`);
    }
    throw error;
  }
}
