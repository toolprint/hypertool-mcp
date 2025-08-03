/**
 * Composite database service that routes to either NeDB or file-based implementation
 * based on feature flags
 */

import {
  IDatabaseService,
  IServerConfigRecordRepository,
  IServerConfigGroupRepository,
  IConfigSourceRepository,
} from "./interfaces.js";
import { NeDBService } from "./nedbService.js";
import { FileDatabaseService } from "./fileDatabaseService.js";
import { getFeatureFlagService } from "../config/featureFlagService.js";
import { createChildLogger } from "../utils/logging.js";

const logger = createChildLogger({ module: "CompositeDatabaseService" });

/**
 * Composite database service that delegates to appropriate implementation
 */
export class CompositeDatabaseService implements IDatabaseService {
  private implementation?: IDatabaseService;
  private isInitialized = false;

  /**
   * Get the servers repository
   */
  get servers(): IServerConfigRecordRepository {
    if (!this.implementation || !this.isInitialized) {
      throw new Error("Database not initialized. Call init() first.");
    }
    return this.implementation.servers;
  }

  /**
   * Get the groups repository
   */
  get groups(): IServerConfigGroupRepository {
    if (!this.implementation || !this.isInitialized) {
      throw new Error("Database not initialized. Call init() first.");
    }
    return this.implementation.groups;
  }

  /**
   * Get the config sources repository
   */
  get configSources(): IConfigSourceRepository {
    if (!this.implementation || !this.isInitialized) {
      throw new Error("Database not initialized. Call init() first.");
    }
    return this.implementation.configSources;
  }

  /**
   * Initialize the database
   */
  async init(): Promise<void> {
    if (this.isInitialized) {
      logger.warn("Database already initialized");
      return;
    }

    logger.debug("Initializing composite database service");

    // Initialize feature flags
    const featureFlagService = getFeatureFlagService();
    await featureFlagService.initialize();

    // Determine which implementation to use
    const useNedb = featureFlagService.isNedbEnabled();
    logger.info(`Using ${useNedb ? "NeDB" : "file-based"} database implementation`);

    // Create appropriate implementation
    if (useNedb) {
      this.implementation = new NeDBService();
    } else {
      this.implementation = new FileDatabaseService();
    }

    // Initialize the implementation
    await this.implementation.init();

    this.isInitialized = true;
    logger.info("Composite database service initialized successfully");
  }

  /**
   * Close the database
   */
  async close(): Promise<void> {
    if (!this.implementation || !this.isInitialized) {
      return;
    }

    await this.implementation.close();
    this.isInitialized = false;
    logger.info("Composite database service closed successfully");
  }

  /**
   * Reset the database for testing purposes
   * Only available in test environment
   */
  resetForTesting(): void {
    if (process.env.NODE_ENV !== 'test' && !process.env.NODE_ENV?.includes('test')) {
      throw new Error('resetForTesting() can only be called in test environment');
    }
    
    this.isInitialized = false;
    this.implementation = undefined;
  }

  /**
   * Get the underlying implementation type (for debugging/testing)
   */
  getImplementationType(): "nedb" | "file" | null {
    if (!this.implementation) {
      return null;
    }
    return this.implementation instanceof NeDBService ? "nedb" : "file";
  }
}

// Singleton instance
let instance: CompositeDatabaseService | null = null;

/**
 * Get the singleton composite database service instance
 */
export function getCompositeDatabaseService(): IDatabaseService {
  if (!instance) {
    instance = new CompositeDatabaseService();
  }
  return instance;
}

/**
 * Reset the singleton instance for testing
 * Only available in test environment
 */
export function resetCompositeDatabaseServiceForTesting(): void {
  if (process.env.NODE_ENV !== 'test' && !process.env.NODE_ENV?.includes('test')) {
    throw new Error('resetCompositeDatabaseServiceForTesting() can only be called in test environment');
  }
  
  if (instance) {
    instance.resetForTesting();
    instance = null;
  }
}