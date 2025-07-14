/**
 * User preferences management for HyperTool MCP
 */

import * as fs from "fs/promises";
import * as path from "path";
import { homedir } from "os";
import { ToolsetConfig } from "../toolset/types";

// Configuration directory structure
const TOOLPRINT_CONFIG_DIR = path.join(homedir(), ".toolprint");
const HYPERTOOL_MCP_CONFIG_DIR = path.join(TOOLPRINT_CONFIG_DIR, "hypertool-mcp");
const PREFERENCES_FILE = path.join(HYPERTOOL_MCP_CONFIG_DIR, "preferences.json");

/**
 * User preferences structure
 */
export interface UserPreferences {
  /** Stored toolset configurations */
  toolsets: Record<string, ToolsetConfig>;
  
  /** User's preferred path to their MCP server configuration file */
  mcpConfigPath?: string;
  
  /** Last updated timestamp */
  lastUpdated?: string;
  
  /** Version of preferences format */
  version?: string;
}

/**
 * Default preferences
 */
const DEFAULT_PREFERENCES: UserPreferences = {
  toolsets: {},
  version: "1.0.0",
};

/**
 * Ensure config directory exists
 */
async function ensureConfigDir(): Promise<void> {
  try {
    await fs.mkdir(HYPERTOOL_MCP_CONFIG_DIR, { recursive: true });
  } catch {
    // Directory might already exist, that's fine
  }
}

/**
 * Load user preferences from config file
 */
export async function loadUserPreferences(): Promise<UserPreferences> {
  try {
    await ensureConfigDir();
    const content = await fs.readFile(PREFERENCES_FILE, "utf-8");
    const preferences = JSON.parse(content) as UserPreferences;
    
    // Ensure all required fields exist
    return {
      ...DEFAULT_PREFERENCES,
      ...preferences,
      lastUpdated: preferences.lastUpdated || new Date().toISOString(),
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      // File doesn't exist, create with defaults
      const defaultPrefs = {
        ...DEFAULT_PREFERENCES,
        lastUpdated: new Date().toISOString(),
      };
      await saveUserPreferences(defaultPrefs);
      return defaultPrefs;
    }
    throw error;
  }
}

/**
 * Save user preferences to config file
 */
export async function saveUserPreferences(preferences: UserPreferences): Promise<void> {
  await ensureConfigDir();
  
  const updatedPreferences = {
    ...preferences,
    lastUpdated: new Date().toISOString(),
  };
  
  await fs.writeFile(
    PREFERENCES_FILE, 
    JSON.stringify(updatedPreferences, null, 2), 
    "utf-8"
  );
}

/**
 * Update MCP config path preference
 */
export async function updateMcpConfigPath(configPath: string): Promise<void> {
  const preferences = await loadUserPreferences();
  preferences.mcpConfigPath = configPath;
  await saveUserPreferences(preferences);
}

/**
 * Get stored toolsets (legacy compatibility)
 */
export async function loadStoredToolsets(): Promise<Record<string, ToolsetConfig>> {
  const preferences = await loadUserPreferences();
  return preferences.toolsets;
}

/**
 * Save toolsets (legacy compatibility)
 */
export async function saveStoredToolsets(toolsets: Record<string, ToolsetConfig>): Promise<void> {
  const preferences = await loadUserPreferences();
  preferences.toolsets = toolsets;
  await saveUserPreferences(preferences);
}

/**
 * Get paths for configuration files
 */
export function getConfigPaths() {
  return {
    toolprintDir: TOOLPRINT_CONFIG_DIR,
    hypertoolMcpDir: HYPERTOOL_MCP_CONFIG_DIR,
    preferencesFile: PREFERENCES_FILE,
  };
}

/**
 * Migrate from old toolsets.json to new preferences.json
 */
export async function migrateFromLegacyConfig(): Promise<boolean> {
  const legacyDir = path.join(homedir(), ".toolprint-meta-mcp");
  const legacyFile = path.join(legacyDir, "toolsets.json");
  
  try {
    // Check if legacy file exists
    const legacyContent = await fs.readFile(legacyFile, "utf-8");
    const legacyToolsets = JSON.parse(legacyContent) as Record<string, ToolsetConfig>;
    
    // Load current preferences (will create defaults if none exist)
    const preferences = await loadUserPreferences();
    
    // Merge legacy toolsets into new structure
    preferences.toolsets = {
      ...preferences.toolsets,
      ...legacyToolsets,
    };
    
    // Save updated preferences
    await saveUserPreferences(preferences);
    
    // Remove legacy file
    await fs.unlink(legacyFile);
    
    // Try to remove legacy directory if empty
    try {
      await fs.rmdir(legacyDir);
    } catch {
      // Directory not empty or other error, ignore
    }
    
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      // Legacy file doesn't exist, no migration needed
      return false;
    }
    throw error;
  }
}