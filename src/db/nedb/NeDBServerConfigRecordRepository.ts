/**
 * NeDB implementation of the ServerConfigRecord repository
 */

import Datastore from "@seald-io/nedb";
import { v4 as uuidv4 } from "uuid";
import {
  ServerConfigRecord,
  IServerConfigRecordRepository,
} from "../interfaces.js";
import { createChildLogger } from "../../utils/logging.js";

const logger = createChildLogger({
  module: "NeDBServerConfigRecordRepository",
});

export class NeDBServerConfigRecordRepository
  implements IServerConfigRecordRepository
{
  private db: Datastore;

  constructor(datastore: Datastore) {
    this.db = datastore;
  }

  /**
   * Add a new server configuration record
   */
  async add(
    server: Omit<ServerConfigRecord, "id">
  ): Promise<ServerConfigRecord> {
    return new Promise((resolve, reject) => {
      const record: ServerConfigRecord = {
        ...server,
        id: uuidv4(),
      };

      this.db.insert(record, (err, newDoc) => {
        if (err) {
          logger.error("Failed to add server record:", err);
          reject(err);
        } else {
          resolve(newDoc as ServerConfigRecord);
        }
      });
    });
  }

  /**
   * Update an existing server configuration record
   */
  async update(server: ServerConfigRecord): Promise<ServerConfigRecord | null> {
    return new Promise((resolve, reject) => {
      this.db.update(
        { id: server.id },
        { $set: server },
        { returnUpdatedDocs: true },
        (err, numReplaced, updatedDoc) => {
          if (err) {
            logger.error("Failed to update server record:", err);
            reject(err);
          } else if (numReplaced === 0) {
            resolve(null);
          } else {
            resolve(updatedDoc as unknown as ServerConfigRecord);
          }
        }
      );
    });
  }

  /**
   * Delete a server configuration record
   */
  async delete(id: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
      this.db.remove({ id }, {}, (err, numRemoved) => {
        if (err) {
          logger.error("Failed to delete server record:", err);
          reject(err);
        } else {
          resolve(numRemoved > 0);
        }
      });
    });
  }

  /**
   * Find a server configuration record by ID
   */
  async findById(id: string): Promise<ServerConfigRecord | null> {
    return new Promise((resolve, reject) => {
      this.db.findOne({ id }, (err, doc) => {
        if (err) {
          logger.error("Failed to find server record by ID:", err);
          reject(err);
        } else {
          resolve(doc as unknown as ServerConfigRecord | null);
        }
      });
    });
  }

  /**
   * Find a server configuration record by name
   */
  async findByName(name: string): Promise<ServerConfigRecord | null> {
    return new Promise((resolve, reject) => {
      this.db.findOne({ name }, (err, doc) => {
        if (err) {
          logger.error("Failed to find server record by name:", err);
          reject(err);
        } else {
          resolve(doc as unknown as ServerConfigRecord | null);
        }
      });
    });
  }

  /**
   * Find all server configuration records
   */
  async findAll(): Promise<ServerConfigRecord[]> {
    return new Promise((resolve, reject) => {
      this.db.find({}, (err: Error | null, docs: any[]) => {
        if (err) {
          logger.error("Failed to find all server records:", err);
          reject(err);
        } else {
          resolve(docs as ServerConfigRecord[]);
        }
      });
    });
  }
}
