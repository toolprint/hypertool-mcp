/**
 * Database test utilities for proper test isolation
 */

import { resetCompositeDatabaseServiceForTesting } from "../db/compositeDatabaseService.js";

/**
 * Reset all database singletons and state for test isolation
 * Call this in afterEach or beforeEach to prevent database state leakage between tests
 */
export function resetDatabaseForTesting(): void {
  if (
    process.env.NODE_ENV !== "test" &&
    !process.env.NODE_ENV?.includes("test")
  ) {
    throw new Error(
      "resetDatabaseForTesting() can only be called in test environment"
    );
  }

  try {
    resetCompositeDatabaseServiceForTesting();
  } catch (error) {
    // Ignore errors during reset in tests
    console.debug("Database reset warning:", error);
  }
}

/**
 * Setup database for testing with proper isolation
 * Use this in beforeEach for tests that use the database
 */
export function setupDatabaseForTesting(): void {
  resetDatabaseForTesting();
}

/**
 * Cleanup database after testing
 * Use this in afterEach for tests that use the database
 */
export function cleanupDatabaseForTesting(): void {
  resetDatabaseForTesting();
}
