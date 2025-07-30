/**
 * Claude Desktop test fixture
 */

import { TestEnvironment } from '../base.js';
import { MCPServerConfig } from '../../../src/config-manager/types/index.js';

export class ClaudeDesktopFixture {
  /**
   * Create Claude Desktop MCP configuration
   */
  static createConfig(servers: Record<string, MCPServerConfig> = {}): string {
    return JSON.stringify({
      mcpServers: servers
    }, null, 2);
  }

  /**
   * Create default test servers
   */
  static getDefaultServers(): Record<string, MCPServerConfig> {
    return {
      'git': {
        type: 'stdio',
        command: 'git-mcp-server',
        args: ['--verbose']
      },
      'filesystem': {
        type: 'stdio',
        command: 'fs-mcp',
        env: {
          'FS_ROOT': '/Users/test/documents'
        }
      }
    };
  }

  /**
   * Install Claude Desktop with configuration
   */
  static async install(
    env: TestEnvironment, 
    options: {
      withServers?: boolean;
      customServers?: Record<string, MCPServerConfig>;
      withBackup?: boolean;
      platform?: 'darwin' | 'win32';
    } = {}
  ): Promise<void> {
    const { 
      withServers = true, 
      customServers,
      withBackup = false,
      platform = 'darwin'
    } = options;

    const servers = withServers 
      ? (customServers || this.getDefaultServers())
      : {};
    
    const config = this.createConfig(servers);
    
    // Platform-specific paths
    const configPaths = {
      darwin: 'Library/Application Support/Claude/claude_desktop_config.json',
      win32: 'AppData/Roaming/Claude/claude_desktop_config.json'
    };

    const configPath = configPaths[platform];
    
    const files: Record<string, string> = {
      [configPath]: config
    };

    // Add backup if requested
    if (withBackup) {
      files[`${configPath.replace('.json', '.backup.json')}`] = config;
    }

    // Add hypertool config if exists
    if (Object.keys(servers).length > 0) {
      const hypertoolConfig = {
        mcpServers: servers
      };
      files[configPath.replace('claude_desktop_config.json', 'mcp.hypertool.json')] = 
        JSON.stringify(hypertoolConfig, null, 2);
    }

    await env.createAppStructure('claude-desktop', files);
  }

  /**
   * Create a corrupted configuration
   */
  static async installCorrupted(env: TestEnvironment): Promise<void> {
    const configPath = 'Library/Application Support/Claude/claude_desktop_config.json';
    
    await env.createAppStructure('claude-desktop', {
      [configPath]: '{ invalid json }'
    });
  }

  /**
   * Create configuration with hypertool already set up
   */
  static async installWithHypertool(
    env: TestEnvironment,
    originalServers: Record<string, MCPServerConfig> = {}
  ): Promise<void> {
    const configPath = 'Library/Application Support/Claude/claude_desktop_config.json';
    const hypertoolPath = 'Library/Application Support/Claude/mcp.hypertool.json';
    
    // Main config only has hypertool
    const mainConfig = {
      mcpServers: {
        'hypertool-mcp': {
          type: 'stdio',
          command: 'npx',
          args: ['-y', '@toolprint/hypertool-mcp', '--mcp-config', hypertoolPath]
        }
      }
    };

    // Hypertool config has the original servers
    const hypertoolConfig = {
      mcpServers: originalServers.length > 0 ? originalServers : this.getDefaultServers()
    };

    await env.createAppStructure('claude-desktop', {
      [configPath]: JSON.stringify(mainConfig, null, 2),
      [hypertoolPath]: JSON.stringify(hypertoolConfig, null, 2),
      [configPath.replace('.json', '.backup.json')]: JSON.stringify({
        mcpServers: hypertoolConfig.mcpServers
      }, null, 2)
    });
  }

  /**
   * Check if Claude Desktop is installed in the environment
   */
  static async isInstalled(env: TestEnvironment): Promise<boolean> {
    const paths = [
      'Library/Application Support/Claude/claude_desktop_config.json',
      'AppData/Roaming/Claude/claude_desktop_config.json'
    ];

    for (const path of paths) {
      if (await env.fileExists(path)) {
        return true;
      }
    }
    
    return false;
  }
}