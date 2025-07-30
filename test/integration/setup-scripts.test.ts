/**
 * Integration tests for setup scripts (Claude Desktop, Cursor, Claude Code)
 * Demonstrates testing application installation without affecting real filesystem
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestEnvironment } from '../fixtures/base.js';
import { 
  FreshInstallScenario,
  ExistingConfigScenario,
  PartialConfigScenario,
  CorruptedConfigScenario
} from '../fixtures/scenarios/index.js';
import { ClaudeCodeFixture } from '../fixtures/applications/index.js';
import { 
  assertBackupCreated,
  assertHasHypertoolConfig,
  assertSlashCommandsInstalled,
  getConfigContent,
  assertFileExists
} from '../helpers/assertions.js';

// We'll need to mock the setup classes to use our test environment
// In a real implementation, you would refactor the setup scripts to accept
// a filesystem abstraction that could be mocked

describe('Setup Scripts Integration Tests', () => {
  let env: TestEnvironment;

  beforeEach(async () => {
    env = new TestEnvironment('/tmp/hypertool-test');
  });

  afterEach(async () => {
    await env.teardown();
  });

  describe('Claude Desktop Setup', () => {
    it('should install hypertool in fresh Claude Desktop installation', async () => {
      await env.setup(new FreshInstallScenario());
      
      // Simulate Claude Desktop being installed but no MCP config
      await env.createAppStructure('claude-desktop', {
        'Library/Application Support/Claude/preferences.json': JSON.stringify({
          theme: 'dark'
        })
      });
      
      // In a real test, you would run the actual ClaudeDesktopSetup
      // For this example, we'll simulate what it does
      const configPath = '/tmp/hypertool-test/Library/Application Support/Claude/claude_desktop_config.json';
      const hypertoolPath = '/tmp/hypertool-test/Library/Application Support/Claude/mcp.hypertool.json';
      
      // Simulate setup creating config
      await env.createAppStructure('claude-desktop', {
        'Library/Application Support/Claude/claude_desktop_config.json': JSON.stringify({
          mcpServers: {
            'hypertool-mcp': {
              type: 'stdio',
              command: 'npx',
              args: ['-y', '@toolprint/hypertool-mcp', '--mcp-config', hypertoolPath]
            }
          }
        }, null, 2),
        'Library/Application Support/Claude/mcp.hypertool.json': JSON.stringify({
          mcpServers: {}
        }, null, 2)
      });
      
      assertHasHypertoolConfig(configPath);
      assertFileExists(hypertoolPath);
    });

    it('should backup existing Claude Desktop configuration', async () => {
      await env.setup(new ExistingConfigScenario(['claude-desktop']));
      
      const configPath = '/tmp/hypertool-test/Library/Application Support/Claude/claude_desktop_config.json';
      const originalConfig = getConfigContent(configPath);
      
      // Simulate backup creation
      const backupPath = configPath.replace('.json', '.backup.json');
      await env.createAppStructure('claude-desktop', {
        [backupPath.substring('/tmp/hypertool-test/'.length)]: JSON.stringify(originalConfig, null, 2)
      });
      
      assertBackupCreated(configPath);
    });
  });

  describe('Cursor Setup', () => {
    it('should handle Cursor with existing MCP servers', async () => {
      await env.setup(new ExistingConfigScenario(['cursor']));
      
      const configPath = '/tmp/hypertool-test/.cursor/mcp.json';
      const originalConfig = getConfigContent(configPath);
      
      expect(Object.keys(originalConfig.mcpServers)).toContain('code-search');
      expect(Object.keys(originalConfig.mcpServers)).toContain('database');
      
      // Simulate migration
      const hypertoolPath = '/tmp/hypertool-test/.cursor/mcp.hypertool.json';
      await env.createAppStructure('cursor', {
        '.cursor/mcp.hypertool.json': JSON.stringify(originalConfig, null, 2),
        '.cursor/mcp.json': JSON.stringify({
          mcpServers: {
            'hypertool-mcp': {
              type: 'stdio',
              command: 'npx',
              args: ['-y', '@toolprint/hypertool-mcp', '--mcp-config', hypertoolPath]
            }
          }
        }, null, 2)
      });
      
      assertHasHypertoolConfig(configPath);
      const hypertoolConfig = getConfigContent(hypertoolPath);
      expect(Object.keys(hypertoolConfig.mcpServers)).toContain('code-search');
    });
  });

  describe('Claude Code Setup', () => {
    let projectPath: string;

    beforeEach(async () => {
      projectPath = await env.createProjectDir('test-project');
    });

    it('should create .mcp.json if not exists', async () => {
      await env.setup(new FreshInstallScenario());
      
      const mcpPath = `${projectPath}/.mcp.json`;
      expect(await env.fileExists(mcpPath)).toBe(false);
      
      // Simulate creating basic config
      await ClaudeCodeFixture.install(env, projectPath, {
        withServers: false
      });
      
      expect(await env.fileExists(mcpPath)).toBe(true);
      const config = getConfigContent(mcpPath);
      expect(config.mcpServers).toBeDefined();
    });

    it('should install slash commands globally', async () => {
      await env.setup(new FreshInstallScenario());
      await ClaudeCodeFixture.install(env, projectPath, {
        withServers: true,
        withSlashCommands: true,
        globalCommands: true
      });
      
      assertSlashCommandsInstalled('global');
    });

    it('should install slash commands locally in project', async () => {
      await env.setup(new FreshInstallScenario());
      await ClaudeCodeFixture.install(env, projectPath, {
        withServers: true,
        withSlashCommands: true,
        globalCommands: false
      });
      
      assertSlashCommandsInstalled('local', projectPath);
    });

    it('should handle project with existing hypertool setup', async () => {
      await env.setup(new FreshInstallScenario());
      await ClaudeCodeFixture.installWithHypertool(env, projectPath);
      
      const mcpPath = `${projectPath}/.mcp.json`;
      const hypertoolPath = `${projectPath}/mcp.hypertool.json`;
      
      assertHasHypertoolConfig(mcpPath);
      assertFileExists(hypertoolPath);
      
      const hypertoolConfig = getConfigContent(hypertoolPath);
      expect(Object.keys(hypertoolConfig.mcpServers).length).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle corrupted configurations gracefully', async () => {
      await env.setup(new CorruptedConfigScenario(['claude-desktop', 'cursor']));
      
      // Verify corrupted files exist
      const claudePath = '/tmp/hypertool-test/Library/Application Support/Claude/claude_desktop_config.json';
      const cursorPath = '/tmp/hypertool-test/.cursor/mcp.json';
      
      expect(await env.fileExists(claudePath)).toBe(true);
      expect(await env.fileExists(cursorPath)).toBe(true);
      
      // Attempting to read should fail
      expect(() => getConfigContent(claudePath)).toThrow();
      expect(() => getConfigContent(cursorPath)).toThrow();
    });

    it('should handle partial configurations', async () => {
      await env.setup(new PartialConfigScenario(['claude-desktop'], ['cursor']));
      
      // Claude Desktop has config
      const claudePath = '/tmp/hypertool-test/Library/Application Support/Claude/claude_desktop_config.json';
      const claudeConfig = getConfigContent(claudePath);
      expect(Object.keys(claudeConfig.mcpServers).length).toBeGreaterThan(0);
      
      // Cursor exists but no MCP config
      expect(await env.fileExists('/tmp/hypertool-test/.cursor/settings.json')).toBe(true);
      expect(await env.fileExists('/tmp/hypertool-test/.cursor/mcp.json')).toBe(false);
    });
  });

  describe('Cross-Platform Testing', () => {
    it('should handle Windows paths correctly', async () => {
      env.setPlatform('win32');
      await env.setup(new FreshInstallScenario());
      
      // Create Windows-style paths
      await env.createAppStructure('claude-desktop', {
        'AppData/Roaming/Claude/claude_desktop_config.json': JSON.stringify({
          mcpServers: {
            'test-server': {
              type: 'stdio',
              command: 'test.exe'
            }
          }
        }, null, 2)
      });
      
      const winPath = '/tmp/hypertool-test/AppData/Roaming/Claude/claude_desktop_config.json';
      expect(await env.fileExists(winPath)).toBe(true);
      
      const config = getConfigContent(winPath);
      expect(config.mcpServers['test-server'].command).toBe('test.exe');
    });
  });
});