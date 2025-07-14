/**
 * MCP configuration file discovery and loading
 */

import * as fs from "fs/promises";
import * as path from "path";
import { loadUserPreferences, updateMcpConfigPath } from "./preferences";

/**
 * Standard locations to search for MCP configuration files
 */
const STANDARD_CONFIG_LOCATIONS = [
  // Current working directory
  ".mcp.json",
  "mcp.json",
  ".hypertool-mcp.json",
  "hypertool-mcp.json",
  
  // User home directory
  "~/.toolprint/hypertool-mcp/config.json",
  "~/.hypertool-mcp.json",
  "~/.mcp.json",
];

/**
 * Resolve home directory paths
 */
function resolvePath(filePath: string): string {
  if (filePath.startsWith("~/")) {
    const os = require("os");
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
 * Discover MCP configuration file
 * 
 * @param cliConfigPath - Path provided via --mcp-config flag
 * @param updatePreference - Whether to update user preference when using CLI path
 * @returns Object with config path and source information
 */
export async function discoverMcpConfig(
  cliConfigPath?: string,
  updatePreference: boolean = true
): Promise<{
  configPath: string | null;
  source: "cli" | "preference" | "discovered" | "none";
  errorMessage?: string;
}> {
  // 1. Check CLI argument first (highest priority)
  if (cliConfigPath) {
    const resolvedPath = resolvePath(cliConfigPath);
    
    if (await fileExists(resolvedPath)) {
      // Update user preference if requested
      if (updatePreference) {
        try {
          await updateMcpConfigPath(resolvedPath);
        } catch (error) {
          // Don't fail if preference update fails
          console.warn("Warning: Could not update MCP config preference:", error);
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

  // 2. Check user preference
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
        console.warn(`Warning: Preferred MCP config file not found: ${resolvedPath}`);
      }
    }
  } catch (error) {
    // Continue to discovery if preference loading fails
    console.warn("Warning: Could not load user preferences:", error);
  }

  // 3. Search standard locations
  for (const location of STANDARD_CONFIG_LOCATIONS) {
    const resolvedPath = resolvePath(location);
    
    if (await fileExists(resolvedPath)) {
      return {
        configPath: resolvedPath,
        source: "discovered",
      };
    }
  }

  // 4. No config found
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
  const locations = STANDARD_CONFIG_LOCATIONS.map(loc => 
    loc.startsWith("~/") ? loc : `./${loc}`
  ).join("\n  - ");

  return `No MCP configuration file found. Searched in:
  - ${locations}

To get started:
  1. Create a .mcp.json file in your current directory, or
  2. Use --mcp-config <path> to specify a custom location, or
  3. Run 'hypertool-mcp --help' for more configuration options

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