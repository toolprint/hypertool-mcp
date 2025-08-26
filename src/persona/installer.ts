/**
 * Persona Installer
 *
 * This module handles the installation of personas from both folder paths and .htp archives
 * into the standard personas directory. It provides atomic operations with rollback
 * capabilities and comprehensive validation.
 *
 * @fileoverview Persona installation and management functionality
 */

import { promises as fs } from "fs";
import { join, basename, resolve, extname } from "path";
import { homedir } from "os";
import { getPersonaDirectorySync } from "../config/personaConfig.js";
import type { PersonaConfig, PersonaReference } from "./types.js";
import { PersonaErrorCode } from "./types.js";
import { PersonaError, createFileSystemError } from "./errors.js";
import { validatePersona } from "./validator.js";
import { unpackPersona, isHtpArchive } from "./archive.js";
import { discoverPersonas } from "./discovery.js";
import { createChildLogger } from "../utils/logging.js";

const logger = createChildLogger({ module: "persona-installer" });

/**
 * Installation options
 */
export interface InstallOptions {
  /** Whether to overwrite existing personas */
  force?: boolean;
  /** Whether to validate before installation */
  skipValidation?: boolean;
  /** Whether to create backup of existing persona */
  backup?: boolean;
  /** Custom installation directory (defaults to standard personas directory) */
  installDir?: string;
}

/**
 * Installation result
 */
export interface InstallResult {
  /** Installation success status */
  success: boolean;
  /** Name of installed persona */
  personaName?: string;
  /** Final installation path */
  installPath?: string;
  /** Backup path if backup was created */
  backupPath?: string;
  /** Any warnings encountered */
  warnings: string[];
  /** Any errors encountered */
  errors: string[];
  /** Whether this was an overwrite operation */
  wasOverwrite: boolean;
}

/**
 * Installation source type detection
 */
export enum SourceType {
  FOLDER = "folder",
  ARCHIVE = "archive",
}

/**
 * Installation source info
 */
export interface SourceInfo {
  /** Path to source */
  path: string;
  /** Source type */
  type: SourceType;
  /** Persona name if detectable */
  personaName?: string;
  /** Whether source exists and is accessible */
  accessible: boolean;
}

/**
 * Get the configured personas installation directory
 */
export function getStandardPersonasDir(): string {
  return getPersonaDirectorySync();
}

/**
 * Analyze installation source to determine type and basic info
 */
export async function analyzeSource(sourcePath: string): Promise<SourceInfo> {
  const resolvedPath = resolve(sourcePath);
  const sourceInfo: SourceInfo = {
    path: resolvedPath,
    type: SourceType.FOLDER,
    accessible: false,
  };

  try {
    // Check if path exists and is accessible
    const stats = await fs.stat(resolvedPath);
    sourceInfo.accessible = true;

    if (stats.isFile()) {
      if (isHtpArchive(resolvedPath)) {
        sourceInfo.type = SourceType.ARCHIVE;
        // Extract persona name from archive filename
        sourceInfo.personaName = basename(resolvedPath, extname(resolvedPath));
      } else {
        throw new PersonaError(
          PersonaErrorCode.FILE_SYSTEM_ERROR,
          `File must be a .htp archive: ${resolvedPath}`,
          { details: { path: resolvedPath } }
        );
      }
    } else if (stats.isDirectory()) {
      sourceInfo.type = SourceType.FOLDER;
      // Try to extract persona name from persona.yaml if available
      try {
        const configPath = join(resolvedPath, "persona.yaml");
        const configContent = await fs.readFile(configPath, "utf8");
        const { parsePersonaYAML } = await import("./parser.js");
        const parseResult = parsePersonaYAML(configContent, configPath);
        if (parseResult.success && parseResult.data) {
          const config = parseResult.data;
          sourceInfo.personaName = config.name;
        } else {
          // Parsing failed, fallback to folder name
          sourceInfo.personaName = basename(resolvedPath);
        }
      } catch {
        // If we can't read config, use folder name
        sourceInfo.personaName = basename(resolvedPath);
      }
    } else {
      throw new PersonaError(
        PersonaErrorCode.FILE_SYSTEM_ERROR,
        `Source must be a directory or .htp archive: ${resolvedPath}`,
        { details: { path: resolvedPath } }
      );
    }
  } catch (error) {
    if (error instanceof PersonaError) {
      throw error;
    }
    // Path doesn't exist or can't be accessed
    logger.debug(`Cannot access source: ${resolvedPath}`, { error });
  }

  return sourceInfo;
}

/**
 * Check if a persona with the given name already exists
 */
export async function checkPersonaExists(
  personaName: string,
  installDir: string = getStandardPersonasDir()
): Promise<boolean> {
  try {
    // First check if directory exists
    const personaPath = join(installDir, personaName);
    await fs.access(personaPath);

    // Also check if it's discoverable as a valid persona
    const discovery = await discoverPersonas({
      searchPaths: [installDir],
      includeArchives: false,
    });

    return discovery.personas.some((p) => p.name === personaName);
  } catch {
    return false;
  }
}

/**
 * Create backup of existing persona
 */
async function createPersonaBackup(personaPath: string): Promise<string> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = `${personaPath}.backup.${timestamp}`;

  try {
    await copyDirectory(personaPath, backupPath);
    logger.info(`Created backup: ${backupPath}`);
    return backupPath;
  } catch (error) {
    throw createFileSystemError("create backup", personaPath, error as Error);
  }
}

/**
 * Install persona from folder source
 */
async function installFromFolder(
  sourcePath: string,
  installPath: string,
  options: InstallOptions
): Promise<void> {
  try {
    // Validate source if not skipping validation
    if (!options.skipValidation) {
      const validationResult = await validatePersona(sourcePath);
      if (!validationResult.isValid) {
        throw new PersonaError(
          PersonaErrorCode.VALIDATION_FAILED,
          `Source persona is invalid: ${validationResult.errors.map((e) => e.message).join(", ")}`,
          { details: { path: sourcePath, errors: validationResult.errors } }
        );
      }
    }

    // Copy the entire directory structure
    await copyDirectory(sourcePath, installPath);
    logger.info(
      `Successfully copied persona folder: ${sourcePath} -> ${installPath}`
    );
  } catch (error) {
    throw new PersonaError(
      PersonaErrorCode.FILE_SYSTEM_ERROR,
      `Failed to install from folder: ${error instanceof Error ? error.message : String(error)}`,
      { details: { sourcePath, installPath } }
    );
  }
}

/**
 * Install persona from archive source
 */
async function installFromArchive(
  archivePath: string,
  installPath: string,
  options: InstallOptions
): Promise<void> {
  try {
    // Extract archive to install location
    const extractResult = await unpackPersona(archivePath, installPath, {
      force: true, // We handle conflicts at a higher level
      preservePermissions: true,
    });

    if (!extractResult.success) {
      throw new PersonaError(
        PersonaErrorCode.ARCHIVE_EXTRACTION_FAILED,
        `Failed to extract archive: ${extractResult.errors?.join(", ") || "Unknown error"}`,
        { details: { archivePath, installPath, errors: extractResult.errors } }
      );
    }

    // Validate extracted content if not skipping validation
    if (!options.skipValidation) {
      const validationResult = await validatePersona(installPath);
      if (!validationResult.isValid) {
        // Clean up invalid extraction
        await fs.rm(installPath, { recursive: true, force: true });
        throw new PersonaError(
          PersonaErrorCode.VALIDATION_FAILED,
          `Extracted persona is invalid: ${validationResult.errors.map((e) => e.message).join(", ")}`,
          { details: { path: installPath, errors: validationResult.errors } }
        );
      }
    }

    logger.info(
      `Successfully extracted persona archive: ${archivePath} -> ${installPath}`
    );
  } catch (error) {
    // Ensure cleanup on any error
    try {
      await fs.rm(installPath, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }

    if (error instanceof PersonaError) {
      throw error;
    }
    throw new PersonaError(
      PersonaErrorCode.ARCHIVE_EXTRACTION_FAILED,
      `Failed to install from archive: ${error instanceof Error ? error.message : String(error)}`,
      { details: { archivePath, installPath } }
    );
  }
}

/**
 * Install a persona from a source path (folder or archive)
 */
export async function installPersona(
  sourcePath: string,
  options: InstallOptions = {}
): Promise<InstallResult> {
  const result: InstallResult = {
    success: false,
    warnings: [],
    errors: [],
    wasOverwrite: false,
  };

  try {
    logger.info(`Starting persona installation from: ${sourcePath}`);

    // Analyze the source
    const sourceInfo = await analyzeSource(sourcePath);

    if (!sourceInfo.accessible) {
      throw createFileSystemError(
        "access source path",
        sourcePath,
        new Error("ENOENT")
      );
    }

    if (!sourceInfo.personaName) {
      throw new PersonaError(
        PersonaErrorCode.VALIDATION_FAILED,
        `Cannot determine persona name from source: ${sourcePath}`,
        { details: { path: sourcePath } }
      );
    }

    // Determine installation directory and path
    const installDir = options.installDir || getStandardPersonasDir();
    const installPath = join(installDir, sourceInfo.personaName);

    // Ensure installation directory exists
    await fs.mkdir(installDir, { recursive: true });

    // Check for existing persona
    const personaExists = await checkPersonaExists(
      sourceInfo.personaName,
      installDir
    );

    if (personaExists && !options.force) {
      throw new PersonaError(
        PersonaErrorCode.DUPLICATE_PERSONA_NAME,
        `Persona '${sourceInfo.personaName}' already exists. Use --force to overwrite.`,
        { details: { personaName: sourceInfo.personaName, installPath } }
      );
    }

    // Create backup if requested and persona exists
    let backupPath: string | undefined;
    if (personaExists && options.backup) {
      backupPath = await createPersonaBackup(installPath);
    }

    // Remove existing persona if we're overwriting
    if (personaExists) {
      await fs.rm(installPath, { recursive: true, force: true });
      result.wasOverwrite = true;
    }

    // Install based on source type
    if (sourceInfo.type === SourceType.FOLDER) {
      await installFromFolder(sourceInfo.path, installPath, options);
    } else {
      await installFromArchive(sourceInfo.path, installPath, options);
    }

    // Final validation of installed persona
    if (!options.skipValidation) {
      const finalValidation = await validatePersona(installPath);
      if (!finalValidation.isValid) {
        result.warnings.push("Installed persona has validation warnings");
        for (const error of finalValidation.errors) {
          result.warnings.push(`  - ${error.message}`);
        }
      }
    }

    result.success = true;
    result.personaName = sourceInfo.personaName;
    result.installPath = installPath;
    result.backupPath = backupPath;

    logger.info(
      `Successfully installed persona '${sourceInfo.personaName}' to: ${installPath}`
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    result.errors.push(errorMessage);
    logger.error(`Failed to install persona: ${errorMessage}`, { sourcePath });
  }

  return result;
}

/**
 * List all installed personas
 */
export async function listInstalledPersonas(
  installDir: string = getStandardPersonasDir()
): Promise<PersonaReference[]> {
  try {
    const discovery = await discoverPersonas({
      searchPaths: [installDir],
      includeArchives: false,
    });

    return discovery.personas;
  } catch (error) {
    logger.error(
      `Failed to list installed personas: ${error instanceof Error ? error.message : String(error)}`
    );
    return [];
  }
}

/**
 * Uninstall a persona by name
 */
export async function uninstallPersona(
  personaName: string,
  installDir: string = getStandardPersonasDir(),
  createBackup: boolean = true
): Promise<InstallResult> {
  const result: InstallResult = {
    success: false,
    warnings: [],
    errors: [],
    wasOverwrite: false,
  };

  try {
    const installPath = join(installDir, personaName);

    // Check if persona exists
    const exists = await checkPersonaExists(personaName, installDir);
    if (!exists) {
      throw new PersonaError(
        PersonaErrorCode.PERSONA_NOT_FOUND,
        `Persona '${personaName}' is not installed`,
        { details: { personaName, installPath } }
      );
    }

    // Create backup if requested
    let backupPath: string | undefined;
    if (createBackup) {
      backupPath = await createPersonaBackup(installPath);
    }

    // Remove the persona directory
    await fs.rm(installPath, { recursive: true, force: true });

    result.success = true;
    result.personaName = personaName;
    result.installPath = installPath;
    result.backupPath = backupPath;

    logger.info(
      `Successfully uninstalled persona '${personaName}' from: ${installPath}`
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    result.errors.push(errorMessage);
    logger.error(`Failed to uninstall persona: ${errorMessage}`, {
      personaName,
    });
  }

  return result;
}

/**
 * Copy directory recursively
 */
async function copyDirectory(src: string, dest: string): Promise<void> {
  const stats = await fs.stat(src);

  if (stats.isDirectory()) {
    await fs.mkdir(dest, { recursive: true });
    const entries = await fs.readdir(src);

    for (const entry of entries) {
      const srcPath = join(src, entry);
      const destPath = join(dest, entry);
      await copyDirectory(srcPath, destPath);
    }
  } else {
    await fs.copyFile(src, dest);
  }
}
