/**
 * Persona directory configuration
 *
 * Provides centralized management of the persona directory path with proper precedence:
 * 1. Environment variable HYPERTOOL_PERSONA_DIR (highest priority)
 * 2. Config file personaDir setting
 * 3. Default ~/.toolprint/hypertool-mcp/personas (fallback)
 */

import { homedir } from "os";
import { resolve } from "path";
import { loadCompleteConfig } from "./preferenceStore.js";

/**
 * Get the configured persona directory with proper precedence
 *
 * @returns Resolved absolute path to the persona directory
 */
export async function getPersonaDirectory(): Promise<string> {
  // 1. Check environment variable (highest priority)
  const envDir = process.env.HYPERTOOL_PERSONA_DIR;
  if (envDir && envDir.trim()) {
    return resolve(envDir.trim());
  }

  // 2. Check config file setting
  try {
    const config = await loadCompleteConfig();
    if (config.personaDir && config.personaDir.trim()) {
      return resolve(config.personaDir.trim());
    }
  } catch {
    // Config file might not exist or be corrupted, continue to default
  }

  // 3. Use default path
  return resolve(homedir(), ".toolprint", "hypertool-mcp", "personas");
}

/**
 * Get the configured persona directory synchronously using cached config
 *
 * Note: This is a synchronous version that works with environment variables
 * and cached config, but may not reflect the latest config file changes.
 * Use getPersonaDirectory() for the most up-to-date path.
 *
 * @returns Resolved absolute path to the persona directory
 */
export function getPersonaDirectorySync(): string {
  // 1. Check environment variable (highest priority)
  const envDir = process.env.HYPERTOOL_PERSONA_DIR;
  if (envDir && envDir.trim()) {
    return resolve(envDir.trim());
  }

  // 2. For sync version, we can't easily read config file reliably
  // Most callers should use the async version for config file support

  // 3. Use default path
  return resolve(homedir(), ".toolprint", "hypertool-mcp", "personas");
}

/**
 * Get configuration source for transparency/debugging
 *
 * @returns String indicating how the persona directory was configured
 */
export async function getPersonaDirectorySource(): Promise<string> {
  const envDir = process.env.HYPERTOOL_PERSONA_DIR;
  if (envDir && envDir.trim()) {
    return "environment variable HYPERTOOL_PERSONA_DIR";
  }

  try {
    const config = await loadCompleteConfig();
    if (config.personaDir && config.personaDir.trim()) {
      return "config.json personaDir setting";
    }
  } catch {
    // Config file issues
  }

  return "default location";
}
