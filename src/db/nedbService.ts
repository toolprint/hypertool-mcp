/**
 * NeDB database service implementation
 * Manages initialization and provides access to repositories
 */

import Datastore from "nedb";
import * as path from "path";
import * as fs from "fs/promises";
import {
  IDatabaseService,
  IServerConfigRecordRepository,
  IServerConfigGroupRepository,
  IConfigSourceRepository,
} from "./interfaces.js";
import { NeDBServerConfigRecordRepository } from "./nedb/NeDBServerConfigRecordRepository.js";
import { NeDBServerConfigGroupRepository } from "./nedb/NeDBServerConfigGroupRepository.js";
import { NeDBConfigSourceRepository } from "./nedb/NeDBConfigSourceRepository.js";
import { getEnvironmentConfig } from "../config/environment.js";
import { createChildLogger } from "../utils/logging.js";

const logger = createChildLogger({ module: "NeDBService" });

export class NeDBService implements IDatabaseService {
  private _servers!: IServerConfigRecordRepository;
  private _groups!: IServerConfigGroupRepository;
  private _configSources!: IConfigSourceRepository;
  private serversDb!: Datastore;
  private groupsDb!: Datastore;
  private configSourcesDb!: Datastore;
  private dbPath: string;
  private isInitialized = false;

  constructor() {
    // Use the environment configuration to determine the database path
    const envConfig = getEnvironmentConfig();
    this.dbPath = path.join(envConfig.configRoot, "db");
  }

  /**
   * Get the servers repository
   */
  get servers(): IServerConfigRecordRepository {
    if (!this.isInitialized) {
      throw new Error("Database not initialized. Call init() first.");
    }
    return this._servers;
  }

  /**
   * Get the groups repository
   */
  get groups(): IServerConfigGroupRepository {
    if (!this.isInitialized) {
      throw new Error("Database not initialized. Call init() first.");
    }
    return this._groups;
  }

  /**
   * Get the config sources repository
   */
  get configSources(): IConfigSourceRepository {
    if (!this.isInitialized) {
      throw new Error("Database not initialized. Call init() first.");
    }
    return this._configSources;
  }

  /**
   * Initialize the database
   */
  async init(): Promise<void> {
    if (this.isInitialized) {
      logger.warn("Database already initialized");
      return;
    }

    logger.debug(`Initializing NeDB database at: ${this.dbPath}`);

    // Ensure database directory exists
    await this.ensureDbDirectory();

    // Initialize servers datastore
    const serversPath = path.join(this.dbPath, "mcp-servers.db");
    this.serversDb = new Datastore({
      filename: serversPath,
      autoload: true,
    });

    // Initialize groups datastore
    const groupsPath = path.join(this.dbPath, "mcp-groups.db");
    this.groupsDb = new Datastore({
      filename: groupsPath,
      autoload: true,
    });

    // Initialize config sources datastore
    const configSourcesPath = path.join(this.dbPath, "mcp-config-sources.db");
    this.configSourcesDb = new Datastore({
      filename: configSourcesPath,
      autoload: true,
    });

    // Create indexes
    await this.createIndexes();

    // Initialize repositories
    this._servers = new NeDBServerConfigRecordRepository(this.serversDb);
    this._groups = new NeDBServerConfigGroupRepository(
      this.groupsDb,
      this._servers
    );
    this._configSources = new NeDBConfigSourceRepository(this.configSourcesDb);

    this.isInitialized = true;
    logger.info("Database initialized successfully");
  }

  /**
   * Close the database
   */
  async close(): Promise<void> {
    if (!this.isInitialized) {
      return;
    }

    // NeDB doesn't have a specific close method, but we can ensure data is persisted
    await this.compactDatafiles();

    this.isInitialized = false;
    logger.info("Database closed successfully");
  }

  /**
   * Ensure the database directory exists
   */
  private async ensureDbDirectory(): Promise<void> {
    try {
      await fs.mkdir(this.dbPath, { recursive: true });
    } catch (error) {
      logger.error("Failed to create database directory:", error);
      throw error;
    }
  }

  /**
   * Create database indexes for efficient querying
   */
  private async createIndexes(): Promise<void> {
    return new Promise((resolve, reject) => {
      let completed = 0;
      const total = 7; // Total number of indexes to create

      const checkComplete = () => {
        completed++;
        if (completed === total) {
          logger.debug("All indexes created successfully");
          resolve();
        }
      };

      // Create unique index on servers.id
      this.serversDb.ensureIndex({ fieldName: "id", unique: true }, (err) => {
        if (err) {
          logger.error("Failed to create index on servers.id:", err);
          reject(err);
        } else {
          checkComplete();
        }
      });

      // Create unique index on servers.name
      this.serversDb.ensureIndex({ fieldName: "name", unique: true }, (err) => {
        if (err) {
          logger.error("Failed to create index on servers.name:", err);
          reject(err);
        } else {
          checkComplete();
        }
      });

      // Create unique index on groups.id
      this.groupsDb.ensureIndex({ fieldName: "id", unique: true }, (err) => {
        if (err) {
          logger.error("Failed to create index on groups.id:", err);
          reject(err);
        } else {
          checkComplete();
        }
      });

      // Create unique index on groups.name
      this.groupsDb.ensureIndex({ fieldName: "name", unique: true }, (err) => {
        if (err) {
          logger.error("Failed to create index on groups.name:", err);
          reject(err);
        } else {
          checkComplete();
        }
      });

      // Create unique index on configSources.id
      this.configSourcesDb.ensureIndex(
        { fieldName: "id", unique: true },
        (err) => {
          if (err) {
            logger.error("Failed to create index on configSources.id:", err);
            reject(err);
          } else {
            checkComplete();
          }
        }
      );

      // Create unique index on configSources.path
      this.configSourcesDb.ensureIndex(
        { fieldName: "path", unique: true },
        (err) => {
          if (err) {
            logger.error("Failed to create index on configSources.path:", err);
            reject(err);
          } else {
            checkComplete();
          }
        }
      );

      // Create index on configSources.appId (non-unique)
      this.configSourcesDb.ensureIndex({ fieldName: "appId" }, (err) => {
        if (err) {
          logger.error("Failed to create index on configSources.appId:", err);
          reject(err);
        } else {
          checkComplete();
        }
      });
    });
  }

  /**
   * Compact datafiles to reclaim disk space
   */
  private async compactDatafiles(): Promise<void> {
    return new Promise((resolve) => {
      let completed = 0;
      const total = 3;

      const checkComplete = () => {
        completed++;
        if (completed === total) {
          resolve();
        }
      };

      this.serversDb.persistence.compactDatafile();
      this.serversDb.on("compaction.done", checkComplete);

      this.groupsDb.persistence.compactDatafile();
      this.groupsDb.on("compaction.done", checkComplete);

      this.configSourcesDb.persistence.compactDatafile();
      this.configSourcesDb.on("compaction.done", checkComplete);
    });
  }
}

// Singleton instance
let instance: NeDBService | null = null;

/**
 * Get the singleton database service instance
 */
export function getDatabaseService(): IDatabaseService {
  if (!instance) {
    instance = new NeDBService();
  }
  return instance;
}
