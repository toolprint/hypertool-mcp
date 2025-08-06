/**
 * Cursor IDE test fixture
 */

import { TestEnvironment } from '../base.js';
import { MCPServerConfig } from '../../../src/config-manager/types/index.js';

export class CursorFixture {
  /**
   * Create Cursor MCP configuration
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
      'code-search': {
        type: 'stdio',
        command: 'code-search-mcp',
        args: ['--project', '/Users/test/project']
      },
      'github': {
        type: 'stdio',
        command: 'github-mcp',
        env: {
          'GITHUB_TOKEN': 'test-token'
        }
      }
    };
  }

  /**
   * Install Cursor with configuration
   */
  static async install(
    env: TestEnvironment,
    options: {
      withServers?: boolean;
      customServers?: Record<string, MCPServerConfig>;
      withBackup?: boolean;
    } = {}
  ): Promise<void> {
    const {
      withServers = true,
      customServers,
      withBackup = false
    } = options;

    const servers = withServers
      ? (customServers || this.getDefaultServers())
      : {};

    const config = this.createConfig(servers);
    const configPath = '.cursor/mcp.json';

    const files: Record<string, string> = {
      [configPath]: config
    };

    // Add backup if requested
    if (withBackup) {
      files['.cursor/mcp.backup.json'] = config;
    }

    // Add hypertool config if exists
    if (Object.keys(servers).length > 0) {
      const hypertoolConfig = {
        mcpServers: servers
      };
      files['.cursor/mcp.hypertool.json'] = JSON.stringify(hypertoolConfig, null, 2);
    }

    // Add some Cursor-specific files to make it look real
    files['.cursor/settings.json'] = JSON.stringify({
      editor: {
        fontSize: 14,
        theme: 'dark'
      }
    }, null, 2);

    await env.createAppStructure('cursor', files);
  }

  /**
   * Create a corrupted configuration
   */
  static async installCorrupted(env: TestEnvironment): Promise<void> {
    await env.createAppStructure('cursor', {
      '.cursor/mcp.json': '{ "mcpServers": { incomplete'
    });
  }

  /**
   * Create configuration with hypertool already set up
   */
  static async installWithHypertool(
    env: TestEnvironment,
    originalServers: Record<string, MCPServerConfig> = {}
  ): Promise<void> {
    const configPath = '.cursor/mcp.json';
    const hypertoolPath = '.cursor/mcp.hypertool.json';

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

    await env.createAppStructure('cursor', {
      [configPath]: JSON.stringify(mainConfig, null, 2),
      [hypertoolPath]: JSON.stringify(hypertoolConfig, null, 2),
      '.cursor/mcp.backup.json': JSON.stringify({
        mcpServers: hypertoolConfig.mcpServers
      }, null, 2),
      '.cursor/settings.json': JSON.stringify({
        editor: { fontSize: 14 }
      }, null, 2)
    });
  }

  /**
   * Check if Cursor is installed in the environment
   */
  static async isInstalled(env: TestEnvironment): Promise<boolean> {
    return await env.fileExists('.cursor/mcp.json') ||
           await env.fileExists('.cursor/settings.json');
  }

  /**
   * Create empty Cursor installation (no MCP config)
   */
  static async installEmpty(env: TestEnvironment): Promise<void> {
    await env.createAppStructure('cursor', {
      '.cursor/settings.json': JSON.stringify({
        editor: {
          fontSize: 14,
          theme: 'dark'
        }
      }, null, 2),
      '.cursor/keybindings.json': '[]'
    });
  }
}
