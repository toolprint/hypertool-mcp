/**
 * Server settings configuration loader
 * Handles loading server-related settings from multiple sources with priority:
 * 1. Environment variables (highest priority)
 * 2. Config file (config.json)
 * 3. Defaults (lowest priority)
 */

import { CompleteConfig } from "./preferenceStore.js";
import { loadUserPreferences } from "./preferenceStore.js";
import { DEFAULT_POOL_CONFIG } from "../connection/types.js";

export interface ServerSettings {
  /** Maximum number of concurrent server connections */
  maxConcurrentConnections: number;
}

/**
 * Default server settings
 */
const DEFAULT_SERVER_SETTINGS: ServerSettings = {
  maxConcurrentConnections: DEFAULT_POOL_CONFIG.maxConcurrentConnections,
};

/**
 * Load server settings from all sources with proper priority
 * Priority: Environment variables > Config file > Defaults
 */
export async function loadServerSettings(): Promise<ServerSettings> {
  // Start with defaults
  let settings: ServerSettings = { ...DEFAULT_SERVER_SETTINGS };

  // Load from config file
  try {
    const config = await loadUserPreferences();
    // The config is UserPreferences but we need to access the full CompleteConfig
    // We'll need to load the raw config file to get serverSettings
    const { readFile } = await import("fs/promises");
    const { join } = await import("path");
    const { homedir } = await import("os");

    const configPath = join(homedir(), ".toolprint/hypertool-mcp/config.json");
    const content = await readFile(configPath, "utf-8");
    const fullConfig = JSON.parse(content) as CompleteConfig;

    if (fullConfig.serverSettings?.maxConcurrentConnections !== undefined) {
      settings.maxConcurrentConnections =
        fullConfig.serverSettings.maxConcurrentConnections;
    }
  } catch {
    // Config file doesn't exist or is invalid, use defaults
  }

  // Override with environment variable if set (highest priority)
  const envValue = process.env.HYPERTOOL_MAX_CONNECTIONS;
  if (envValue) {
    const parsed = parseInt(envValue, 10);
    if (!isNaN(parsed) && parsed > 0) {
      settings.maxConcurrentConnections = parsed;
    } else {
      console.warn(
        `Invalid HYPERTOOL_MAX_CONNECTIONS value: ${envValue}. Using config/default value.`
      );
    }
  }

  return settings;
}

/**
 * Get the current max concurrent connections setting
 * This is a convenience function that loads settings and returns just the connection limit
 */
export async function getMaxConcurrentConnections(): Promise<number> {
  const settings = await loadServerSettings();
  return settings.maxConcurrentConnections;
}

/**
 * Update server settings in the config file
 * Note: This does not affect environment variable overrides
 */
export async function updateServerSettings(
  updates: Partial<ServerSettings>
): Promise<void> {
  const { readFile, writeFile } = await import("fs/promises");
  const { join } = await import("path");
  const { homedir } = await import("os");
  const { mkdir } = await import("fs/promises");

  const configDir = join(homedir(), ".toolprint/hypertool-mcp");
  const configPath = join(configDir, "config.json");

  // Ensure directory exists
  await mkdir(configDir, { recursive: true });

  let config: CompleteConfig;
  try {
    const content = await readFile(configPath, "utf-8");
    config = JSON.parse(content) as CompleteConfig;
  } catch {
    // File doesn't exist, create with defaults
    config = {
      toolsets: {},
      version: "1.0.0",
    };
  }

  // Update server settings
  config.serverSettings = {
    ...config.serverSettings,
    ...updates,
  };

  // Update timestamp
  config.lastUpdated = new Date().toISOString();

  // Save updated config
  await writeFile(configPath, JSON.stringify(config, null, 2), "utf-8");
}

/**
 * Log current server settings configuration for debugging
 */
export async function logServerSettingsSource(): Promise<void> {
  const envValue = process.env.HYPERTOOL_MAX_CONNECTIONS;
  const settings = await loadServerSettings();

  console.log("Server Settings Configuration:");
  console.log(
    `  Max Concurrent Connections: ${settings.maxConcurrentConnections}`
  );

  if (envValue) {
    const parsed = parseInt(envValue, 10);
    if (!isNaN(parsed) && parsed > 0) {
      console.log(
        `  Source: Environment variable (HYPERTOOL_MAX_CONNECTIONS=${envValue})`
      );
    } else {
      console.log(
        `  Source: Config file or default (invalid env var: ${envValue})`
      );
    }
  } else {
    // Check if it's from config file
    try {
      const { readFile } = await import("fs/promises");
      const { join } = await import("path");
      const { homedir } = await import("os");

      const configPath = join(
        homedir(),
        ".toolprint/hypertool-mcp/config.json"
      );
      const content = await readFile(configPath, "utf-8");
      const fullConfig = JSON.parse(content) as CompleteConfig;

      if (fullConfig.serverSettings?.maxConcurrentConnections !== undefined) {
        console.log(`  Source: Config file (${configPath})`);
      } else {
        console.log(
          `  Source: Default value (${DEFAULT_POOL_CONFIG.maxConcurrentConnections})`
        );
      }
    } catch {
      console.log(
        `  Source: Default value (${DEFAULT_POOL_CONFIG.maxConcurrentConnections})`
      );
    }
  }
}
