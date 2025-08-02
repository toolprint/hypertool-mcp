/**
 * Backup and restore manager for MCP configurations
 */

import { promises as fs } from "fs";
import { vol } from "memfs";
import { isTestMode } from "../../config/environment.js";
import { join, basename } from "path";
import { homedir, platform, arch } from "os";
import * as tar from "tar";
import * as yaml from "yaml";
import {
  BackupMetadata,
  ApplicationDefinition,
  BackupResult,
  RestoreResult,
  DeleteResult,
  BackupListItem,
} from "../types/index.js";
import { AppRegistry } from "../apps/registry.js";
import { TransformerRegistry } from "../transformers/base.js";
import { getDatabaseService } from "../../db/nedbService.js";
import {
  ServerConfigRecord,
  ServerConfigGroup,
  IConfigSource,
} from "../../db/interfaces.js";
import { isNedbEnabled } from "../../config/environment.js";

export class BackupManager {
  private basePath: string;
  private backupDir: string;
  private registry: AppRegistry;
  private fs: typeof fs;

  constructor(basePath: string = join(homedir(), ".toolprint/hypertool-mcp")) {
    this.basePath = basePath;
    this.backupDir = join(basePath, "backups");
    this.registry = new AppRegistry(basePath);

    // Use memfs in test mode, real fs in production
    this.fs = isTestMode() ? (vol.promises as any as typeof fs) : fs;
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
   * Copy directory recursively (for test mode)
   */
  private async copyDirectory(src: string, dest: string): Promise<void> {
    await this.fs.mkdir(dest, { recursive: true });
    const entries = await this.fs.readdir(src, { withFileTypes: true });
    
    for (const entry of entries) {
      const srcPath = join(src, entry.name);
      const destPath = join(dest, entry.name);
      
      if (entry.isDirectory()) {
        await this.copyDirectory(srcPath, destPath);
      } else {
        const content = await this.fs.readFile(srcPath);
        await this.fs.writeFile(destPath, content);
      }
    }
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
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const backupName = `app_backup_${timestamp}`;
      const backupPath = join(this.backupDir, `${backupName}.tgz`);

      // Create temporary directory for backup contents
      const tempDir = join(this.backupDir, "temp", backupName);
      await this.fs.mkdir(join(tempDir, "config"), { recursive: true });
      await this.fs.mkdir(join(tempDir, "database"), { recursive: true });

      // Get all enabled applications
      const apps = await this.registry.getEnabledApplications();
      const metadata: BackupMetadata = {
        version: "1.0.0",
        timestamp: new Date().toISOString(),
        hypertool_version: await this.getHypertoolVersion(),
        applications: {},
        total_servers: 0,
        system_info: {
          platform: this.getCurrentPlatform(),
          arch: arch(),
          node_version: process.version,
        },
      };

      // Backup each application's configuration
      for (const [appId, app] of Object.entries(apps)) {
        try {
          const backupResult = await this.backupApplication(
            appId,
            app,
            tempDir
          );
          if (backupResult) {
            metadata.applications[appId] = backupResult;
            metadata.total_servers += backupResult.servers_count;
          }
        } catch (error) {
          console.warn(`Failed to backup ${appId}:`, error);
        }
      }

      // Export database contents if NeDB is enabled
      if (isNedbEnabled()) {
        const dbExportResult = await this.exportDatabase(tempDir);
        if (dbExportResult) {
          metadata.database = dbExportResult;
        }
      }

      // Write metadata
      const metadataPath = join(tempDir, "metadata.yaml");
      await this.fs.writeFile(metadataPath, yaml.stringify(metadata), "utf-8");

      // Create tar.gz archive
      if (isTestMode()) {
        // In test mode, create a directory at the backup path
        // We keep the .tgz extension for consistency
        await this.fs.mkdir(backupPath, { recursive: true });
        // Copy the entire temp directory structure to the backup location
        await this.copyDirectory(tempDir, backupPath);
      } else {
        await tar.create(
          {
            gzip: true,
            file: backupPath,
            cwd: join(this.backupDir, "temp"),
          },
          [backupName]
        );
      }

      // Clean up temp directory
      await this.fs.rm(tempDir, { recursive: true, force: true });
      await this.fs
        .rm(join(this.backupDir, "temp"), { recursive: true, force: true })
        .catch(() => {});

      // Also write metadata file alongside the tar.gz for easier listing
      const metadataFilePath = backupPath.replace(".tgz", ".yaml");
      await this.fs.writeFile(
        metadataFilePath,
        yaml.stringify(metadata),
        "utf-8"
      );

      return {
        success: true,
        backupId: backupName,
        backupPath,
        metadata,
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unknown error occurred during backup",
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
  ): Promise<{
    source_path: string;
    format: string;
    servers_count: number;
  } | null> {
    // Get platform-specific config
    const platformConfig = this.registry.getPlatformConfig(app);
    if (!platformConfig) {
      return null;
    }

    // Resolve the configuration path
    const configPath = this.registry.resolvePath(platformConfig.configPath);

    // Check if it's a project-local app (skip if not in a project)
    if (app.detection.type === "project-local") {
      const projectConfigPath = join(
        this.getCurrentWorkingDirectory(),
        basename(configPath)
      );
      try {
        await this.fs.access(projectConfigPath);
        // Use the project-local path instead
        const content = await this.fs.readFile(projectConfigPath, "utf-8");
        const appDir = join(tempDir, "config", appId);
        await this.fs.mkdir(appDir, { recursive: true });
        await this.fs.writeFile(
          join(appDir, basename(projectConfigPath)),
          content,
          "utf-8"
        );

        // Validate JSON and count servers
        let serverCount = 0;
        try {
          const config = JSON.parse(content);
          const transformer = TransformerRegistry.getTransformer(
            platformConfig.format
          );
          const standardConfig = transformer.toStandard(config);
          serverCount = Object.keys(standardConfig.mcpServers || {}).length;
        } catch {
          // Skip corrupted project-local configurations
          return null;
        }

        return {
          source_path: projectConfigPath,
          format: platformConfig.format,
          servers_count: serverCount,
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
    const content = await this.fs.readFile(configPath, "utf-8");

    // Validate JSON before proceeding
    let serverCount = 0;
    try {
      const config = JSON.parse(content);
      const transformer = TransformerRegistry.getTransformer(
        platformConfig.format
      );
      const standardConfig = transformer.toStandard(config);
      serverCount = Object.keys(standardConfig.mcpServers || {}).length;
    } catch {
      // Skip corrupted configurations
      return null;
    }

    const appDir = join(tempDir, "config", appId);
    await this.fs.mkdir(appDir, { recursive: true });

    // Save with original filename
    const filename = basename(configPath);
    await this.fs.writeFile(join(appDir, filename), content, "utf-8");

    return {
      source_path: configPath,
      format: platformConfig.format,
      servers_count: serverCount,
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
        // In test mode, look for directories with .tgz extension
        // In production mode, look for .tgz files
        if (!file.endsWith(".tgz")) continue;

        const backupPath = join(this.backupDir, file);
        try {
          // Check if backup exists (file or directory)
          await this.fs.access(backupPath);

          let metadata: BackupMetadata;

          if (isTestMode()) {
            // In test mode, read metadata from directory
            const metadataPath = join(backupPath, "metadata.yaml");
            try {
              const yamlContent = await this.fs.readFile(metadataPath, "utf-8");
              metadata = yaml.parse(yamlContent);
            } catch {
              // Skip if metadata not found
              continue;
            }
          } else {
            // In production mode, try .yaml file first, then extract from tar
            const metadataPath = backupPath.replace(".tgz", ".yaml");
            try {
              const yamlContent = await this.fs.readFile(metadataPath, "utf-8");
              metadata = yaml.parse(yamlContent);
            } catch {
              // Fall back to extracting from tar file
              metadata = await this.extractMetadata(backupPath);
            }
          }

          const backupId = file.replace(".tgz", "");
          backups.push({
            id: backupId,
            timestamp: metadata.timestamp,
            metadata,
            path: backupPath,
          });
        } catch {
          // Skip invalid backups
        }
      }

      // Sort by timestamp (newest first)
      backups.sort(
        (a, b) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
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

      // Check if backup exists (file or directory)
      try {
        await this.fs.access(backupPath);
      } catch {
        return null;
      }

      let metadata: BackupMetadata;

      if (isTestMode()) {
        // In test mode, read metadata from directory
        const metadataPath = join(backupPath, "metadata.yaml");
        try {
          const yamlContent = await this.fs.readFile(metadataPath, "utf-8");
          metadata = yaml.parse(yamlContent);
        } catch {
          // No metadata found
          return null;
        }
      } else {
        // In production mode, try .yaml file first, then extract from tar
        const metadataPath = backupPath.replace(".tgz", ".yaml");
        try {
          const yamlContent = await this.fs.readFile(metadataPath, "utf-8");
          metadata = yaml.parse(yamlContent);
        } catch {
          // Fall back to extracting from tar file
          metadata = await this.extractMetadata(backupPath);
        }
      }

      return {
        id: backupId,
        timestamp: metadata.timestamp,
        metadata,
        path: backupPath,
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

      tar
        .list({
          file: backupPath,
          onentry: (entry) => {
            if (entry.path.endsWith("metadata.yaml")) {
              let content = "";
              entry.on("data", (chunk) => {
                content += chunk.toString();
              });
              entry.on("end", () => {
                try {
                  metadata = yaml.parse(content);
                } catch (error) {
                  reject(error);
                }
              });
            } else {
              entry.resume(); // Skip other files
            }
          },
        })
        .then(() => {
          if (metadata) {
            resolve(metadata);
          } else {
            reject(new Error("No metadata found in backup"));
          }
        })
        .catch(reject);
    });
  }

  /**
   * Restore configurations from a backup
   */
  async restoreBackup(
    backupId: string,
    options?: { applications?: string[] }
  ): Promise<RestoreResult> {
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
          error: `Backup not found: ${backupId}`,
        };
      }

      // Create temp directory for extraction
      const tempDir = join(this.backupDir, "temp", "restore");
      await this.fs.mkdir(tempDir, { recursive: true });

      const restored: string[] = [];
      const failed: string[] = [];

      try {
        let extractedDir: string;
        let metadataPath: string;
        let configDir: string;

        if (isTestMode()) {
          // In test mode, the backup is already a directory
          extractedDir = backupPath;
          metadataPath = join(extractedDir, "metadata.yaml");
          configDir = join(extractedDir, "config");
        } else {
          // Extract backup
          await tar.extract({
            file: backupPath,
            cwd: tempDir,
          });

          // Find the extracted directory
          const dirs = await this.fs.readdir(tempDir);
          if (dirs.length !== 1) {
            throw new Error("Invalid backup structure");
          }

          extractedDir = join(tempDir, dirs[0]);
          metadataPath = join(extractedDir, "metadata.yaml");
          configDir = join(extractedDir, "config");
        }

        // Read metadata
        const metadataContent = await this.fs.readFile(metadataPath, "utf-8");
        const metadata: BackupMetadata = yaml.parse(metadataContent);

        // Filter applications if specified
        const appsToRestore = options?.applications
          ? Object.entries(metadata.applications).filter(([appId]) =>
              options.applications!.includes(appId)
            )
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

        // Restore database if present and NeDB is enabled
        if (isNedbEnabled()) {
          const dbDir = join(extractedDir, "database");
          try {
            await this.fs.access(dbDir);
            await this.restoreDatabase(dbDir);
          } catch (error) {
            // Database directory might not exist in older backups
            console.warn("No database backup found or restore failed:", error);
          }
        }

        return {
          success: true,
          restored,
          failed,
        };
      } finally {
        // Clean up temp directory (not needed in test mode)
        if (!isTestMode()) {
          await this.fs.rm(tempDir, { recursive: true, force: true });
        }
      }
    } catch (error) {
      return {
        success: false,
        restored: [],
        failed: [],
        error:
          error instanceof Error
            ? error.message
            : "Unknown error occurred during restore",
      };
    }
  }

  /**
   * Delete a backup by ID
   */
  async deleteBackup(backupId: string): Promise<DeleteResult> {
    try {
      const backupPath = join(this.backupDir, `${backupId}.tgz`);

      // Check if backup exists
      try {
        await this.fs.access(backupPath);
      } catch {
        return {
          success: false,
          error: `Backup not found: ${backupId}`,
        };
      }

      if (isTestMode()) {
        // In test mode, delete directory
        await this.fs.rm(backupPath, { recursive: true, force: true });
      } else {
        // In production mode, delete tar file
        await this.fs.unlink(backupPath);

        // Delete metadata file if it exists
        const metadataPath = backupPath.replace(".tgz", ".yaml");
        try {
          await this.fs.unlink(metadataPath);
        } catch {
          // Ignore if metadata file doesn't exist
        }
      }

      return {
        success: true,
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unknown error occurred during deletion",
      };
    }
  }

  /**
   * Restore a single application's configuration
   */
  private async restoreApplication(
    appId: string,
    appBackup: BackupMetadata["applications"][string],
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
    const content = await this.fs.readFile(backupFile, "utf-8");

    // Write to the original location
    const targetPath = appBackup.source_path;

    // Ensure directory exists
    const targetDir = join(targetPath, "..");
    await this.fs.mkdir(targetDir, { recursive: true });

    // Write the configuration
    await this.fs.writeFile(targetPath, content, "utf-8");
  }

  /**
   * Get HyperTool version from package.json
   */
  private async getHypertoolVersion(): Promise<string> {
    try {
      // Try to find package.json
      const possiblePaths = [
        join(this.basePath, "../../package.json"),
        join(this.getCurrentWorkingDirectory(), "package.json"),
        join(__dirname, "../../../package.json"),
      ];

      for (const path of possiblePaths) {
        try {
          const content = await this.fs.readFile(path, "utf-8");
          const pkg = JSON.parse(content);
          if (pkg.name === "@toolprint/hypertool-mcp") {
            return pkg.version || "0.0.0";
          }
        } catch {
          // Try next path
        }
      }
    } catch {
      // Ignore errors
    }

    return "0.0.0";
  }

  /**
   * Export database contents for backup
   */
  private async exportDatabase(tempDir: string): Promise<{
    servers_count: number;
    groups_count: number;
    sources_count: number;
    export_files: string[];
  }> {
    try {
      const dbService = getDatabaseService();
      await dbService.init();

      const dbDir = join(tempDir, "database");
      const exportFiles: string[] = [];

      // Export servers
      const servers = await dbService.servers.findAll();
      const serversPath = join(dbDir, "servers.json");
      await this.fs.writeFile(
        serversPath,
        JSON.stringify(servers, null, 2),
        "utf-8"
      );
      exportFiles.push("servers.json");

      // Export groups
      const groups = await dbService.groups.findAll();
      const groupsPath = join(dbDir, "groups.json");
      await this.fs.writeFile(
        groupsPath,
        JSON.stringify(groups, null, 2),
        "utf-8"
      );
      exportFiles.push("groups.json");

      // Export config sources
      const sources = await dbService.configSources.findAll();
      const sourcesPath = join(dbDir, "sources.json");
      await this.fs.writeFile(
        sourcesPath,
        JSON.stringify(sources, null, 2),
        "utf-8"
      );
      exportFiles.push("sources.json");

      return {
        servers_count: servers.length,
        groups_count: groups.length,
        sources_count: sources.length,
        export_files: exportFiles,
      };
    } catch (error) {
      console.warn("Failed to export database:", error);
      return {
        servers_count: 0,
        groups_count: 0,
        sources_count: 0,
        export_files: [],
      };
    }
  }

  /**
   * Restore database from backup
   */
  private async restoreDatabase(dbDir: string): Promise<void> {
    const dbService = getDatabaseService();
    await dbService.init();

    // Restore servers
    const serversPath = join(dbDir, "servers.json");
    try {
      const serversContent = await this.fs.readFile(serversPath, "utf-8");
      const servers: ServerConfigRecord[] = JSON.parse(serversContent);

      // Clear existing servers and add from backup
      const existingServers = await dbService.servers.findAll();
      for (const server of existingServers) {
        await dbService.servers.delete(server.id);
      }

      for (const server of servers) {
        const { id, ...serverData } = server;
        await dbService.servers.add(serverData);
      }
    } catch (error) {
      console.warn("Failed to restore servers:", error);
    }

    // Restore groups
    const groupsPath = join(dbDir, "groups.json");
    try {
      const groupsContent = await this.fs.readFile(groupsPath, "utf-8");
      const groups: ServerConfigGroup[] = JSON.parse(groupsContent);

      // Clear existing groups and add from backup
      const existingGroups = await dbService.groups.findAll();
      for (const group of existingGroups) {
        await dbService.groups.delete(group.id);
      }

      for (const group of groups) {
        const { id, ...groupData } = group;
        await dbService.groups.add(groupData);
      }
    } catch (error) {
      console.warn("Failed to restore groups:", error);
    }

    // Restore config sources
    const sourcesPath = join(dbDir, "sources.json");
    try {
      const sourcesContent = await this.fs.readFile(sourcesPath, "utf-8");
      const sources: IConfigSource[] = JSON.parse(sourcesContent);

      // Clear existing sources and add from backup
      const existingSources = await dbService.configSources.findAll();
      for (const source of existingSources) {
        await dbService.configSources.delete(source.id);
      }

      for (const source of sources) {
        const { id, ...sourceData } = source;
        await dbService.configSources.add(sourceData);
      }
    } catch (error) {
      console.warn("Failed to restore config sources:", error);
    }
  }
}
