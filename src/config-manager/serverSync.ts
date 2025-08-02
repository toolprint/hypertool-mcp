/**
 * Server synchronization module
 * Reconciles mcp.json configurations with the internal database
 */

import * as crypto from 'crypto';
import { ServerConfig } from '../types/config.js';
import { IDatabaseService } from '../db/interfaces.js';
import { ServerConfigRecord } from '../db/interfaces.js';
import { createChildLogger } from '../utils/logging.js';

const logger = createChildLogger({ module: 'serverSync' });

export class ServerSyncManager {
  private dbService: IDatabaseService;

  constructor(dbService: IDatabaseService) {
    this.dbService = dbService;
  }

  /**
   * Calculate checksum for a server configuration
   */
  private calculateChecksum(config: ServerConfig): string {
    const configString = JSON.stringify(config, Object.keys(config).sort());
    return crypto.createHash('sha256').update(configString).digest('hex');
  }

  /**
   * Sync server configurations from mcp.json with the database
   */
  async syncServers(mcpServers: Record<string, ServerConfig>): Promise<{
    added: number;
    updated: number;
    deleted: number;
  }> {
    const stats = { added: 0, updated: 0, deleted: 0 };

    try {
      logger.debug('Starting server synchronization');

      // Get all existing servers from the database
      const existingServers = await this.dbService.servers.findAll();
      const existingServerMap = new Map(
        existingServers.map(server => [server.name, server])
      );

      // Track which servers we've seen in the config
      const seenServerNames = new Set<string>();

      // Process each server from mcp.json
      for (const [serverName, serverConfig] of Object.entries(mcpServers)) {
        seenServerNames.add(serverName);
        const checksum = this.calculateChecksum(serverConfig);

        const existingServer = existingServerMap.get(serverName);

        if (!existingServer) {
          // Add new server
          await this.dbService.servers.add({
            name: serverName,
            type: serverConfig.type,
            config: serverConfig,
            lastModified: Date.now(),
            checksum,
          });
          stats.added++;
          logger.debug(`Added new server: ${serverName}`);
        } else if (existingServer.checksum !== checksum) {
          // Update existing server
          await this.dbService.servers.update({
            ...existingServer,
            config: serverConfig,
            type: serverConfig.type,
            lastModified: Date.now(),
            checksum,
          });
          stats.updated++;
          logger.debug(`Updated server: ${serverName}`);
        }
      }

      // Delete servers that are no longer in mcp.json
      for (const existingServer of existingServers) {
        if (!seenServerNames.has(existingServer.name)) {
          await this.dbService.servers.delete(existingServer.id);
          stats.deleted++;
          logger.debug(`Deleted server: ${existingServer.name}`);

          // Clean up group references
          await this.removeServerFromGroups(existingServer.id);
        }
      }

      logger.info(
        `Server sync completed: ${stats.added} added, ${stats.updated} updated, ${stats.deleted} deleted`
      );

      return stats;
    } catch (error) {
      logger.error('Server synchronization failed:', error);
      throw error;
    }
  }

  /**
   * Remove a server from all groups that reference it
   */
  private async removeServerFromGroups(serverId: string): Promise<void> {
    const groups = await this.dbService.groups.findAll();

    for (const group of groups) {
      if (group.serverIds.includes(serverId)) {
        const updatedServerIds = group.serverIds.filter(id => id !== serverId);
        await this.dbService.groups.update({
          ...group,
          serverIds: updatedServerIds,
        });
        logger.debug(`Removed server ${serverId} from group ${group.name}`);
      }
    }
  }

  /**
   * Get server configurations for a specific group
   */
  async getServersForGroup(groupName: string): Promise<ServerConfigRecord[]> {
    const group = await this.dbService.groups.findByName(groupName);
    if (!group) {
      throw new Error(`Group "${groupName}" not found`);
    }

    return this.dbService.groups.findServersInGroup(group.id);
  }

  /**
   * Get all server configurations from the database
   */
  async getAllServers(): Promise<ServerConfigRecord[]> {
    return this.dbService.servers.findAll();
  }
}