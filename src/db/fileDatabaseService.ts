/**
 * File-based database service implementation
 * Uses JSON files for storage instead of NeDB
 */

import {
  IDatabaseService,
  IServerConfigRecordRepository,
  IServerConfigGroupRepository,
  IConfigSourceRepository,
} from "./interfaces.js";
import { FileServerConfigRecordRepository } from "./file/FileServerConfigRecordRepository.js";
import { FileServerConfigGroupRepository } from "./file/FileServerConfigGroupRepository.js";
import { NullConfigSourceRepository } from "./file/NullConfigSourceRepository.js";
import { createChildLogger } from "../utils/logging.js";

const logger = createChildLogger({ module: "FileDatabaseService" });

/**
 * File-based implementation of the database service
 */
export class FileDatabaseService implements IDatabaseService {
  private _servers!: IServerConfigRecordRepository;
  private _groups!: IServerConfigGroupRepository;
  private _configSources!: IConfigSourceRepository;
  private isInitialized = false;

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
   * Get the config sources repository (stub for file-based)
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

    logger.debug("Initializing file-based database service");

    // Initialize repositories
    const serverRepo = new FileServerConfigRecordRepository();
    await serverRepo.init();
    this._servers = serverRepo;

    const groupRepo = new FileServerConfigGroupRepository(this._servers);
    await groupRepo.init();
    this._groups = groupRepo;

    this._configSources = new NullConfigSourceRepository();

    this.isInitialized = true;
    logger.info("File-based database initialized successfully");
  }

  /**
   * Close the database (no-op for file-based)
   */
  async close(): Promise<void> {
    if (!this.isInitialized) {
      return;
    }

    // File-based storage doesn't need explicit closing
    this.isInitialized = false;
    logger.info("File-based database closed successfully");
  }
}
