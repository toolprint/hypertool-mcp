/**
 * User preferences management
 */

import * as fs from "fs/promises";
import * as path from "path";
import { homedir } from "os";
import { ToolsetConfig } from "../toolset/types.js";
import { APP_TECHNICAL_NAME, BRAND_NAME } from "./appConfig.js";

// Configuration directory structure
const BRAND_CONFIG_DIR = path.join(homedir(), `.${BRAND_NAME.toLowerCase()}`);
const APP_CONFIG_DIR = path.join(BRAND_CONFIG_DIR, APP_TECHNICAL_NAME);
const CONFIG_FILE = path.join(APP_CONFIG_DIR, "config.json");

/**
 * User preferences structure
 */
export interface UserPreferences {
  /** Stored toolset configurations */
  toolsets: Record<string, ToolsetConfig>;

  /** User's preferred path to their MCP server configuration file */
  mcpConfigPath?: string;

  /** Name of the last equipped toolset */
  lastEquippedToolset?: string;

  /** Last updated timestamp */
  lastUpdated?: string;

  /** Version of preferences format */
  version?: string;
}

/**
 * Complete configuration structure
 */
export interface CompleteConfig extends UserPreferences {
  /** Application sync configurations */
  applications?: Record<string, any>;

  /** Last backup timestamp */
  lastBackup?: string;

  /** Server-related settings */
  serverSettings?: {
    /** Maximum number of concurrent server connections */
    maxConcurrentConnections?: number;
  };
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
    await fs.mkdir(APP_CONFIG_DIR, { recursive: true });
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
    const content = await fs.readFile(CONFIG_FILE, "utf-8");
    const config = JSON.parse(content) as CompleteConfig;

    // Extract preference fields from config
    const preferences: UserPreferences = {
      toolsets: config.toolsets || {},
      mcpConfigPath: config.mcpConfigPath,
      lastEquippedToolset: config.lastEquippedToolset,
      lastUpdated: config.lastUpdated,
      version: config.version,
    };

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
export async function saveUserPreferences(
  preferences: UserPreferences
): Promise<void> {
  await ensureConfigDir();

  // Load existing config to preserve non-preference fields
  let existingConfig: Partial<CompleteConfig> = {};
  try {
    const content = await fs.readFile(CONFIG_FILE, "utf-8");
    existingConfig = JSON.parse(content) as CompleteConfig;
  } catch {
    // File doesn't exist or is invalid, use empty object
  }

  const updatedConfig: CompleteConfig = {
    ...existingConfig,
    ...preferences,
    lastUpdated: new Date().toISOString(),
  };

  await fs.writeFile(
    CONFIG_FILE,
    JSON.stringify(updatedConfig, null, 2),
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
 * Get stored toolsets
 */
export async function loadStoredToolsets(): Promise<
  Record<string, ToolsetConfig>
> {
  const preferences = await loadUserPreferences();
  return preferences.toolsets;
}

/**
 * Save toolsets
 */
export async function saveStoredToolsets(
  toolsets: Record<string, ToolsetConfig>
): Promise<void> {
  const preferences = await loadUserPreferences();
  preferences.toolsets = toolsets;
  await saveUserPreferences(preferences);
}

/**
 * Get the last equipped toolset name
 */
export async function getLastEquippedToolset(): Promise<string | undefined> {
  const preferences = await loadUserPreferences();
  return preferences.lastEquippedToolset;
}

/**
 * Save the last equipped toolset name
 */
export async function saveLastEquippedToolset(
  toolsetName: string | undefined
): Promise<void> {
  const preferences = await loadUserPreferences();
  preferences.lastEquippedToolset = toolsetName;
  await saveUserPreferences(preferences);
}

/**
 * Get paths for configuration files
 */
export function getConfigPaths() {
  return {
    brandDir: BRAND_CONFIG_DIR,
    appDir: APP_CONFIG_DIR,
    configFile: CONFIG_FILE,
    preferencesFile: CONFIG_FILE, // Deprecated: use configFile instead
  };
}
