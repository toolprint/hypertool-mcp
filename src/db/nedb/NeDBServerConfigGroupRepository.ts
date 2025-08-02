/**
 * NeDB implementation of the ServerConfigGroup repository
 */

import Datastore from 'nedb';
import { v4 as uuidv4 } from 'uuid';
import { 
  ServerConfigGroup, 
  ServerConfigRecord, 
  IServerConfigGroupRepository, 
  IServerConfigRecordRepository 
} from '../interfaces.js';
import { createChildLogger } from '../../utils/logging.js';

const logger = createChildLogger({ module: 'NeDBServerConfigGroupRepository' });

export class NeDBServerConfigGroupRepository implements IServerConfigGroupRepository {
  private db: Datastore;
  private serverRepository: IServerConfigRecordRepository;

  constructor(datastore: Datastore, serverRepository: IServerConfigRecordRepository) {
    this.db = datastore;
    this.serverRepository = serverRepository;
  }

  /**
   * Add a new server configuration group
   */
  async add(group: Omit<ServerConfigGroup, 'id'>): Promise<ServerConfigGroup> {
    return new Promise((resolve, reject) => {
      const record: ServerConfigGroup = {
        ...group,
        id: uuidv4(),
      };

      this.db.insert(record, (err, newDoc) => {
        if (err) {
          logger.error('Failed to add group record:', err);
          reject(err);
        } else {
          resolve(newDoc as ServerConfigGroup);
        }
      });
    });
  }

  /**
   * Update an existing server configuration group
   */
  async update(group: ServerConfigGroup): Promise<ServerConfigGroup | null> {
    return new Promise((resolve, reject) => {
      this.db.update(
        { id: group.id },
        { $set: group },
        { returnUpdatedDocs: true },
        (err, numReplaced, updatedDoc) => {
          if (err) {
            logger.error('Failed to update group record:', err);
            reject(err);
          } else if (numReplaced === 0) {
            resolve(null);
          } else {
            resolve((updatedDoc as unknown) as ServerConfigGroup);
          }
        }
      );
    });
  }

  /**
   * Delete a server configuration group
   */
  async delete(id: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
      this.db.remove({ id }, {}, (err, numRemoved) => {
        if (err) {
          logger.error('Failed to delete group record:', err);
          reject(err);
        } else {
          resolve(numRemoved > 0);
        }
      });
    });
  }

  /**
   * Find a server configuration group by ID
   */
  async findById(id: string): Promise<ServerConfigGroup | null> {
    return new Promise((resolve, reject) => {
      this.db.findOne({ id }, (err, doc) => {
        if (err) {
          logger.error('Failed to find group record by ID:', err);
          reject(err);
        } else {
          resolve(doc as ServerConfigGroup | null);
        }
      });
    });
  }

  /**
   * Find a server configuration group by name
   */
  async findByName(name: string): Promise<ServerConfigGroup | null> {
    return new Promise((resolve, reject) => {
      this.db.findOne({ name }, (err, doc) => {
        if (err) {
          logger.error('Failed to find group record by name:', err);
          reject(err);
        } else {
          resolve(doc as ServerConfigGroup | null);
        }
      });
    });
  }

  /**
   * Find all server configuration groups
   */
  async findAll(): Promise<ServerConfigGroup[]> {
    return new Promise((resolve, reject) => {
      this.db.find({}, (err: Error | null, docs: any[]) => {
        if (err) {
          logger.error('Failed to find all group records:', err);
          reject(err);
        } else {
          resolve(docs as ServerConfigGroup[]);
        }
      });
    });
  }

  /**
   * Retrieves all ServerConfigRecord objects that are members of a specific group
   */
  async findServersInGroup(groupId: string): Promise<ServerConfigRecord[]> {
    const group = await this.findById(groupId);
    if (!group) {
      return [];
    }

    const servers: ServerConfigRecord[] = [];
    for (const serverId of group.serverIds) {
      const server = await this.serverRepository.findById(serverId);
      if (server) {
        servers.push(server);
      } else {
        logger.warn(`Server with ID ${serverId} not found in group ${groupId}`);
      }
    }

    return servers;
  }
}