/**
 * Path utilities for consistent path handling across the application
 */

import { homedir } from "os";

/**
 * Get the home directory, respecting test environment overrides
 * 
 * In test environments, this can be overridden using the HYPERTOOL_TEST_HOME
 * environment variable to ensure complete isolation from the user's real
 * home directory and configuration files.
 * 
 * @returns The home directory path
 */
export function getHomeDir(): string {
  // Check for test environment override first
  if (process.env.HYPERTOOL_TEST_HOME) {
    return process.env.HYPERTOOL_TEST_HOME;
  }
  
  // Fall back to the real home directory
  return homedir();
}