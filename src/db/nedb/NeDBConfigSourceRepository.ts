/**
 * NeDB implementation of the ConfigSource repository
 */

import Datastore from "nedb";
import { v4 as uuidv4 } from "uuid";
import { IConfigSource, IConfigSourceRepository } from "../interfaces.js";
import { createChildLogger } from "../../utils/logging.js";

const logger = createChildLogger({ module: "NeDBConfigSourceRepository" });

export class NeDBConfigSourceRepository implements IConfigSourceRepository {
  private db: Datastore;

  constructor(datastore: Datastore) {
    this.db = datastore;
  }

  /**
   * Add a new configuration source
   */
  async add(source: Omit<IConfigSource, "id">): Promise<IConfigSource> {
    return new Promise((resolve, reject) => {
      const record: IConfigSource = {
        ...source,
        id: uuidv4(),
      };

      this.db.insert(record, (err, newDoc) => {
        if (err) {
          logger.error("Failed to add config source:", err);
          reject(err);
        } else {
          resolve(newDoc as IConfigSource);
        }
      });
    });
  }

  /**
   * Update an existing configuration source
   */
  async update(source: IConfigSource): Promise<IConfigSource | null> {
    return new Promise((resolve, reject) => {
      this.db.update(
        { id: source.id },
        { $set: source },
        { returnUpdatedDocs: true },
        (err, numReplaced, updatedDoc) => {
          if (err) {
            logger.error("Failed to update config source:", err);
            reject(err);
          } else if (numReplaced === 0) {
            resolve(null);
          } else {
            resolve(updatedDoc as unknown as IConfigSource);
          }
        }
      );
    });
  }

  /**
   * Delete a configuration source
   */
  async delete(id: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
      this.db.remove({ id }, {}, (err, numRemoved) => {
        if (err) {
          logger.error("Failed to delete config source:", err);
          reject(err);
        } else {
          resolve(numRemoved > 0);
        }
      });
    });
  }

  /**
   * Find a configuration source by ID
   */
  async findById(id: string): Promise<IConfigSource | null> {
    return new Promise((resolve, reject) => {
      this.db.findOne({ id }, (err, doc) => {
        if (err) {
          logger.error("Failed to find config source by ID:", err);
          reject(err);
        } else {
          resolve(doc as IConfigSource | null);
        }
      });
    });
  }

  /**
   * Find a configuration source by path
   */
  async findByPath(path: string): Promise<IConfigSource | null> {
    return new Promise((resolve, reject) => {
      this.db.findOne({ path }, (err, doc) => {
        if (err) {
          logger.error("Failed to find config source by path:", err);
          reject(err);
        } else {
          resolve(doc as IConfigSource | null);
        }
      });
    });
  }

  /**
   * Find all configuration sources for a specific app
   */
  async findByAppId(appId: string): Promise<IConfigSource[]> {
    return new Promise((resolve, reject) => {
      this.db.find({ appId }, (err: Error | null, docs: any[]) => {
        if (err) {
          logger.error("Failed to find config sources by app ID:", err);
          reject(err);
        } else {
          resolve(docs as IConfigSource[]);
        }
      });
    });
  }

  /**
   * Find all configuration sources
   */
  async findAll(): Promise<IConfigSource[]> {
    return new Promise((resolve, reject) => {
      this.db.find({}, (err: Error | null, docs: any[]) => {
        if (err) {
          logger.error("Failed to find all config sources:", err);
          reject(err);
        } else {
          resolve(docs as IConfigSource[]);
        }
      });
    });
  }
}
