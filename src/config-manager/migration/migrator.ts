/**
 * Migration logic for existing HyperTool installations
 */

import { promises as fs } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { ConfigurationManager } from '../index.js';
import { MCPConfig } from '../types/index.js';

export class ConfigMigrator {
  private configManager: ConfigurationManager;
  
  constructor() {
    this.configManager = new ConfigurationManager();
  }

  /**
   * Check if this is a legacy installation that needs migration
   */
  async needsMigration(): Promise<boolean> {
    // Check for legacy configurations in application-specific locations
    const legacyPaths = [
      join(homedir(), 'Library/Application Support/Claude/mcp.hypertool.json'),
      join(homedir(), '.cursor/mcp.hypertool.json'),
      join(process.cwd(), 'mcp.hypertool.json')
    ];

    for (const path of legacyPaths) {
      try {
        await fs.access(path);
        return true; // Found at least one legacy config
      } catch {
        // Continue checking
      }
    }

    // Check if new config exists
    const newConfigPath = join(homedir(), '.toolprint/hypertool-mcp/mcp.json');
    try {
      await fs.access(newConfigPath);
      return false; // Already migrated
    } catch {
      // No new config yet
    }

    return false;
  }

  /**
   * Migrate from legacy per-application configs to centralized config
   */
  async migrate(): Promise<{
    migrated: string[];
    failed: string[];
  }> {
    await this.configManager.initialize();

    const migrated: string[] = [];
    const failed: string[] = [];
    const mergedServers: MCPConfig = { mcpServers: {} };

    // Migrate Claude Desktop
    try {
      const claudeConfig = await this.migrateLegacyConfig(
        join(homedir(), 'Library/Application Support/Claude/mcp.hypertool.json'),
        'claude-desktop'
      );
      if (claudeConfig) {
        Object.assign(mergedServers.mcpServers, claudeConfig.mcpServers);
        migrated.push('claude-desktop');
      }
    } catch (error) {
      console.warn('Failed to migrate Claude Desktop config:', error);
      failed.push('claude-desktop');
    }

    // Migrate Cursor
    try {
      const cursorConfig = await this.migrateLegacyConfig(
        join(homedir(), '.cursor/mcp.hypertool.json'),
        'cursor'
      );
      if (cursorConfig) {
        Object.assign(mergedServers.mcpServers, cursorConfig.mcpServers);
        migrated.push('cursor');
      }
    } catch (error) {
      console.warn('Failed to migrate Cursor config:', error);
      failed.push('cursor');
    }

    // Migrate Claude Code (project-local)
    try {
      const claudeCodeConfig = await this.migrateLegacyConfig(
        join(process.cwd(), 'mcp.hypertool.json'),
        'claude-code'
      );
      if (claudeCodeConfig) {
        Object.assign(mergedServers.mcpServers, claudeCodeConfig.mcpServers);
        migrated.push('claude-code');
      }
    } catch (error) {
      // Project-local configs might not exist, which is fine
    }

    // Save merged configuration if we migrated anything
    if (migrated.length > 0) {
      const configPath = join(homedir(), '.toolprint/hypertool-mcp/mcp.json');
      
      // Add metadata
      mergedServers._metadata = { sources: {} };
      for (const [serverName] of Object.entries(mergedServers.mcpServers)) {
        // Try to guess which app each server came from based on the order
        const sourceApp = migrated[0]; // Simple heuristic
        mergedServers._metadata.sources![serverName] = {
          app: sourceApp,
          importedAt: new Date().toISOString()
        };
      }

      await fs.writeFile(
        configPath,
        JSON.stringify(mergedServers, null, 2),
        'utf-8'
      );
    }

    return { migrated, failed };
  }

  /**
   * Migrate a single legacy configuration file
   */
  private async migrateLegacyConfig(
    legacyPath: string,
    appId: string
  ): Promise<MCPConfig | null> {
    try {
      const content = await fs.readFile(legacyPath, 'utf-8');
      const config = JSON.parse(content);
      
      // Legacy configs already use standard format
      return {
        mcpServers: config.mcpServers || {}
      };
    } catch {
      return null;
    }
  }

  /**
   * Clean up legacy configuration files after successful migration
   */
  async cleanupLegacyConfigs(): Promise<void> {
    const legacyPaths = [
      join(homedir(), 'Library/Application Support/Claude/mcp.hypertool.json'),
      join(homedir(), '.cursor/mcp.hypertool.json'),
      join(process.cwd(), 'mcp.hypertool.json')
    ];

    for (const path of legacyPaths) {
      try {
        await fs.unlink(path);
        console.log(`Removed legacy config: ${path}`);
      } catch {
        // File doesn't exist or can't be removed, ignore
      }
    }
  }
}