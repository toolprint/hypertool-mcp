/**
 * Server synchronization module
 * Reconciles configurations from multiple sources with the internal database
 */

import * as crypto from "crypto";
import { ServerConfig } from "../types/config.js";
import { IDatabaseService, IConfigSource } from "../db/interfaces.js";
import { ServerConfigRecord } from "../db/interfaces.js";
import { createChildLogger } from "../utils/logging.js";
import { isNedbEnabled } from "../config/environment.js";

const logger = createChildLogger({ module: "serverSync" });

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
    return crypto.createHash("sha256").update(configString).digest("hex");
  }

  /**
   * Sync server configurations from a specific source with the database
   */
  async syncServersFromSource(
    mcpServers: Record<string, ServerConfig>,
    source: IConfigSource
  ): Promise<{
    added: number;
    updated: number;
    deleted: number;
  }> {
    const stats = { added: 0, updated: 0, deleted: 0 };

    // If NeDB is disabled, skip database synchronization
    if (!isNedbEnabled()) {
      logger.debug(
        "NeDB disabled - skipping server synchronization to database"
      );
      // Return zero stats as no database operations were performed
      return stats;
    }

    try {
      logger.debug(
        `Starting server synchronization from source: ${source.type}/${source.id}`
      );

      // Get all existing servers from this source
      const allServers = await this.dbService.servers.findAll();
      const sourceServers = allServers.filter((s) => s.sourceId === source.id);
      const sourceServerMap = new Map(
        sourceServers.map((server) => [server.name, server])
      );

      // Track which servers we've seen in the config
      const seenServerNames = new Set<string>();

      // Process each server from the config
      for (const [serverName, serverConfig] of Object.entries(mcpServers)) {
        seenServerNames.add(serverName);
        const checksum = this.calculateChecksum(serverConfig);

        // Check if server exists (from any source)
        const existingServer =
          await this.dbService.servers.findByName(serverName);

        if (!existingServer) {
          // Add new server
          await this.dbService.servers.add({
            name: serverName,
            type: serverConfig.type,
            config: serverConfig,
            lastModified: Date.now(),
            checksum,
            sourceId: source.id,
          });
          stats.added++;
          logger.debug(`Added new server: ${serverName}`);
        } else if (existingServer.sourceId === source.id) {
          // Update if owned by this source and changed
          if (existingServer.checksum !== checksum) {
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
        } else {
          // Server exists but owned by different source
          // Check priority to determine if we should update
          const existingSource = await this.dbService.configSources.findById(
            existingServer.sourceId!
          );
          if (existingSource && source.priority > existingSource.priority) {
            await this.dbService.servers.update({
              ...existingServer,
              config: serverConfig,
              type: serverConfig.type,
              lastModified: Date.now(),
              checksum,
              sourceId: source.id,
            });
            stats.updated++;
            logger.debug(
              `Updated server: ${serverName} (took ownership from lower priority source)`
            );
          }
        }
      }

      // Delete servers from this source that are no longer in the config
      for (const sourceServer of sourceServers) {
        if (!seenServerNames.has(sourceServer.name)) {
          await this.dbService.servers.delete(sourceServer.id);
          stats.deleted++;
          logger.debug(`Deleted server: ${sourceServer.name}`);

          // Clean up group references
          await this.removeServerFromGroups(sourceServer.id);
        }
      }

      logger.info(
        `Server sync completed for source ${source.type}/${source.id}: ${stats.added} added, ${stats.updated} updated, ${stats.deleted} deleted`
      );

      return stats;
    } catch (error) {
      logger.error("Server synchronization failed:", error);
      throw error;
    }
  }

  /**
   * Legacy sync method - creates/uses global source
   */
  async syncServers(mcpServers: Record<string, ServerConfig>): Promise<{
    added: number;
    updated: number;
    deleted: number;
  }> {
    // If NeDB is disabled, skip database synchronization
    if (!isNedbEnabled()) {
      logger.debug(
        "NeDB disabled - skipping server synchronization to database"
      );
      return { added: 0, updated: 0, deleted: 0 };
    }

    // Get or create global config source
    let globalSource = await this.dbService.configSources.findByPath("global");
    if (!globalSource) {
      globalSource = await this.dbService.configSources.add({
        type: "global",
        path: "global",
        priority: 100,
        lastSynced: Date.now(),
      });
    }

    return this.syncServersFromSource(mcpServers, globalSource);
  }

  /**
   * Remove a server from all groups that reference it
   */
  private async removeServerFromGroups(serverId: string): Promise<void> {
    const groups = await this.dbService.groups.findAll();

    for (const group of groups) {
      if (group.serverIds.includes(serverId)) {
        const updatedServerIds = group.serverIds.filter(
          (id) => id !== serverId
        );
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
    // If NeDB is disabled, groups are not available
    if (!isNedbEnabled()) {
      logger.warn("NeDB disabled - server groups are not available");
      throw new Error(
        "Server groups require NeDB to be enabled (set HYPERTOOL_NEDB_ENABLED=true)"
      );
    }

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
    // If NeDB is disabled, return empty array
    if (!isNedbEnabled()) {
      logger.debug("NeDB disabled - returning empty server list");
      return [];
    }

    return this.dbService.servers.findAll();
  }

  /**
   * Sync all configuration sources
   */
  async syncAllSources(): Promise<{
    total: { added: number; updated: number; deleted: number };
    sources: Array<{
      sourceId: string;
      type: string;
      stats: { added: number; updated: number; deleted: number };
    }>;
  }> {
    const total = { added: 0, updated: 0, deleted: 0 };
    const sources: Array<{
      sourceId: string;
      type: string;
      stats: { added: number; updated: number; deleted: number };
    }> = [];

    // If NeDB is disabled, skip synchronization
    if (!isNedbEnabled()) {
      logger.debug("NeDB disabled - skipping source synchronization");
      return { total, sources };
    }

    try {
      // Get all config sources
      const configSources = await this.dbService.configSources.findAll();

      logger.info(`Syncing ${configSources.length} configuration sources`);

      // Sync each source
      for (const source of configSources) {
        // Skip syncing for now - would need to implement file reading
        // In the future, this could read from external sources if needed
        logger.debug(
          `Would sync source: ${source.type}/${source.id} from ${source.path}`
        );
      }

      return { total, sources };
    } catch (error) {
      logger.error("Failed to sync all sources:", error);
      throw error;
    }
  }
}
