/**
 * Persona Archive Handler
 *
 * This module handles the creation and extraction of .htp archive files.
 * Archives use tar.gz format internally and contain the complete persona structure
 * including configuration, assets, and metadata.
 *
 * @fileoverview Persona archive pack/unpack functionality
 */

import { promises as fs } from "fs";
import { createReadStream, createWriteStream } from "fs";
import { join, basename, dirname, extname } from "path";
import { pipeline } from "stream/promises";
import * as tar from "tar";
import { createGzip, createGunzip } from "zlib";
import type { PersonaConfig } from "./types.js";
import { PersonaErrorCode } from "./types.js";
import {
  PersonaError,
  createFileSystemError,
  createArchiveExtractionError,
} from "./errors.js";
import { validatePersona } from "./validator.js";
import { createChildLogger } from "../utils/logging.js";

const logger = createChildLogger({ module: "persona-archive" });

/**
 * Archive operation options
 */
export interface ArchiveOptions {
  /** Whether to overwrite existing files */
  force?: boolean;
  /** Compression level (0-9) */
  compressionLevel?: number;
  /** Whether to preserve permissions */
  preservePermissions?: boolean;
}

/**
 * Archive metadata embedded in the tar header
 */
export interface ArchiveMetadata {
  /** Archive format version */
  version: string;
  /** When archive was created */
  createdAt: string;
  /** Persona name from config */
  personaName: string;
  /** Optional description */
  description?: string;
}

/**
 * Result of archive operations
 */
export interface ArchiveResult {
  /** Operation success status */
  success: boolean;
  /** Path to created archive or extracted directory */
  path: string;
  /** Any warnings encountered */
  warnings?: string[];
  /** Errors encountered */
  errors?: string[];
  /** Archive metadata if available */
  metadata?: ArchiveMetadata;
}

/**
 * Constants for archive handling
 */
const ARCHIVE_CONSTANTS = {
  /** Current archive format version */
  FORMAT_VERSION: "1.0",
  /** Supported archive extension */
  EXTENSION: ".htp",
  /** Default compression level */
  DEFAULT_COMPRESSION: 6,
  /** Metadata file name within archive */
  METADATA_FILE: ".htp-metadata",
} as const;

/**
 * Check if a file path has the correct .htp extension
 */
export function isHtpArchive(filePath: string): boolean {
  return extname(filePath).toLowerCase() === ARCHIVE_CONSTANTS.EXTENSION;
}

/**
 * Validate that a path can be used for archive creation
 */
async function validateSourcePath(sourcePath: string): Promise<void> {
  try {
    const stats = await fs.stat(sourcePath);
    if (!stats.isDirectory()) {
      throw new PersonaError(
        PersonaErrorCode.FILE_SYSTEM_ERROR,
        `Source path must be a directory: ${sourcePath}`,
        { details: { path: sourcePath } }
      );
    }
  } catch (error) {
    if (error instanceof PersonaError) {
      throw error;
    }
    throw createFileSystemError(
      "access source path",
      sourcePath,
      error as Error
    );
  }
}

/**
 * Validate persona structure before archiving
 */
async function validatePersonaStructure(
  sourcePath: string
): Promise<PersonaConfig> {
  try {
    const validationResult = await validatePersona(sourcePath);
    if (!validationResult.isValid) {
      throw new PersonaError(
        PersonaErrorCode.VALIDATION_FAILED,
        `Invalid persona structure: ${validationResult.errors.map((e) => e.message).join(", ")}`,
        { details: { path: sourcePath, errors: validationResult.errors } }
      );
    }

    // Load the persona config to get metadata
    const configPath = join(sourcePath, "persona.yaml");
    const configContent = await fs.readFile(configPath, "utf8");
    const { parsePersonaYAML } = await import("./parser.js");
    const parseResult = parsePersonaYAML(configContent, configPath);
    if (!parseResult.success || !parseResult.data) {
      throw new PersonaError(
        PersonaErrorCode.YAML_PARSE_ERROR,
        `Failed to parse persona config: ${parseResult.errors.map((e) => e.message).join(", ")}`,
        { details: { path: configPath, errors: parseResult.errors } }
      );
    }
    return parseResult.data;
  } catch (error) {
    if (error instanceof PersonaError) {
      throw error;
    }
    throw new PersonaError(
      PersonaErrorCode.VALIDATION_FAILED,
      `Failed to validate persona structure: ${error instanceof Error ? error.message : String(error)}`,
      { details: { path: sourcePath } }
    );
  }
}

/**
 * Create archive metadata
 */
function createArchiveMetadata(personaConfig: PersonaConfig): ArchiveMetadata {
  return {
    version: ARCHIVE_CONSTANTS.FORMAT_VERSION,
    createdAt: new Date().toISOString(),
    personaName: personaConfig.name,
    description: personaConfig.description,
  };
}

/**
 * Write metadata file to the archive
 */
async function writeArchiveMetadata(
  tempDir: string,
  metadata: ArchiveMetadata
): Promise<void> {
  const metadataPath = join(tempDir, ARCHIVE_CONSTANTS.METADATA_FILE);
  await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2), "utf8");
}

/**
 * Read metadata from extracted archive
 */
async function readArchiveMetadata(
  extractPath: string
): Promise<ArchiveMetadata | undefined> {
  try {
    const metadataPath = join(extractPath, ARCHIVE_CONSTANTS.METADATA_FILE);
    const metadataContent = await fs.readFile(metadataPath, "utf8");
    return JSON.parse(metadataContent) as ArchiveMetadata;
  } catch {
    // Metadata file is optional for backwards compatibility
    return undefined;
  }
}

/**
 * Create a .htp archive from a persona directory
 */
export async function packPersona(
  sourcePath: string,
  archivePath: string,
  options: ArchiveOptions = {}
): Promise<ArchiveResult> {
  const result: ArchiveResult = {
    success: false,
    path: archivePath,
    warnings: [],
    errors: [],
  };

  try {
    logger.info(
      `Starting persona archive creation: ${sourcePath} -> ${archivePath}`
    );

    // Validate inputs
    if (!isHtpArchive(archivePath)) {
      throw new PersonaError(
        PersonaErrorCode.FILE_SYSTEM_ERROR,
        `Archive must have ${ARCHIVE_CONSTANTS.EXTENSION} extension`,
        { details: { path: archivePath } }
      );
    }

    await validateSourcePath(sourcePath);
    const personaConfig = await validatePersonaStructure(sourcePath);

    // Check if output file already exists
    if (!options.force) {
      try {
        await fs.access(archivePath);
        throw new PersonaError(
          PersonaErrorCode.FILE_SYSTEM_ERROR,
          `Archive already exists: ${archivePath}. Use force option to overwrite.`,
          { details: { path: archivePath } }
        );
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
          throw error;
        }
        // File doesn't exist, continue
      }
    }

    // Ensure output directory exists
    await fs.mkdir(dirname(archivePath), { recursive: true });

    // Create temporary staging area
    const tempDir = join(
      dirname(archivePath),
      `.tmp-${basename(archivePath, ARCHIVE_CONSTANTS.EXTENSION)}-${Date.now()}`
    );
    await fs.mkdir(tempDir, { recursive: true });

    try {
      // Copy source files to temp directory
      await copyDirectory(sourcePath, tempDir);

      // Create and write metadata
      const metadata = createArchiveMetadata(personaConfig);
      await writeArchiveMetadata(tempDir, metadata);

      // Create the tar.gz archive
      await tar.create(
        {
          gzip: true,
          file: archivePath,
          cwd: tempDir,
          filter: (path, stat) => {
            // Allow the root directory
            if (path === ".") return true;

            // Exclude hidden files (starting with .) except our metadata file
            const basename = path.split("/").pop() || "";
            const include =
              !basename.startsWith(".") ||
              basename === ARCHIVE_CONSTANTS.METADATA_FILE;
            return include;
          },
          ...(options.preservePermissions !== false && { preservePaths: true }),
        },
        ["."] // Archive everything in temp directory
      );

      result.success = true;
      result.metadata = metadata;
      logger.info(`Successfully created persona archive: ${archivePath}`);
    } finally {
      // Clean up temporary directory
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    result.errors?.push(errorMessage);
    logger.error(`Failed to create persona archive: ${errorMessage}`, {
      sourcePath,
      archivePath,
    });

    // Clean up partial archive on failure
    try {
      await fs.unlink(archivePath);
    } catch {
      // Ignore cleanup errors
    }
  }

  return result;
}

/**
 * Extract a .htp archive to a directory
 */
export async function unpackPersona(
  archivePath: string,
  extractPath: string,
  options: ArchiveOptions = {}
): Promise<ArchiveResult> {
  const result: ArchiveResult = {
    success: false,
    path: extractPath,
    warnings: [],
    errors: [],
  };

  try {
    logger.info(
      `Starting persona archive extraction: ${archivePath} -> ${extractPath}`
    );

    // Validate inputs
    if (!isHtpArchive(archivePath)) {
      throw new PersonaError(
        PersonaErrorCode.FILE_SYSTEM_ERROR,
        `File must have ${ARCHIVE_CONSTANTS.EXTENSION} extension`,
        { details: { path: archivePath } }
      );
    }

    // Check if archive exists and is readable
    try {
      await fs.access(archivePath, fs.constants.R_OK);
    } catch (error) {
      throw createFileSystemError(
        "read archive file",
        archivePath,
        error as Error
      );
    }

    // Check if extract path already exists
    if (!options.force) {
      try {
        await fs.access(extractPath);
        throw new PersonaError(
          PersonaErrorCode.FILE_SYSTEM_ERROR,
          `Extract path already exists: ${extractPath}. Use force option to overwrite.`,
          { details: { path: extractPath } }
        );
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
          throw error;
        }
        // Path doesn't exist, continue
      }
    }

    // Create extract directory (clean it first if using force)
    if (options.force) {
      try {
        await fs.rm(extractPath, { recursive: true, force: true });
      } catch {
        // Ignore errors if directory doesn't exist
      }
    }
    await fs.mkdir(extractPath, { recursive: true });

    try {
      // Extract the archive
      await tar.extract({
        file: archivePath,
        cwd: extractPath,
        ...(options.preservePermissions !== false && { preservePaths: true }),
      });

      // Read metadata if available
      const metadata = await readArchiveMetadata(extractPath);
      if (metadata) {
        result.metadata = metadata;

        // Clean up metadata file (it's not part of the persona structure)
        await fs.unlink(join(extractPath, ARCHIVE_CONSTANTS.METADATA_FILE));
      }

      // Validate extracted persona structure
      try {
        await validatePersonaStructure(extractPath);
      } catch (error) {
        result.warnings?.push(
          `Extracted persona may be invalid: ${error instanceof Error ? error.message : String(error)}`
        );
      }

      result.success = true;
      logger.info(`Successfully extracted persona archive: ${extractPath}`);
    } catch (error) {
      // Clean up partial extraction on failure
      await fs.rm(extractPath, { recursive: true, force: true });
      throw error;
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    result.errors?.push(errorMessage);
    logger.error(`Failed to extract persona archive: ${errorMessage}`, {
      archivePath,
      extractPath,
    });
  }

  return result;
}

/**
 * List contents of a .htp archive without extracting
 */
export async function listArchiveContents(
  archivePath: string
): Promise<string[]> {
  try {
    if (!isHtpArchive(archivePath)) {
      throw new PersonaError(
        PersonaErrorCode.FILE_SYSTEM_ERROR,
        `File must have ${ARCHIVE_CONSTANTS.EXTENSION} extension`,
        { details: { path: archivePath } }
      );
    }

    const contents: string[] = [];

    await tar.list({
      file: archivePath,
      onentry: (entry) => {
        // Normalize path by removing ./ prefix
        let normalizedPath = entry.path;
        if (normalizedPath.startsWith("./")) {
          normalizedPath = normalizedPath.substring(2);
        }

        // Skip the metadata file from the listing
        if (normalizedPath !== ARCHIVE_CONSTANTS.METADATA_FILE) {
          // Skip directory entries (they end with /)
          if (normalizedPath && !normalizedPath.endsWith("/")) {
            contents.push(normalizedPath);
          }
        }
      },
    });

    return contents;
  } catch (error) {
    // Re-throw PersonaErrors as-is to preserve their error codes
    if (error instanceof PersonaError) {
      throw error;
    }
    throw new PersonaError(
      PersonaErrorCode.ARCHIVE_EXTRACTION_FAILED,
      `Failed to list archive contents: ${error instanceof Error ? error.message : String(error)}`,
      { details: { path: archivePath } }
    );
  }
}

/**
 * Copy directory recursively with proper error handling
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
