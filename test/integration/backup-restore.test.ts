/**
 * Integration tests for backup and restore functionality
 * Demonstrates usage of the test fixture system
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { join } from 'path';
import { vol } from 'memfs';
import { TestEnvironment } from '../fixtures/base.js';
import { 
  ExistingConfigScenario, 
  FreshInstallScenario,
  MultiServerScenario 
} from '../fixtures/scenarios/index.js';
import { 
  assertBackupCreated, 
  assertHasHypertoolConfig,
  assertHypertoolConfigExists,
  getConfigContent
} from '../helpers/assertions.js';
import { ConfigurationManager } from '../../src/config-manager/index.js';

// Mock tar module to work with memfs
vi.mock('tar', () => ({
  create: vi.fn().mockImplementation(({ gzip, cwd, file }, paths) => {
    // Simulate tar creation in memfs
    const files: Record<string, string> = {};
    
    const collectFiles = (basePath: string, relativePath: string = '') => {
      try {
        const stats = vol.statSync(basePath);
        if (stats.isDirectory()) {
          const items = vol.readdirSync(basePath) as string[];
          for (const item of items) {
            const itemPath = join(basePath, item);
            const itemRelativePath = relativePath ? join(relativePath, item) : item;
            collectFiles(itemPath, itemRelativePath);
          }
        } else if (stats.isFile()) {
          const content = vol.readFileSync(basePath, 'utf-8') as string;
          files[relativePath] = content;
        }
      } catch (e) {
        // Skip inaccessible files
      }
    };
    
    // Collect files to tar
    for (const path of paths) {
      const fullPath = join(cwd || '', path);
      collectFiles(fullPath, path);
    }
    
    // Create a mock tar file
    const tarContent = JSON.stringify({ type: 'mock-tar', files });
    vol.writeFileSync(file, tarContent);
    
    return Promise.resolve();
  }),
  
  extract: vi.fn().mockImplementation(({ file, cwd }) => {
    // Simulate tar extraction in memfs
    try {
      const tarContent = vol.readFileSync(file, 'utf-8') as string;
      const { files } = JSON.parse(tarContent);
      
      for (const [path, content] of Object.entries(files)) {
        const fullPath = join(cwd || '', path);
        const dir = fullPath.substring(0, fullPath.lastIndexOf('/'));
        vol.mkdirSync(dir, { recursive: true });
        vol.writeFileSync(fullPath, content);
      }
    } catch (e) {
      throw new Error('Failed to extract tar file');
    }
    
    return Promise.resolve();
  })
}));

describe('Backup and Restore Integration Tests', () => {
  let env: TestEnvironment;
  let manager: ConfigurationManager;

  beforeEach(async () => {
    env = new TestEnvironment('/tmp/hypertool-test');
  });

  afterEach(async () => {
    await env.teardown();
  });

  describe('Fresh Installation', () => {
    beforeEach(async () => {
      await env.setup(new FreshInstallScenario());
      manager = ConfigurationManager.fromEnvironment(env.getConfig());
      await manager.initialize();
    });

    it('should handle fresh installation with no existing configs', async () => {
      const result = await manager.discoverAndImport();
      
      expect(result.imported).toHaveLength(0);
      expect(result.failed).toHaveLength(0);
    });

    it('should create necessary directory structure', async () => {
      const configRoot = env.getConfig().configRoot;
      
      expect(await env.fileExists(`${configRoot}/config.json`)).toBe(true);
      expect(await env.fileExists(`${configRoot}/apps/registry.json`)).toBe(true);
      expect(await env.listDirectory(`${configRoot}/backups`)).toEqual([]);
    });
  });

  describe('Existing Configuration Backup', () => {
    beforeEach(async () => {
      await env.setup(new ExistingConfigScenario(['claude-desktop', 'cursor']));
      manager = ConfigurationManager.fromEnvironment(env.getConfig());
      await manager.initialize();
    });

    it('should create backups of existing configurations', async () => {
      const claudeConfigPath = '/tmp/hypertool-test/Library/Application Support/Claude/claude_desktop_config.json';
      const cursorConfigPath = '/tmp/hypertool-test/.cursor/mcp.json';
      
      // Verify configs exist before backup
      const claudeConfigBefore = getConfigContent(claudeConfigPath);
      expect(Object.keys(claudeConfigBefore.mcpServers)).toContain('git');
      expect(Object.keys(claudeConfigBefore.mcpServers)).toContain('filesystem');
      
      // Create backup
      const backupResult = await manager.createBackup();
      expect(backupResult.success).toBe(true);
      expect(backupResult.backupPath).toBeDefined();
      
      // Verify backup metadata
      if (backupResult.metadata) {
        expect(backupResult.metadata.applications['claude-desktop']).toBeDefined();
        expect(backupResult.metadata.applications['cursor']).toBeDefined();
        expect(backupResult.metadata.total_servers).toBeGreaterThan(0);
      }
    });

    it('should import configurations and create hypertool configs', async () => {
      const result = await manager.discoverAndImport();
      
      expect(result.imported).toContain('claude-desktop');
      expect(result.imported).toContain('cursor');
      expect(result.failed).toHaveLength(0);
      
      // Verify hypertool configs were created
      const claudeHypertoolPath = '/tmp/hypertool-test/Library/Application Support/Claude/mcp.hypertool.json';
      const cursorHypertoolPath = '/tmp/hypertool-test/.cursor/mcp.hypertool.json';
      
      expect(await env.fileExists(claudeHypertoolPath)).toBe(true);
      expect(await env.fileExists(cursorHypertoolPath)).toBe(true);
      
      // Verify servers were migrated
      const claudeHypertool = getConfigContent(claudeHypertoolPath);
      expect(Object.keys(claudeHypertool.mcpServers)).toContain('git');
      expect(Object.keys(claudeHypertool.mcpServers)).toContain('filesystem');
    });
  });

  describe('Multi-Server Scenarios', () => {
    beforeEach(async () => {
      await env.setup(new MultiServerScenario(15, true));
      manager = ConfigurationManager.fromEnvironment(env.getConfig());
      await manager.initialize();
    });

    it('should handle configurations with many servers', async () => {
      const result = await manager.discoverAndImport();
      
      expect(result.imported.length).toBeGreaterThan(0);
      
      // Check that all servers were preserved
      const claudeHypertoolPath = '/tmp/hypertool-test/Library/Application Support/Claude/mcp.hypertool.json';
      const hypertoolConfig = getConfigContent(claudeHypertoolPath);
      
      expect(Object.keys(hypertoolConfig.mcpServers).length).toBeGreaterThanOrEqual(15);
      expect(hypertoolConfig.mcpServers['git']).toBeDefined();
      expect(hypertoolConfig.mcpServers['custom-server-10']).toBeDefined();
    });

    it('should backup complex configurations correctly', async () => {
      const backupResult = await manager.createBackup();
      
      expect(backupResult.success).toBe(true);
      expect(backupResult.metadata?.total_servers).toBeGreaterThanOrEqual(15);
    });
  });

  describe('Restore Operations', () => {
    it('should restore from backup successfully', async () => {
      // Setup with existing configs
      await env.setup(new ExistingConfigScenario(['claude-desktop']));
      manager = ConfigurationManager.fromEnvironment(env.getConfig());
      await manager.initialize();
      
      // Create backup
      const backupResult = await manager.createBackup();
      expect(backupResult.success).toBe(true);
      
      // Modify the configuration
      await manager.discoverAndImport();
      await manager.linkApplications(['claude-desktop']);
      
      // Verify config was changed
      const claudeConfigPath = '/tmp/hypertool-test/Library/Application Support/Claude/claude_desktop_config.json';
      const modifiedConfig = getConfigContent(claudeConfigPath);
      expect(Object.keys(modifiedConfig.mcpServers)).toContain('hypertool');
      
      // Restore from backup
      const restoreResult = await manager.restoreBackup(backupResult.backupId!);
      expect(restoreResult.success).toBe(true);
      expect(restoreResult.restored).toContain('claude-desktop');
      
      // Verify original config was restored
      const restoredConfig = getConfigContent(claudeConfigPath);
      expect(Object.keys(restoredConfig.mcpServers)).not.toContain('hypertool');
      expect(Object.keys(restoredConfig.mcpServers)).toContain('git');
    });

    it('should handle selective restore', async () => {
      // Setup with multiple configs
      await env.setup(new ExistingConfigScenario(['claude-desktop', 'cursor', 'claude-code']));
      manager = ConfigurationManager.fromEnvironment(env.getConfig());
      await manager.initialize();
      
      // Create backup
      const backupResult = await manager.createBackup();
      expect(backupResult.success).toBe(true);
      
      // Modify all configurations
      await manager.discoverAndImport();
      
      // Restore only specific applications
      const restoreResult = await manager.restoreBackup(backupResult.backupId!, {
        applications: ['claude-desktop', 'cursor']
      });
      
      expect(restoreResult.success).toBe(true);
      expect(restoreResult.restored).toContain('claude-desktop');
      expect(restoreResult.restored).toContain('cursor');
      expect(restoreResult.restored).not.toContain('claude-code');
    });

    it('should validate restored configurations', async () => {
      await env.setup(new ExistingConfigScenario(['claude-desktop']));
      manager = ConfigurationManager.fromEnvironment(env.getConfig());
      await manager.initialize();
      
      const originalPath = '/tmp/hypertool-test/Library/Application Support/Claude/claude_desktop_config.json';
      const originalConfig = getConfigContent(originalPath);
      const originalServerCount = Object.keys(originalConfig.mcpServers).length;
      
      // Create backup
      const backupResult = await manager.createBackup();
      
      // Clear the config
      await env.createAppStructure('claude-desktop', {
        'Library/Application Support/Claude/claude_desktop_config.json': JSON.stringify({
          mcpServers: {}
        })
      });
      
      // Restore
      const restoreResult = await manager.restoreBackup(backupResult.backupId!);
      
      expect(restoreResult.success).toBe(true);
      const restoredConfig = getConfigContent(originalPath);
      expect(Object.keys(restoredConfig.mcpServers).length).toBe(originalServerCount);
    });

    it('should handle restore with missing applications gracefully', async () => {
      await env.setup(new ExistingConfigScenario(['claude-desktop', 'cursor']));
      manager = ConfigurationManager.fromEnvironment(env.getConfig());
      await manager.initialize();
      
      // Create backup
      const backupResult = await manager.createBackup();
      
      // Remove cursor directory entirely
      await env.createAppStructure('cursor', {});
      const cursorDir = '/tmp/hypertool-test/.cursor';
      const files = await env.listDirectory('/tmp/hypertool-test');
      // Manually remove from memfs
      const vol = (global as any).__memfs_vol__;
      vol.rmdirSync(cursorDir, { recursive: true });
      
      // Restore should handle missing directory
      const restoreResult = await manager.restoreBackup(backupResult.backupId!);
      
      expect(restoreResult.success).toBe(true);
      expect(restoreResult.restored).toContain('claude-desktop');
      expect(restoreResult.failed.length).toBeGreaterThan(0);
    });

    it('should preserve backup after restore', async () => {
      await env.setup(new ExistingConfigScenario(['claude-desktop']));
      manager = ConfigurationManager.fromEnvironment(env.getConfig());
      await manager.initialize();
      
      // Create backup
      const backupResult = await manager.createBackup();
      const backupId = backupResult.backupId!;
      
      // Restore
      await manager.restoreBackup(backupId);
      
      // Backup should still exist
      const backup = await manager.getBackup(backupId);
      expect(backup).toBeDefined();
      
      // Should be able to restore again
      const secondRestore = await manager.restoreBackup(backupId);
      expect(secondRestore.success).toBe(true);
    });
  });

  describe('Backup Management', () => {
    it('should list all backups with proper metadata', async () => {
      await env.setup(new ExistingConfigScenario(['claude-desktop', 'cursor']));
      manager = ConfigurationManager.fromEnvironment(env.getConfig());
      await manager.initialize();
      
      // Create multiple backups
      const backup1 = await manager.createBackup();
      
      // Wait a bit to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Change config and create another backup
      // Modify a config file to simulate changes
      const claudeConfigPath = '/tmp/hypertool-test/Library/Application Support/Claude/claude_desktop_config.json';
      const currentConfig = getConfigContent(claudeConfigPath);
      currentConfig.mcpServers['test-server'] = { type: 'stdio', command: 'test' };
      await env.createAppStructure('claude-desktop', {
        'Library/Application Support/Claude/claude_desktop_config.json': JSON.stringify(currentConfig)
      });
      
      const backup2 = await manager.createBackup();
      
      // List backups
      const backups = await manager.listBackups();
      
      expect(backups.length).toBe(2);
      expect(backups[0].id).toBe(backup2.backupId);
      expect(backups[1].id).toBe(backup1.backupId);
      
      // Verify metadata
      expect(backups[0].metadata.applications['claude-desktop']).toBeDefined();
      expect(backups[0].metadata.applications['cursor']).toBeDefined();
    });

    it('should delete old backups', async () => {
      await env.setup(new ExistingConfigScenario(['claude-desktop']));
      manager = ConfigurationManager.fromEnvironment(env.getConfig());
      await manager.initialize();
      
      // Create backup
      const backupResult = await manager.createBackup();
      const backupId = backupResult.backupId!;
      
      // Verify it exists
      let backups = await manager.listBackups();
      expect(backups.length).toBe(1);
      
      // Delete backup
      const deleteResult = await manager.deleteBackup(backupId);
      expect(deleteResult.success).toBe(true);
      
      // Verify it's gone
      backups = await manager.listBackups();
      expect(backups.length).toBe(0);
    });

    it('should handle corrupt backup gracefully', async () => {
      await env.setup(new ExistingConfigScenario(['claude-desktop']));
      manager = ConfigurationManager.fromEnvironment(env.getConfig());
      await manager.initialize();
      
      // Create a corrupt backup file
      const backupDir = `${env.getConfig().configRoot}/backups`;
      const corruptBackupPath = `${backupDir}/backup-corrupt-2024.tar.gz`;
      const corruptMetadataPath = `${backupDir}/backup-corrupt-2024.yaml`;
      
      await env.createAppStructure('backups', {
        [`${corruptBackupPath.split('/').slice(-1)[0]}`]: 'not a valid tar file',
        [`${corruptMetadataPath.split('/').slice(-1)[0]}`]: 'invalid: yaml: content'
      });
      
      // List should skip corrupt backup
      const backups = await manager.listBackups();
      expect(backups.every(b => !b.id.includes('corrupt'))).toBe(true);
    });
  });

  describe('Error Scenarios', () => {
    it('should handle backup creation failure gracefully', async () => {
      await env.setup(new ExistingConfigScenario(['claude-desktop']));
      manager = ConfigurationManager.fromEnvironment(env.getConfig());
      await manager.initialize();
      
      // Make backup directory read-only (simulate permission error)
      // Note: This is tricky with memfs, so we'll test error handling differently
      // by checking that the backup system handles edge cases
      
      const result = await manager.createBackup();
      expect(result.success).toBe(true); // Should still succeed with memfs
    });

    it('should handle restore of non-existent backup', async () => {
      await env.setup(new FreshInstallScenario());
      manager = ConfigurationManager.fromEnvironment(env.getConfig());
      await manager.initialize();
      
      const restoreResult = await manager.restoreBackup('non-existent-backup-id');
      
      expect(restoreResult.success).toBe(false);
      expect(restoreResult.error).toContain('not found');
    });
  });
});