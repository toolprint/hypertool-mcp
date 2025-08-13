/**
 * Extension Discovery Service
 * Handles auto-discovery, unpacking, and validation of DXT extensions
 */

import { readdir, stat, readFile, writeFile, mkdir } from "fs/promises";
import { join, basename, extname } from "path";
import { homedir } from "os";
import { existsSync } from "fs";
import {
  DxtManifest,
  ExtensionMetadata,
  ExtensionConfig,
  HypertoolConfig,
  ExtensionRuntimeConfig,
  ValidationResult,
  ExtensionUserConfig,
} from "../config/dxt-config.js";
import { parseManifest } from "../dxt/manifest.js";
import { extractDxt } from "../dxt/loader.js";

/**
 * Extension discovery and management service
 */
export class ExtensionDiscoveryService {
  private readonly extensionsDir: string;
  private readonly installedDir: string;
  private readonly metadataFile: string;
  private metadata: Record<string, ExtensionMetadata> = {};

  constructor(baseDir?: string) {
    const base = baseDir || join(homedir(), ".toolprint", "hypertool-mcp");
    this.extensionsDir = join(base, "extensions");
    this.installedDir = join(this.extensionsDir, "installed");
    this.metadataFile = join(this.extensionsDir, ".metadata.json");
  }

  /**
   * Initialize the extensions directory structure
   */
  async initialize(): Promise<void> {
    await mkdir(this.extensionsDir, { recursive: true });
    await mkdir(this.installedDir, { recursive: true });
    await this.loadMetadata();
  }

  /**
   * Discover all DXT files in the extensions directory
   */
  async discoverExtensions(): Promise<string[]> {
    try {
      const files = await readdir(this.extensionsDir);
      return files
        .filter((file) => extname(file) === ".dxt")
        .map((file) => join(this.extensionsDir, file));
    } catch (error) {
      if ((error as any).code === "ENOENT") {
        return [];
      }
      throw error;
    }
  }

  /**
   * Discover already-installed extensions in the installed directory
   */
  async discoverInstalledExtensions(): Promise<string[]> {
    try {
      if (!existsSync(this.installedDir)) {
        return [];
      }

      const dirs = await readdir(this.installedDir);
      const extensionDirs: string[] = [];

      for (const dir of dirs) {
        const dirPath = join(this.installedDir, dir);
        const stats = await stat(dirPath);

        if (stats.isDirectory()) {
          // Check if it has a manifest.json
          const manifestPath = join(dirPath, "manifest.json");
          if (existsSync(manifestPath)) {
            extensionDirs.push(dir);
          }
        }
      }

      return extensionDirs;
    } catch (error) {
      if ((error as any).code === "ENOENT") {
        return [];
      }
      throw error;
    }
  }

  /**
   * Check if an extension needs to be unpacked or re-unpacked
   */
  async needsUnpacking(dxtPath: string): Promise<boolean> {
    const filename = basename(dxtPath, ".dxt");
    const metadata = this.metadata[filename];

    if (!metadata) {
      return true; // New extension
    }

    // Check if source file has been modified
    try {
      const stats = await stat(dxtPath);
      return stats.mtimeMs > metadata.sourceModified;
    } catch {
      return true; // Source file missing or inaccessible
    }
  }

  /**
   * Unpack a DXT extension to the installed directory
   */
  async unpackExtension(dxtPath: string): Promise<ExtensionMetadata> {
    const filename = basename(dxtPath, ".dxt");
    const installedPath = join(this.installedDir, filename);

    // Extract to installed directory (not temp)
    const extractDir = await this.extractToInstalled(dxtPath, installedPath);

    // Parse manifest to get extension info
    const manifest = await parseManifest(extractDir);

    // Get source file stats
    const stats = await stat(dxtPath);

    // Create metadata
    const metadata: ExtensionMetadata = {
      name: manifest.name,
      version: manifest.version,
      sourceFile: dxtPath,
      sourceModified: stats.mtimeMs,
      installedPath: extractDir,
      installedAt: Date.now(),
    };

    // Store metadata
    this.metadata[filename] = metadata;
    await this.saveMetadata();

    return metadata;
  }

  /**
   * Get extension metadata by filename (without .dxt extension)
   */
  getExtensionMetadata(filename: string): ExtensionMetadata | undefined {
    return this.metadata[filename];
  }

  /**
   * Get all extension metadata
   */
  getAllMetadata(): Record<string, ExtensionMetadata> {
    return { ...this.metadata };
  }

  /**
   * Load runtime configurations for all extensions
   */
  async loadExtensionConfigs(
    config: HypertoolConfig
  ): Promise<ExtensionRuntimeConfig[]> {
    const extensions: ExtensionRuntimeConfig[] = [];
    const extensionConfig = config.extensions;

    if (!extensionConfig || !extensionConfig.autoDiscovery) {
      return extensions;
    }

    // Discover all DXT files
    const dxtFiles = await this.discoverExtensions();

    // Also discover already-installed extensions
    const installedExtensions = await this.discoverInstalledExtensions();

    // Process DXT files that need unpacking
    for (const dxtPath of dxtFiles) {
      const filename = basename(dxtPath, ".dxt");

      try {
        // Check if needs unpacking
        if (await this.needsUnpacking(dxtPath)) {
          await this.unpackExtension(dxtPath);
        }

        const metadata = this.getExtensionMetadata(filename);
        if (!metadata) {
          console.warn(`Extension ${filename}: Failed to load metadata`);
          continue;
        }

        // Load manifest
        const manifest = await parseManifest(metadata.installedPath);

        // Get user settings
        const userSettings = extensionConfig.settings?.[filename];
        const isEnabled = userSettings?.isEnabled ?? true;

        // Validate configuration
        const validationResult = this.validateExtensionConfig(
          manifest,
          userSettings
        );

        // Create runtime config
        const serverConfig = this.buildServerConfig(
          manifest,
          userSettings,
          metadata.installedPath
        );

        const runtimeConfig: ExtensionRuntimeConfig = {
          name: filename,
          enabled: isEnabled && validationResult.isValid,
          manifest,
          installedPath: metadata.installedPath,
          serverConfig,
          validationResult,
        };

        extensions.push(runtimeConfig);

        // Log warnings for disabled extensions
        if (!runtimeConfig.enabled && validationResult.errors.length > 0) {
          console.warn(
            `Extension '${filename}' disabled: ${validationResult.errors.join(", ")}`
          );
        }
      } catch (error) {
        console.error(
          `Extension ${filename}: Failed to load - ${(error as Error).message}`
        );
      }
    }

    // Process already-installed extensions
    for (const extensionName of installedExtensions) {
      try {
        // Skip if already processed from DXT file
        if (extensions.some((ext) => ext.name === extensionName)) {
          continue;
        }

        const metadata = this.getExtensionMetadata(extensionName);
        if (!metadata) {
          console.warn(`Extension ${extensionName}: No metadata found`);
          continue;
        }

        // Load manifest from installed directory
        const manifest = await parseManifest(metadata.installedPath);

        // Get user settings
        const userSettings = extensionConfig.settings?.[extensionName];
        const isEnabled = userSettings?.isEnabled ?? true;

        // Validate configuration
        const validationResult = this.validateExtensionConfig(
          manifest,
          userSettings
        );

        // Create runtime config
        const serverConfig = this.buildServerConfig(
          manifest,
          userSettings,
          metadata.installedPath
        );

        const runtimeConfig: ExtensionRuntimeConfig = {
          name: extensionName,
          enabled: isEnabled && validationResult.isValid,
          manifest,
          installedPath: metadata.installedPath,
          serverConfig,
          validationResult,
        };

        extensions.push(runtimeConfig);

        // Log warnings for disabled extensions
        if (!runtimeConfig.enabled && validationResult.errors.length > 0) {
          console.warn(
            `Extension '${extensionName}' disabled: ${validationResult.errors.join(", ")}`
          );
        }
      } catch (error) {
        console.error(
          `Extension ${extensionName}: Failed to load - ${(error as Error).message}`
        );
      }
    }

    return extensions;
  }

  /**
   * Validate extension configuration against manifest user_config schema
   */
  private validateExtensionConfig(
    manifest: DxtManifest,
    userSettings?: ExtensionUserConfig
  ): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!manifest.user_config) {
      return { isValid: true, errors, warnings };
    }

    const userConfig = userSettings?.userConfig || {};

    // Validate each user config parameter
    for (const [key, paramDef] of Object.entries(manifest.user_config)) {
      const value = userConfig[key];

      // Check required fields
      if (paramDef.required && (value === undefined || value === null)) {
        errors.push(`Missing required config: ${key}`);
        continue;
      }

      // Skip validation if value is not provided and not required
      if (value === undefined || value === null) {
        continue;
      }

      // Type validation
      if (!this.validateParameterType(value, paramDef)) {
        errors.push(
          `Invalid type for ${key}. Expected ${paramDef.type}, got ${typeof value}`
        );
      }

      // Range validation for numbers
      if (paramDef.type === "number" && typeof value === "number") {
        if (paramDef.min !== undefined && value < paramDef.min) {
          errors.push(`Value for ${key} must be >= ${paramDef.min}`);
        }
        if (paramDef.max !== undefined && value > paramDef.max) {
          errors.push(`Value for ${key} must be <= ${paramDef.max}`);
        }
      }

      // Multiple value validation
      if (paramDef.multiple && !Array.isArray(value)) {
        errors.push(`Value for ${key} must be an array (multiple: true)`);
      }
      if (!paramDef.multiple && Array.isArray(value)) {
        errors.push(`Value for ${key} must not be an array (multiple: false)`);
      }
    }

    // Check for unknown config keys
    for (const key of Object.keys(userConfig)) {
      if (!manifest.user_config[key]) {
        warnings.push(`Unknown config key: ${key}`);
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Validate parameter type
   */
  private validateParameterType(value: any, paramDef: any): boolean {
    if (paramDef.multiple && Array.isArray(value)) {
      return value.every((v) => this.validateSingleType(v, paramDef.type));
    }
    return this.validateSingleType(value, paramDef.type);
  }

  /**
   * Validate single value type
   */
  private validateSingleType(value: any, type: string): boolean {
    switch (type) {
      case "string":
      case "directory":
      case "file":
        return typeof value === "string";
      case "number":
        return typeof value === "number";
      case "boolean":
        return typeof value === "boolean";
      default:
        return false;
    }
  }

  /**
   * Build server configuration with template substitution
   */
  private buildServerConfig(
    manifest: DxtManifest,
    userSettings: ExtensionUserConfig | undefined,
    installedPath: string
  ): {
    command: string;
    args: string[];
    env: Record<string, string>;
    cwd: string;
  } {
    const mcpConfig = manifest.server.mcp_config;
    const userConfig = userSettings?.userConfig || {};

    // Apply template substitution
    const substitutedEnv = this.substituteTemplates(
      mcpConfig.env || {},
      userConfig,
      installedPath
    );
    let substitutedArgs = (mcpConfig.args || []).map((arg) =>
      this.substituteTemplateString(arg, userConfig, installedPath)
    );

    // Resolve entry_point to absolute path if present
    if (manifest.server.entry_point) {
      // If entry_point exists, check if any args contain just the entry_point filename
      // and resolve them to absolute paths
      const entryPoint = manifest.server.entry_point;
      substitutedArgs = substitutedArgs.map((arg) => {
        // If the arg is exactly the entry_point filename, resolve to absolute path
        if (arg === entryPoint) {
          const resolvedPath = join(installedPath, entryPoint);
          return resolvedPath;
        }
        return arg;
      });
    }

    return {
      command: mcpConfig.command,
      args: substitutedArgs,
      env: { ...(process.env as Record<string, string>), ...substitutedEnv },
      cwd: installedPath,
    };
  }

  /**
   * Substitute template variables in environment variables
   */
  private substituteTemplates(
    env: Record<string, string>,
    userConfig: Record<string, any>,
    installedPath: string
  ): Record<string, string> {
    const result: Record<string, string> = {};

    for (const [key, value] of Object.entries(env)) {
      result[key] = this.substituteTemplateString(
        value,
        userConfig,
        installedPath
      );
    }

    return result;
  }

  /**
   * Substitute template variables in a string
   */
  private substituteTemplateString(
    template: string,
    userConfig: Record<string, any>,
    installedPath: string
  ): string {
    let result = template;

    // Replace ${__dirname} with installed path
    result = result.replace(/\$\{__dirname\}/g, installedPath);

    // Replace ${user_config.param} with user config values
    result = result.replace(
      /\$\{user_config\.([^}]+)\}/g,
      (match, paramName) => {
        const value = userConfig[paramName];
        if (value === undefined) {
          return match; // Keep original if not found
        }
        if (Array.isArray(value)) {
          return value.join(","); // Join arrays with commas
        }
        return String(value);
      }
    );

    // Replace ${env:VAR} with environment variables
    result = result.replace(/\$\{env:([^}]+)\}/g, (match, envVar) => {
      return process.env[envVar] || match;
    });

    return result;
  }

  /**
   * Extract DXT to installed directory instead of temp
   */
  private async extractToInstalled(
    dxtPath: string,
    targetDir: string
  ): Promise<string> {
    // Remove existing installation
    if (existsSync(targetDir)) {
      await this.removeDirectory(targetDir);
    }

    // Create target directory
    await mkdir(targetDir, { recursive: true });

    // Extract directly to target directory
    return await extractDxt(dxtPath, targetDir);
  }

  /**
   * Remove directory recursively
   */
  private async removeDirectory(dirPath: string): Promise<void> {
    try {
      const { rm } = await import("fs/promises");
      await rm(dirPath, { recursive: true, force: true });
    } catch (error) {
      // Ignore errors if directory doesn't exist
    }
  }

  /**
   * Load metadata from file
   */
  private async loadMetadata(): Promise<void> {
    try {
      if (existsSync(this.metadataFile)) {
        const content = await readFile(this.metadataFile, "utf-8");
        this.metadata = JSON.parse(content);
      }
    } catch (error) {
      console.warn(
        `Failed to load extension metadata: ${(error as Error).message}`
      );
      this.metadata = {};
    }
  }

  /**
   * Save metadata to file
   */
  private async saveMetadata(): Promise<void> {
    try {
      await writeFile(
        this.metadataFile,
        JSON.stringify(this.metadata, null, 2)
      );
    } catch (error) {
      console.error(
        `Failed to save extension metadata: ${(error as Error).message}`
      );
    }
  }
}
