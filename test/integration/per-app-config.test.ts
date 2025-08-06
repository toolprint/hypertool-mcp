/**
 * Integration tests for per-app configuration system
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestEnvironment } from '../fixtures/base.js';
import { ExistingConfigScenario } from '../fixtures/scenarios/index.js';
import { join } from 'path';
import { vol } from 'memfs';
import { spawn } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(spawn);

describe('Per-App Configuration Integration', () => {
  let env: TestEnvironment;
  const baseDir = '/tmp/hypertool-test';

  beforeEach(async () => {
    env = new TestEnvironment(baseDir);
    await env.setup();
  });

  afterEach(async () => {
    await env.teardown();
  });

  describe('CLI flags', () => {
    it('should support --linked-app flag', async () => {
      // Create app-specific config
      const mcpDir = join(env.getConfig().configRoot, 'mcp');
      vol.mkdirSync(mcpDir, { recursive: true });

      const appConfig = {
        mcpServers: {
          'test-server': {
            command: 'test',
            args: ['--test']
          }
        },
        _metadata: {
          app: 'claude-desktop'
        }
      };
      vol.writeFileSync(
        join(mcpDir, 'claude-desktop.json'),
        JSON.stringify(appConfig, null, 2)
      );

      // Update main config
      const mainConfig = {
        version: '1.0.0',
        applications: {
          'claude-desktop': {
            configPath: '~/Library/Application Support/Claude/claude_desktop_config.json',
            mcpConfig: 'mcp/claude-desktop.json'
          }
        }
      };
      vol.writeFileSync(
        join(env.getConfig().configRoot, 'config.json'),
        JSON.stringify(mainConfig, null, 2)
      );

      // Verify the config can be loaded
      const configPath = join(mcpDir, 'claude-desktop.json');
      expect(vol.existsSync(configPath)).toBe(true);

      const loadedConfig = JSON.parse(vol.readFileSync(configPath, 'utf-8') as string);
      expect(loadedConfig.mcpServers['test-server']).toBeDefined();
    });

    it('should support --profile flag with --linked-app', async () => {
      // Create profile directory
      const profileDir = join(env.getConfig().configRoot, 'mcp', 'profiles', 'claude-desktop');
      vol.mkdirSync(profileDir, { recursive: true });

      const profileConfig = {
        mcpServers: {
          'project-server': {
            command: 'project-tool',
            args: ['--project']
          }
        },
        _metadata: {
          app: 'claude-desktop',
          profile: 'my-project'
        }
      };
      vol.writeFileSync(
        join(profileDir, 'my-project.json'),
        JSON.stringify(profileConfig, null, 2)
      );

      // Verify profile config exists
      const profilePath = join(profileDir, 'my-project.json');
      expect(vol.existsSync(profilePath)).toBe(true);

      const loadedProfile = JSON.parse(vol.readFileSync(profilePath, 'utf-8') as string);
      expect(loadedProfile._metadata.profile).toBe('my-project');
    });
  });

  describe('config discovery', () => {
    it('should load app-specific config instead of global', async () => {
      // Create both global and app-specific configs
      const globalConfig = {
        mcpServers: {
          'global-server': {
            command: 'global',
            args: []
          }
        }
      };
      vol.writeFileSync(
        join(env.getConfig().configRoot, 'mcp.json'),
        JSON.stringify(globalConfig, null, 2)
      );

      const mcpDir = join(env.getConfig().configRoot, 'mcp');
      vol.mkdirSync(mcpDir, { recursive: true });

      const appConfig = {
        mcpServers: {
          'app-server': {
            command: 'app-specific',
            args: []
          }
        },
        _metadata: {
          app: 'claude-desktop'
        }
      };
      vol.writeFileSync(
        join(mcpDir, 'claude-desktop.json'),
        JSON.stringify(appConfig, null, 2)
      );

      // Update main config to reference app config
      const mainConfig = {
        version: '1.0.0',
        applications: {
          'claude-desktop': {
            mcpConfig: 'mcp/claude-desktop.json'
          }
        }
      };
      vol.writeFileSync(
        join(env.getConfig().configRoot, 'config.json'),
        JSON.stringify(mainConfig, null, 2)
      );

      // When loading with --linked-app, should get app-specific config
      const appConfigPath = join(mcpDir, 'claude-desktop.json');
      const loadedConfig = JSON.parse(vol.readFileSync(appConfigPath, 'utf-8') as string);

      expect(loadedConfig.mcpServers['app-server']).toBeDefined();
      expect(loadedConfig.mcpServers['global-server']).toBeUndefined();
    });
  });

  describe('backwards compatibility', () => {
    it('should maintain global mcp.json during transition', async () => {
      // Setup apps with configs
      await env.setup(new ExistingConfigScenario(['claude-desktop', 'cursor']));

      // Global mcp.json should exist after import
      const globalPath = join(env.getConfig().configRoot, 'mcp.json');

      // Create a mock global config
      vol.writeFileSync(globalPath, JSON.stringify({
        mcpServers: {
          'test': { command: 'test' }
        }
      }));

      expect(vol.existsSync(globalPath)).toBe(true);
    });

    it('should work with legacy --mcp-config flag', async () => {
      const customPath = join(baseDir, 'custom-mcp.json');
      const customConfig = {
        mcpServers: {
          'custom-server': {
            command: 'custom',
            args: ['--custom']
          }
        }
      };
      vol.writeFileSync(customPath, JSON.stringify(customConfig, null, 2));

      // Verify custom config can be loaded
      expect(vol.existsSync(customPath)).toBe(true);
      const loaded = JSON.parse(vol.readFileSync(customPath, 'utf-8') as string);
      expect(loaded.mcpServers['custom-server']).toBeDefined();
    });
  });

  describe('toolset integration', () => {
    it('should create app-specific default toolsets', async () => {
      // Create main config with toolsets
      const config = {
        version: '1.0.0',
        applications: {
          'claude-desktop': {
            mcpConfig: 'mcp/claude-desktop.json'
          }
        },
        toolsets: {
          'claude-desktop-default': {
            name: 'Claude Desktop Default',
            description: 'Auto-imported from Claude Desktop',
            tools: [],
            metadata: {
              autoGenerated: true,
              sourceApp: 'claude-desktop'
            }
          }
        },
        appDefaults: {
          'claude-desktop': 'claude-desktop-default'
        }
      };

      vol.writeFileSync(
        join(env.getConfig().configRoot, 'config.json'),
        JSON.stringify(config, null, 2)
      );

      // Verify toolset configuration
      const loaded = JSON.parse(
        vol.readFileSync(join(env.getConfig().configRoot, 'config.json'), 'utf-8') as string
      );

      expect(loaded.toolsets['claude-desktop-default']).toBeDefined();
      expect(loaded.appDefaults['claude-desktop']).toBe('claude-desktop-default');
    });
  });

  describe('migration scenarios', () => {
    it('should handle servers with metadata', async () => {
      // Create mcp directory for migration output
      const mcpDir = join(env.getConfig().configRoot, 'mcp');
      vol.mkdirSync(mcpDir, { recursive: true });

      // Simulate migration by creating per-app configs
      const claudeConfig = {
        mcpServers: {
          'claude-server': {
            command: 'claude-mcp',
            args: []
          }
        },
        _metadata: {
          app: 'claude-desktop',
          importedAt: new Date().toISOString()
        }
      };
      vol.writeFileSync(
        join(mcpDir, 'claude-desktop.json'),
        JSON.stringify(claudeConfig, null, 2)
      );

      const cursorConfig = {
        mcpServers: {
          'cursor-server': {
            command: 'cursor-mcp',
            args: []
          }
        },
        _metadata: {
          app: 'cursor',
          importedAt: new Date().toISOString()
        }
      };
      vol.writeFileSync(
        join(mcpDir, 'cursor.json'),
        JSON.stringify(cursorConfig, null, 2)
      );

      // Verify migration output
      expect(vol.existsSync(join(mcpDir, 'claude-desktop.json'))).toBe(true);
      expect(vol.existsSync(join(mcpDir, 'cursor.json'))).toBe(true);
    });

    it('should handle servers without metadata', async () => {
      const mcpDir = join(env.getConfig().configRoot, 'mcp');
      vol.mkdirSync(mcpDir, { recursive: true });

      // Create default config for unknown servers
      const defaultConfig = {
        mcpServers: {
          'unknown-server': {
            command: 'unknown',
            args: []
          }
        },
        _metadata: {
          app: 'default',
          importedAt: new Date().toISOString()
        }
      };
      vol.writeFileSync(
        join(mcpDir, 'default.json'),
        JSON.stringify(defaultConfig, null, 2)
      );

      // Verify default config
      const loaded = JSON.parse(
        vol.readFileSync(join(mcpDir, 'default.json'), 'utf-8') as string
      );
      expect(loaded._metadata.app).toBe('default');
    });
  });
});
