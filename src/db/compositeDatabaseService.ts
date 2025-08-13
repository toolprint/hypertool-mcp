/**
 * Database service using file-based implementation
 */

import {
  IDatabaseService,
  IServerConfigRecordRepository,
  IServerConfigGroupRepository,
  IConfigSourceRepository,
} from "./interfaces.js";
import { FileDatabaseService } from "./fileDatabaseService.js";
import { createChildLogger } from "../utils/logging.js";

const logger = createChildLogger({ module: "DatabaseService" });

/**
 * Database service that uses file-based implementation
 */
export class CompositeDatabaseService implements IDatabaseService {
  private implementation: FileDatabaseService;
  private isInitialized = false;

  constructor() {
    this.implementation = new FileDatabaseService();
  }

  /**
   * Get the servers repository
   */
  get servers(): IServerConfigRecordRepository {
    if (!this.isInitialized) {
      throw new Error("Database not initialized. Call init() first.");
    }
    return this.implementation.servers;
  }

  /**
   * Get the groups repository
   */
  get groups(): IServerConfigGroupRepository {
    if (!this.isInitialized) {
      throw new Error("Database not initialized. Call init() first.");
    }
    return this.implementation.groups;
  }

  /**
   * Get the config sources repository
   */
  get configSources(): IConfigSourceRepository {
    if (!this.isInitialized) {
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

    logger.debug("Initializing database service");

    // Initialize the file-based implementation
    await this.implementation.init();

    this.isInitialized = true;
    logger.info("Database service initialized successfully");
  }

  /**
   * Close the database
   */
  async close(): Promise<void> {
    if (!this.isInitialized) {
      return;
    }

    await this.implementation.close();
    this.isInitialized = false;
    logger.info("Database service closed successfully");
  }

  /**
   * Reset the database for testing purposes
   * Only available in test environment
   */
  resetForTesting(): void {
    if (
      process.env.NODE_ENV !== "test" &&
      !process.env.NODE_ENV?.includes("test")
    ) {
      throw new Error(
        "resetForTesting() can only be called in test environment"
      );
    }

    this.isInitialized = false;
    this.implementation = new FileDatabaseService();
  }

  /**
   * Get the underlying implementation type (for debugging/testing)
   */
  getImplementationType(): "file" {
    return "file";
  }
}

// Singleton instance
let instance: CompositeDatabaseService | null = null;

/**
 * Get the singleton database service instance
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
  if (
    process.env.NODE_ENV !== "test" &&
    !process.env.NODE_ENV?.includes("test")
  ) {
    throw new Error(
      "resetCompositeDatabaseServiceForTesting() can only be called in test environment"
    );
  }

  if (instance) {
    instance.resetForTesting();
    instance = null;
  }
}
