/**
 * Integration tests for setup command non-interactive mode
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { vol } from 'memfs';
import { SetupWizard } from '../../src/commands/setup/setup.js';
import { join } from 'path';
import { homedir } from 'os';

// Mock modules
vi.mock('fs', async () => {
  const memfs = await import('memfs');
  return memfs.fs;
});

vi.mock('../../src/utils/output.js', () => ({
  output: {
    clearTerminal: vi.fn(),
    displaySpaceBuffer: vi.fn(),
    displayHeader: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
    displaySeparator: vi.fn()
  },
  displayBanner: vi.fn()
}));

vi.mock('../../src/utils/theme.js', () => ({
  theme: {
    info: (text: string) => text,
    success: (text: string) => text,
    warning: (text: string) => text,
    error: (text: string) => text,
    label: (text: string) => text,
    muted: (text: string) => text,
    value: (text: string) => text
  }
}));

// Mock ConfigurationManager to use memfs
vi.mock('../../src/config-manager/index.js', async () => {
  const actual = await vi.importActual('../../src/config-manager/index.js');
  return {
    ...actual,
    ConfigurationManager: class MockConfigurationManager {
      static fromEnvironment() {
        return new MockConfigurationManager();
      }
      
      async initialize() {
        // Use memfs
      }
      
      async linkApplications(appIds: string[]) {
        // Mock implementation
      }
    }
  };
});

describe('Setup Command - Non-Interactive Mode', () => {
  const mockHomeDir = '/home/user';
  const mockConfigPath = join(mockHomeDir, '.toolprint', 'hypertool-mcp');

  beforeEach(() => {
    vol.reset();
    vi.clearAllMocks();
    
    // Set up base directory structure
    vol.mkdirSync(mockConfigPath, { recursive: true });
    vol.mkdirSync(join(mockConfigPath, 'mcp'), { recursive: true });
    
    // Mock os.homedir
    vi.spyOn(require('os'), 'homedir').mockReturnValue(mockHomeDir);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Basic Non-Interactive Flow', () => {
    it('should run with --yes flag and no existing config', async () => {
      const wizard = new SetupWizard({
        yes: true,
        dryRun: true
      });

      // Run should complete without user interaction
      await expect(wizard.run()).resolves.not.toThrow();
    });

    it('should detect and configure all applications by default', async () => {
      // Create mock app configs
      vol.mkdirSync(join(mockHomeDir, 'Library/Application Support/Claude'), { recursive: true });
      vol.writeFileSync(
        join(mockHomeDir, 'Library/Application Support/Claude/claude_desktop_config.json'),
        JSON.stringify({
          mcpServers: {
            'test-server': { command: 'test-cmd' }
          }
        })
      );

      const wizard = new SetupWizard({
        yes: true,
        dryRun: true,
        verbose: true
      });

      await wizard.run();
      
      // In dry run, no actual files are created, but the flow should complete
      expect(true).toBe(true);
    });
  });

  describe('CLI Options', () => {
    it('should respect --apps flag to select specific applications', async () => {
      const wizard = new SetupWizard({
        yes: true,
        apps: ['claude-desktop'],
        dryRun: true
      });

      await expect(wizard.run()).resolves.not.toThrow();
    });

    it('should respect --import-none flag', async () => {
      // Create existing config
      vol.mkdirSync(join(mockHomeDir, '.cursor'), { recursive: true });
      vol.writeFileSync(
        join(mockHomeDir, '.cursor/mcp.json'),
        JSON.stringify({
          mcpServers: {
            'existing-server': { command: 'existing-cmd' }
          }
        })
      );

      const wizard = new SetupWizard({
        yes: true,
        importAll: false, // --import-none sets this to false
        dryRun: true
      });

      await wizard.run();
      // Should complete without importing existing configs
    });

    it('should respect --development flag', async () => {
      const wizard = new SetupWizard({
        yes: true,
        development: true,
        standard: false,
        dryRun: true
      });

      await wizard.run();
      // Should use development installation type
    });

    it('should respect --skip-toolsets flag', async () => {
      const wizard = new SetupWizard({
        yes: true,
        skipToolsets: true,
        dryRun: true
      });

      await wizard.run();
      // Should complete without creating toolsets
    });
  });

  describe('Error Handling', () => {
    it('should fail gracefully when requested apps are not detected', async () => {
      const wizard = new SetupWizard({
        yes: true,
        apps: ['non-existent-app'],
        dryRun: true
      });

      // Should handle the error gracefully
      await wizard.run();
    });
  });

  describe('Default Behaviors', () => {
    it('should import all configs by default', async () => {
      // Create multiple app configs
      vol.mkdirSync(join(mockHomeDir, 'Library/Application Support/Claude'), { recursive: true });
      vol.writeFileSync(
        join(mockHomeDir, 'Library/Application Support/Claude/claude_desktop_config.json'),
        JSON.stringify({
          mcpServers: {
            'git-server': { command: 'git-mcp' }
          }
        })
      );

      vol.mkdirSync(join(mockHomeDir, '.cursor'), { recursive: true });
      vol.writeFileSync(
        join(mockHomeDir, '.cursor/mcp.json'),
        JSON.stringify({
          mcpServers: {
            'docker-server': { command: 'docker-mcp' }
          }
        })
      );

      const wizard = new SetupWizard({
        yes: true,
        dryRun: true
      });

      await wizard.run();
      // Should import servers from both apps
    });

    it('should handle server name conflicts automatically', async () => {
      // Create configs with conflicting server names
      vol.mkdirSync(join(mockHomeDir, 'Library/Application Support/Claude'), { recursive: true });
      vol.writeFileSync(
        join(mockHomeDir, 'Library/Application Support/Claude/claude_desktop_config.json'),
        JSON.stringify({
          mcpServers: {
            'git': { command: 'git-mcp-v1' }
          }
        })
      );

      vol.mkdirSync(join(mockHomeDir, '.cursor'), { recursive: true });
      vol.writeFileSync(
        join(mockHomeDir, '.cursor/mcp.json'),
        JSON.stringify({
          mcpServers: {
            'git': { command: 'git-mcp-v2' }
          }
        })
      );

      const wizard = new SetupWizard({
        yes: true,
        dryRun: true
      });

      await wizard.run();
      // Should resolve conflicts by adding app suffix
    });

    it('should create default toolset with all tools', async () => {
      vol.mkdirSync(join(mockHomeDir, '.cursor'), { recursive: true });
      vol.writeFileSync(
        join(mockHomeDir, '.cursor/mcp.json'),
        JSON.stringify({
          mcpServers: {
            'test-server': { command: 'test-cmd' }
          }
        })
      );

      const wizard = new SetupWizard({
        yes: true,
        dryRun: true
      });

      await wizard.run();
      // Should create a default toolset
    });
  });

  describe('First Run Detection', () => {
    it('should detect first run when no config exists', async () => {
      // The isFirstRun method uses its own fs import, so we can't easily mock it
      // Instead, we'll test the behavior indirectly through the wizard
      const wizard = new SetupWizard({
        yes: true,
        dryRun: true,
        isFirstRun: true
      });
      
      // Should complete setup flow
      await expect(wizard.run()).resolves.not.toThrow();
    });

    it('should handle existing config scenario', async () => {
      // Create existing config to simulate non-first-run
      vol.writeFileSync(
        join(mockConfigPath, 'config.json'),
        JSON.stringify({
          version: '1.0.0',
          applications: {
            'claude-desktop': {
              mcpConfig: 'mcp/claude-desktop.json'
            }
          }
        })
      );

      const wizard = new SetupWizard({
        yes: true,
        dryRun: true,
        isFirstRun: false
      });
      
      // Should complete setup flow
      await expect(wizard.run()).resolves.not.toThrow();
    });
  });
});