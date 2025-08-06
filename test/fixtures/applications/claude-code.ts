/**
 * Claude Code test fixture
 */

import { TestEnvironment } from '../base.js';
import { MCPServerConfig } from '../../../src/config-manager/types/index.js';
import { join } from 'path';

export class ClaudeCodeFixture {
  /**
   * Create Claude Code MCP configuration
   */
  static createConfig(servers: Record<string, MCPServerConfig> = {}): string {
    return JSON.stringify({
      mcpServers: servers
    }, null, 2);
  }

  /**
   * Create default test servers for a project
   */
  static getDefaultServers(): Record<string, MCPServerConfig> {
    return {
      'project-context': {
        type: 'stdio',
        command: 'project-context-mcp',
        args: ['--root', '.']
      },
      'test-runner': {
        type: 'stdio',
        command: 'test-runner-mcp',
        env: {
          'TEST_FRAMEWORK': 'jest'
        }
      }
    };
  }

  /**
   * Install Claude Code configuration in a project
   */
  static async install(
    env: TestEnvironment,
    projectPath: string,
    options: {
      withServers?: boolean;
      customServers?: Record<string, MCPServerConfig>;
      withBackup?: boolean;
      withSlashCommands?: boolean;
      globalCommands?: boolean;
    } = {}
  ): Promise<void> {
    const {
      withServers = true,
      customServers,
      withBackup = false,
      withSlashCommands = false,
      globalCommands = false
    } = options;

    const servers = withServers
      ? (customServers || this.getDefaultServers())
      : {};

    const config = this.createConfig(servers);

    // Convert project path to be relative to base dir if needed
    const relativeProjectPath = projectPath.startsWith('/')
      ? projectPath.substring(env.getBaseDir().length + 1)
      : projectPath;

    const files: Record<string, string> = {
      [join(relativeProjectPath, '.mcp.json')]: config
    };

    // Add backup if requested
    if (withBackup) {
      files[join(relativeProjectPath, '.mcp.backup.json')] = config;
    }

    // Add hypertool config if exists
    if (Object.keys(servers).length > 0) {
      const hypertoolConfig = {
        mcpServers: servers
      };
      files[join(relativeProjectPath, 'mcp.hypertool.json')] =
        JSON.stringify(hypertoolConfig, null, 2);
    }

    // Add slash commands if requested
    if (withSlashCommands) {
      const commandsPath = globalCommands
        ? '.claude/commands/ht'
        : join(relativeProjectPath, '.claude/commands/ht');

      files[join(commandsPath, 'list-all-tools.md')] = '# List all tools\nLists all available MCP tools';
      files[join(commandsPath, 'use-toolset.md')] = '# Use toolset\nActivates a specific toolset';
    }

    // Add project files
    files[join(relativeProjectPath, 'package.json')] = JSON.stringify({
      name: 'test-project',
      version: '1.0.0',
      description: 'Test project for Claude Code'
    }, null, 2);

    await env.createAppStructure('claude-code', files);
  }

  /**
   * Create a corrupted configuration
   */
  static async installCorrupted(env: TestEnvironment, projectPath: string): Promise<void> {
    const relativeProjectPath = projectPath.startsWith('/')
      ? projectPath.substring(env.getBaseDir().length + 1)
      : projectPath;

    await env.createAppStructure('claude-code', {
      [join(relativeProjectPath, '.mcp.json')]: 'not valid json at all',
      [join(relativeProjectPath, 'package.json')]: JSON.stringify({
        name: 'corrupted-project'
      }, null, 2)
    });
  }

  /**
   * Create configuration with hypertool already set up
   */
  static async installWithHypertool(
    env: TestEnvironment,
    projectPath: string,
    originalServers: Record<string, MCPServerConfig> = {}
  ): Promise<void> {
    const relativeProjectPath = projectPath.startsWith('/')
      ? projectPath.substring(env.getBaseDir().length + 1)
      : projectPath;

    const configPath = join(relativeProjectPath, '.mcp.json');
    const hypertoolPath = join(relativeProjectPath, 'mcp.hypertool.json');

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
      mcpServers: Object.keys(originalServers).length > 0
        ? originalServers
        : this.getDefaultServers()
    };

    await env.createAppStructure('claude-code', {
      [configPath]: JSON.stringify(mainConfig, null, 2),
      [hypertoolPath]: JSON.stringify(hypertoolConfig, null, 2),
      [join(relativeProjectPath, '.mcp.backup.json')]: JSON.stringify({
        mcpServers: hypertoolConfig.mcpServers
      }, null, 2),
      [join(relativeProjectPath, 'package.json')]: JSON.stringify({
        name: 'hypertool-project',
        version: '1.0.0'
      }, null, 2),
      [join(relativeProjectPath, '.git/config')]: '[core]\nrepositoryformatversion = 0'
    });
  }

  /**
   * Check if Claude Code is configured in a project
   */
  static async isInstalled(env: TestEnvironment, projectPath: string): Promise<boolean> {
    const relativeProjectPath = projectPath.startsWith('/')
      ? projectPath.substring(env.getBaseDir().length + 1)
      : projectPath;

    return await env.fileExists(join(relativeProjectPath, '.mcp.json'));
  }

  /**
   * Create project without MCP configuration
   */
  static async createEmptyProject(env: TestEnvironment, projectPath: string): Promise<void> {
    const relativeProjectPath = projectPath.startsWith('/')
      ? projectPath.substring(env.getBaseDir().length + 1)
      : projectPath;

    await env.createAppStructure('claude-code', {
      [join(relativeProjectPath, 'package.json')]: JSON.stringify({
        name: 'empty-project',
        version: '1.0.0',
        description: 'Project without MCP configuration'
      }, null, 2),
      [join(relativeProjectPath, '.git/config')]: '[core]\nrepositoryformatversion = 0',
      [join(relativeProjectPath, 'README.md')]: '# Empty Project\nThis project has no MCP configuration.'
    });
  }

  /**
   * Check if global slash commands are installed
   */
  static async hasGlobalCommands(env: TestEnvironment): Promise<boolean> {
    return await env.fileExists('.claude/commands/ht/list-all-tools.md');
  }

  /**
   * Check if project has local slash commands
   */
  static async hasLocalCommands(env: TestEnvironment, projectPath: string): Promise<boolean> {
    const relativeProjectPath = projectPath.startsWith('/')
      ? projectPath.substring(env.getBaseDir().length + 1)
      : projectPath;

    return await env.fileExists(join(relativeProjectPath, '.claude/commands/ht/list-all-tools.md'));
  }
}
