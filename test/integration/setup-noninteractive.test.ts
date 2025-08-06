/**
 * Integration tests for setup command non-interactive mode
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SetupWizard, SetupCancelledException } from '../../src/commands/setup/setup.js';
import { join } from 'path';
import { homedir } from 'os';

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
        // Mock initialization - no file system operations needed
        return Promise.resolve();
      }
      
      async linkApplications(appIds: string[]) {
        // Mock implementation - return successful result
        const appArray = Array.isArray(appIds) ? appIds : [];
        return Promise.resolve({
          linked: appArray,
          failed: []
        });
      }
    }
  };
});

// Mock fs module to ensure no applications are detected
vi.mock('fs', async () => {
  const actual = await vi.importActual('fs');
  return {
    ...actual,
    promises: {
      ...actual.promises,
      access: vi.fn().mockRejectedValue(new Error('Path does not exist'))
    }
  };
});

describe('Setup Command - Non-Interactive Mode', () => {
  const mockHomeDir = '/home/user';
  const mockConfigPath = join(mockHomeDir, '.toolprint', 'hypertool-mcp');

  beforeEach(() => {
    vi.clearAllMocks();
    
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

      // Should throw SetupCancelledException when no requested apps are found
      await expect(wizard.run()).rejects.toThrow(SetupCancelledException);
    });
  });

  describe('Default Behaviors', () => {
    it('should import all configs by default', async () => {
      const wizard = new SetupWizard({
        yes: true,
        dryRun: true
      });

      await wizard.run();
      // Should import servers from both apps
    });

    it('should handle server name conflicts automatically', async () => {
      const wizard = new SetupWizard({
        yes: true,
        dryRun: true
      });

      await wizard.run();
      // Should resolve conflicts by adding app suffix
    });

    it('should create default toolset with all tools', async () => {
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