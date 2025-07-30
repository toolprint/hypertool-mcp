/**
 * Backup and restore manager for MCP configurations
 */

import { promises as fs } from 'fs';
import { vol } from 'memfs';
import { isTestMode } from '../../config/environment.js';
import { join, basename } from 'path';
import { homedir, platform, arch } from 'os';
import * as tar from 'tar';
import * as yaml from 'yaml';
import { BackupMetadata, ApplicationDefinition, BackupResult, RestoreResult, DeleteResult, BackupListItem } from '../types/index.js';
import { AppRegistry } from '../apps/registry.js';
import { TransformerRegistry } from '../transformers/base.js';

export class BackupManager {
  private basePath: string;
  private backupDir: string;
  private registry: AppRegistry;
  private fs: typeof fs;

  constructor(basePath: string = join(homedir(), '.toolprint/hypertool-mcp')) {
    this.basePath = basePath;
    this.backupDir = join(basePath, 'backups');
    this.registry = new AppRegistry(basePath);
    
    // Use memfs in test mode, real fs in production
    this.fs = isTestMode() ? vol.promises as any as typeof fs : fs;
  }

  /**
   * Get current platform (for testing support)
   */
  private getCurrentPlatform(): NodeJS.Platform {
    // In test mode, check for simulated platform
    if (isTestMode()) {
      const testPlatform = (global as any).__TEST_PLATFORM__;
      if (testPlatform) {
        return testPlatform;
      }
    }
    return platform() as NodeJS.Platform;
  }

  /**
   * Get current working directory (for testing support)
   */
  private getCurrentWorkingDirectory(): string {
    // In test mode, use test base path as working directory to avoid contamination
    if (isTestMode()) {
      return this.basePath;
    }
    return process.cwd();
  }

  /**
   * Create a comprehensive backup of all MCP configurations
   */
  async createBackup(): Promise<BackupResult> {
    try {
      // Ensure backup directory exists
      await this.fs.mkdir(this.backupDir, { recursive: true });

      // Generate backup filename with ISO timestamp
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupName = `app_backup_${timestamp}`;
      const backupPath = join(this.backupDir, `${backupName}.tgz`);
      
      // Create temporary directory for backup contents
      const tempDir = join(this.backupDir, 'temp', backupName);
      await this.fs.mkdir(join(tempDir, 'config'), { recursive: true });

      // Get all enabled applications
      const apps = await this.registry.getEnabledApplications();
      const metadata: BackupMetadata = {
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        hypertool_version: await this.getHypertoolVersion(),
        applications: {},
        total_servers: 0,
        system_info: {
          platform: this.getCurrentPlatform(),
          arch: arch(),
          node_version: process.version
        }
      };

      // Backup each application's configuration
      for (const [appId, app] of Object.entries(apps)) {
        try {
          const backupResult = await this.backupApplication(appId, app, tempDir);
          if (backupResult) {
            metadata.applications[appId] = backupResult;
            metadata.total_servers += backupResult.servers_count;
          }
        } catch (error) {
          console.warn(`Failed to backup ${appId}:`, error);
        }
      }

      // Write metadata
      const metadataPath = join(tempDir, 'metadata.yaml');
      await this.fs.writeFile(metadataPath, yaml.stringify(metadata), 'utf-8');

      // Create tar.gz archive
      await tar.create(
        {
          gzip: true,
          file: backupPath,
          cwd: join(this.backupDir, 'temp')
        },
        [backupName]
      );

      // Clean up temp directory
      await this.fs.rm(tempDir, { recursive: true, force: true });
      await this.fs.rm(join(this.backupDir, 'temp'), { recursive: true, force: true }).catch(() => {});

      // Also write metadata file alongside the tar.gz for easier listing
      const metadataFilePath = backupPath.replace('.tgz', '.yaml');
      await this.fs.writeFile(metadataFilePath, yaml.stringify(metadata), 'utf-8');

      return {
        success: true,
        backupId: backupName,
        backupPath,
        metadata
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred during backup'
      };
    }
  }

  /**
   * Backup a single application's configuration
   */
  private async backupApplication(
    appId: string,
    app: ApplicationDefinition,
    tempDir: string
  ): Promise<{ source_path: string; format: string; servers_count: number } | null> {
    // Get platform-specific config
    const platformConfig = this.registry.getPlatformConfig(app);
    if (!platformConfig) {
      return null;
    }

    // Resolve the configuration path
    const configPath = this.registry.resolvePath(platformConfig.configPath);
    
    // Check if it's a project-local app (skip if not in a project)
    if (app.detection.type === 'project-local') {
      const projectConfigPath = join(this.getCurrentWorkingDirectory(), basename(configPath));
      try {
        await this.fs.access(projectConfigPath);
        // Use the project-local path instead
        const content = await this.fs.readFile(projectConfigPath, 'utf-8');
        const appDir = join(tempDir, 'config', appId);
        await this.fs.mkdir(appDir, { recursive: true });
        await this.fs.writeFile(
          join(appDir, basename(projectConfigPath)),
          content,
          'utf-8'
        );
        
        // Validate JSON and count servers
        let serverCount = 0;
        try {
          const config = JSON.parse(content);
          const transformer = TransformerRegistry.getTransformer(platformConfig.format);
          const standardConfig = transformer.toStandard(config);
          serverCount = Object.keys(standardConfig.mcpServers || {}).length;
        } catch {
          // Skip corrupted project-local configurations
          return null;
        }
        
        return {
          source_path: projectConfigPath,
          format: platformConfig.format,
          servers_count: serverCount
        };
      } catch {
        // Skip if not in a project with config
        return null;
      }
    }

    // Check if configuration file exists
    try {
      await this.fs.access(configPath);
    } catch {
      return null;
    }

    // Read and backup the configuration
    const content = await this.fs.readFile(configPath, 'utf-8');
    
    // Validate JSON before proceeding
    let serverCount = 0;
    try {
      const config = JSON.parse(content);
      const transformer = TransformerRegistry.getTransformer(platformConfig.format);
      const standardConfig = transformer.toStandard(config);
      serverCount = Object.keys(standardConfig.mcpServers || {}).length;
    } catch {
      // Skip corrupted configurations
      return null;
    }
    
    const appDir = join(tempDir, 'config', appId);
    await this.fs.mkdir(appDir, { recursive: true });
    
    // Save with original filename
    const filename = basename(configPath);
    await this.fs.writeFile(join(appDir, filename), content, 'utf-8');

    return {
      source_path: configPath,
      format: platformConfig.format,
      servers_count: serverCount
    };
  }

  /**
   * List available backups
   */
  async listBackups(): Promise<BackupListItem[]> {
    try {
      const files = await this.fs.readdir(this.backupDir);
      const backups: BackupListItem[] = [];

      for (const file of files) {
        if (!file.endsWith('.tgz')) continue;

        const backupPath = join(this.backupDir, file);
        try {
          // First try to read metadata from .yaml file (faster)
          const metadataPath = backupPath.replace('.tgz', '.yaml');
          let metadata: BackupMetadata;
          
          try {
            const yamlContent = await this.fs.readFile(metadataPath, 'utf-8');
            metadata = yaml.parse(yamlContent);
          } catch {
            // Fall back to extracting from tar file
            metadata = await this.extractMetadata(backupPath);
          }

          const backupId = file.replace('.tgz', '');
          backups.push({ 
            id: backupId,
            timestamp: metadata.timestamp,
            metadata,
            path: backupPath
          });
        } catch {
          // Skip invalid backups
        }
      }

      // Sort by timestamp (newest first)
      backups.sort((a, b) => 
        new Date(b.timestamp).getTime() - 
        new Date(a.timestamp).getTime()
      );

      return backups;
    } catch {
      return [];
    }
  }

  /**
   * Get a specific backup by ID
   */
  async getBackup(backupId: string): Promise<BackupListItem | null> {
    try {
      const backupPath = join(this.backupDir, `${backupId}.tgz`);
      
      // Check if backup file exists
      try {
        await this.fs.access(backupPath);
      } catch {
        return null;
      }

      // Try to read metadata from .yaml file first
      const metadataPath = backupPath.replace('.tgz', '.yaml');
      let metadata: BackupMetadata;
      
      try {
        const yamlContent = await this.fs.readFile(metadataPath, 'utf-8');
        metadata = yaml.parse(yamlContent);
      } catch {
        // Fall back to extracting from tar file
        metadata = await this.extractMetadata(backupPath);
      }

      return {
        id: backupId,
        timestamp: metadata.timestamp,
        metadata,
        path: backupPath
      };
    } catch {
      return null;
    }
  }

  /**
   * Extract metadata from a backup without full extraction
   */
  private async extractMetadata(backupPath: string): Promise<BackupMetadata> {
    return new Promise((resolve, reject) => {
      let metadata: BackupMetadata | null = null;

      tar.list({
        file: backupPath,
        onentry: (entry) => {
          if (entry.path.endsWith('metadata.yaml')) {
            let content = '';
            entry.on('data', (chunk) => {
              content += chunk.toString();
            });
            entry.on('end', () => {
              try {
                metadata = yaml.parse(content);
              } catch (error) {
                reject(error);
              }
            });
          } else {
            entry.resume(); // Skip other files
          }
        }
      }).then(() => {
        if (metadata) {
          resolve(metadata);
        } else {
          reject(new Error('No metadata found in backup'));
        }
      }).catch(reject);
    });
  }

  /**
   * Restore configurations from a backup
   */
  async restoreBackup(backupId: string, options?: { applications?: string[] }): Promise<RestoreResult> {
    try {
      const backupPath = join(this.backupDir, `${backupId}.tgz`);
      
      // Check if backup exists
      try {
        await this.fs.access(backupPath);
      } catch {
        return {
          success: false,
          restored: [],
          failed: [],
          error: `Backup not found: ${backupId}`
        };
      }

      // Create temp directory for extraction
      const tempDir = join(this.backupDir, 'temp', 'restore');
      await this.fs.mkdir(tempDir, { recursive: true });

      const restored: string[] = [];
      const failed: string[] = [];

      try {
        // Extract backup
        await tar.extract({
          file: backupPath,
          cwd: tempDir
        });

        // Find the extracted directory
        const dirs = await this.fs.readdir(tempDir);
        if (dirs.length !== 1) {
          throw new Error('Invalid backup structure');
        }

        const extractedDir = join(tempDir, dirs[0]);
        const metadataPath = join(extractedDir, 'metadata.yaml');
        const configDir = join(extractedDir, 'config');

        // Read metadata
        const metadataContent = await this.fs.readFile(metadataPath, 'utf-8');
        const metadata: BackupMetadata = yaml.parse(metadataContent);

        // Filter applications if specified
        const appsToRestore = options?.applications 
          ? Object.entries(metadata.applications).filter(([appId]) => options.applications!.includes(appId))
          : Object.entries(metadata.applications);

        // Restore each application
        for (const [appId, appBackup] of appsToRestore) {
          try {
            await this.restoreApplication(appId, appBackup, configDir);
            restored.push(appId);
          } catch (error) {
            console.warn(`Failed to restore ${appId}:`, error);
            failed.push(appId);
          }
        }

        return {
          success: true,
          restored,
          failed
        };
      } finally {
        // Clean up temp directory
        await this.fs.rm(tempDir, { recursive: true, force: true });
      }
    } catch (error) {
      return {
        success: false,
        restored: [],
        failed: [],
        error: error instanceof Error ? error.message : 'Unknown error occurred during restore'
      };
    }
  }

  /**
   * Delete a backup by ID
   */
  async deleteBackup(backupId: string): Promise<DeleteResult> {
    try {
      const backupPath = join(this.backupDir, `${backupId}.tgz`);
      const metadataPath = backupPath.replace('.tgz', '.yaml');
      
      // Check if backup exists
      try {
        await this.fs.access(backupPath);
      } catch {
        return {
          success: false,
          error: `Backup not found: ${backupId}`
        };
      }

      // Delete backup file
      await this.fs.unlink(backupPath);
      
      // Delete metadata file if it exists
      try {
        await this.fs.unlink(metadataPath);
      } catch {
        // Ignore if metadata file doesn't exist
      }

      return {
        success: true
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred during deletion'
      };
    }
  }

  /**
   * Restore a single application's configuration
   */
  private async restoreApplication(
    appId: string,
    appBackup: BackupMetadata['applications'][string],
    configDir: string
  ): Promise<void> {
    const app = await this.registry.getApplication(appId);
    if (!app) {
      throw new Error(`Application ${appId} not found in registry`);
    }

    // Check if the application is actually installed before restoring
    const isInstalled = await this.registry.isApplicationInstalled(app);
    if (!isInstalled) {
      throw new Error(`Application ${appId} is not installed`);
    }

    const appConfigDir = join(configDir, appId);
    const files = await this.fs.readdir(appConfigDir);
    
    if (files.length === 0) {
      return;
    }

    // Read the backed up configuration
    const backupFile = join(appConfigDir, files[0]);
    const content = await this.fs.readFile(backupFile, 'utf-8');

    // Write to the original location
    const targetPath = appBackup.source_path;
    
    // Ensure directory exists
    const targetDir = join(targetPath, '..');
    await this.fs.mkdir(targetDir, { recursive: true });

    // Write the configuration
    await this.fs.writeFile(targetPath, content, 'utf-8');
  }

  /**
   * Get HyperTool version from package.json
   */
  private async getHypertoolVersion(): Promise<string> {
    try {
      // Try to find package.json
      const possiblePaths = [
        join(this.basePath, '../../package.json'),
        join(this.getCurrentWorkingDirectory(), 'package.json'),
        join(__dirname, '../../../package.json')
      ];

      for (const path of possiblePaths) {
        try {
          const content = await this.fs.readFile(path, 'utf-8');
          const pkg = JSON.parse(content);
          if (pkg.name === '@toolprint/hypertool-mcp') {
            return pkg.version || '0.0.0';
          }
        } catch {
          // Try next path
        }
      }
    } catch {
      // Ignore errors
    }
    
    return '0.0.0';
  }
}