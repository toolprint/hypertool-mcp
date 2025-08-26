/**
 * File system scanner for persona discovery
 *
 * This module provides comprehensive file system scanning functionality to discover
 * persona folders and archives in standard and custom locations. It handles permissions
 * gracefully, respects .gitignore patterns, and implements depth-limited traversal.
 *
 * @fileoverview Persona file system scanner with robust error handling
 */

import { promises as fs, constants as fsConstants } from "fs";
import { join, resolve, relative, basename, extname } from "path";
import { homedir } from "os";
import type {
  PersonaReference,
  PersonaDiscoveryConfig,
  PersonaErrorCode,
} from "./types.js";
import {
  PersonaDiscoveryError,
  createPermissionError,
  createFileSystemError,
} from "./errors.js";
import { getPersonaDirectorySync } from "../config/personaConfig.js";
/**
 * Default configuration values (local to scanner to avoid circular imports)
 */
const SCANNER_DEFAULTS = {
  /** Default maximum directory scan depth */
  MAX_SCAN_DEPTH: 3,

  /** Supported persona file names */
  SUPPORTED_CONFIG_FILES: ["persona.yaml", "persona.yml"],

  /** Supported archive extensions */
  SUPPORTED_ARCHIVE_EXTENSIONS: [".htp"],
} as const;

/**
 * Note: Standard search path is now dynamically determined from configuration
 * using the getPersonaDirectorySync() function which checks:
 * 1. HYPERTOOL_PERSONA_DIR environment variable
 * 2. personaDir setting in config.json
 * 3. Default ~/.toolprint/hypertool-mcp/personas
 */

/**
 * Default ignore patterns for scanning (includes .gitignore patterns)
 */
const DEFAULT_IGNORE_PATTERNS = [
  // Version control
  "**/.git/**",
  "**/.git",
  "**/.svn/**",
  "**/.hg/**",

  // Dependencies
  "**/node_modules/**",
  "**/node_modules",
  "**/vendor/**",
  "**/venv/**",
  "**/env/**",

  // Build outputs
  "**/dist/**",
  "**/build/**",
  "**/out/**",
  "**/.next/**",
  "**/.nuxt/**",
  "**/target/**",

  // IDE/Editor
  "**/.vscode/**",
  "**/.idea/**",
  "**/.cursor/**",

  // OS files
  "**/.DS_Store",
  "**/Thumbs.db",
  "**/.Spotlight-V100",
  "**/.Trashes",

  // Temporary files
  "**/tmp/**",
  "**/.tmp/**",
  "**/temp/**",
  "**/.temp/**",
  "**/*.tmp",
  "**/*.temp",

  // Log files
  "**/logs/**",
  "**/*.log",

  // Cache directories
  "**/.cache/**",
  "**/.vitest-cache/**",
  "**/.pytest_cache/**",

  // Agent specific
  "**/.taskmaster/**",
  "**/.serena/**",
  "**/worktrees/**",
] as const;

/**
 * Scan result for a single directory
 */
interface DirectoryScanResult {
  /** Found persona references */
  personas: PersonaReference[];
  /** Scan errors that didn't prevent other discoveries */
  errors: string[];
  /** Scan warnings */
  warnings: string[];
}

/**
 * File system scanner options
 */
interface ScannerOptions {
  /** Maximum depth for recursive scanning */
  maxDepth?: number;
  /** Whether to follow symbolic links */
  followSymlinks?: boolean;
  /** Additional ignore patterns */
  ignorePatterns?: string[];
  /** Whether to enable parallel scanning */
  parallel?: boolean;
}

/**
 * Resolve a path, expanding tilde (~) to home directory
 */
function resolvePath(path: string): string {
  if (path.startsWith("~/")) {
    return join(homedir(), path.slice(2));
  }
  return resolve(path);
}

/**
 * Check if a path matches any of the given glob patterns
 * Simple implementation without external dependencies
 */
function matchesIgnorePattern(path: string, patterns: string[]): boolean {
  const normalizedPath = path.replace(/\\/g, "/");

  for (const pattern of patterns) {
    const normalizedPattern = pattern.replace(/\\/g, "/");

    // Exact match
    if (normalizedPattern === normalizedPath) {
      return true;
    }

    // ** wildcard (matches any number of directories)
    if (normalizedPattern.includes("**/")) {
      const regexPattern = normalizedPattern
        .replace(/\*\*/g, ".*")
        .replace(/\*/g, "[^/]*")
        .replace(/\?/g, "[^/]");

      const regex = new RegExp(`^${regexPattern}$`);
      if (regex.test(normalizedPath)) {
        return true;
      }

      // Check if any parent path matches
      const parts = normalizedPath.split("/");
      for (let i = 0; i < parts.length; i++) {
        const subPath = parts.slice(i).join("/");
        if (regex.test(subPath)) {
          return true;
        }
      }
    }

    // Single * wildcard
    else if (normalizedPattern.includes("*")) {
      const regexPattern = normalizedPattern
        .replace(/\*/g, "[^/]*")
        .replace(/\?/g, "[^/]");

      const regex = new RegExp(`^${regexPattern}$`);
      if (regex.test(normalizedPath)) {
        return true;
      }
    }

    // Directory pattern (ends with /**)
    else if (normalizedPattern.endsWith("/**")) {
      const dirPattern = normalizedPattern.slice(0, -3);
      if (
        normalizedPath.startsWith(dirPattern + "/") ||
        normalizedPath === dirPattern
      ) {
        return true;
      }
    }

    // Basename match
    else {
      const pathBasename = basename(normalizedPath);
      if (pathBasename === normalizedPattern) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Check if a directory should be ignored based on patterns
 */
function shouldIgnoreDirectory(
  dirPath: string,
  basePath: string,
  ignorePatterns: string[]
): boolean {
  const relativePath = relative(basePath, dirPath);
  if (!relativePath || relativePath === ".") {
    return false;
  }

  return matchesIgnorePattern(relativePath, ignorePatterns);
}

/**
 * Check if a file has a supported persona config file name
 */
function isSupportedPersonaConfigFile(filename: string): boolean {
  return SCANNER_DEFAULTS.SUPPORTED_CONFIG_FILES.includes(filename as any);
}

/**
 * Check if a file has a supported archive extension
 */
function isSupportedArchiveFile(filename: string): boolean {
  const ext = extname(filename);
  return SCANNER_DEFAULTS.SUPPORTED_ARCHIVE_EXTENSIONS.includes(ext as any);
}

/**
 * Safely check if a path exists and is accessible
 */
async function safeAccess(
  path: string,
  mode: number = fsConstants.R_OK
): Promise<boolean> {
  try {
    await fs.access(path, mode);
    return true;
  } catch {
    return false;
  }
}

/**
 * Safely get directory stats with error handling
 */
async function safeStats(path: string): Promise<{
  isDirectory: boolean;
  isFile: boolean;
  isSymlink: boolean;
} | null> {
  try {
    const stats = await fs.lstat(path);
    return {
      isDirectory: stats.isDirectory(),
      isFile: stats.isFile(),
      isSymlink: stats.isSymbolicLink(),
    };
  } catch {
    return null;
  }
}

/**
 * Create a basic persona reference from a discovered path
 */
async function createPersonaReference(
  personaPath: string,
  isArchive: boolean = false
): Promise<PersonaReference> {
  const name = basename(personaPath, isArchive ? extname(personaPath) : "");

  // Basic structure check for quick validation
  let isValid = false;
  let description: string | undefined;
  const issues: string[] = [];

  if (isArchive) {
    // For archives, we can only check if the file exists and is readable
    isValid = await safeAccess(personaPath, fsConstants.R_OK);
    if (!isValid) {
      issues.push("Archive file is not readable");
    }
  } else {
    // For directories, check for persona config file
    const configFiles = SCANNER_DEFAULTS.SUPPORTED_CONFIG_FILES;
    let hasConfigFile = false;

    for (const configFile of configFiles) {
      const configPath = join(personaPath, configFile);
      if (await safeAccess(configPath, fsConstants.R_OK)) {
        hasConfigFile = true;

        // Try to quickly read description without full parsing
        try {
          const configContent = await fs.readFile(configPath, "utf-8");
          const descMatch = configContent.match(
            /description:\s*["']?([^"'\n\r]+)["']?/
          );
          if (descMatch) {
            description = descMatch[1].trim();
          }
        } catch {
          // Ignore errors during quick description extraction
        }
        break;
      }
    }

    if (!hasConfigFile) {
      issues.push("No persona.yaml or persona.yml file found");
    }

    isValid = hasConfigFile;
  }

  return {
    name,
    path: personaPath,
    isArchive,
    description,
    isValid,
    issues: issues.length > 0 ? issues : undefined,
  };
}

/**
 * Scan a single directory for persona folders and archives (internal implementation)
 */
async function scanSingleDirectory(
  dirPath: string,
  options: ScannerOptions,
  currentDepth: number = 0
): Promise<DirectoryScanResult> {
  const result: DirectoryScanResult = {
    personas: [],
    errors: [],
    warnings: [],
  };

  const maxDepth = options.maxDepth ?? SCANNER_DEFAULTS.MAX_SCAN_DEPTH;
  const ignorePatterns = [
    ...DEFAULT_IGNORE_PATTERNS,
    ...(options.ignorePatterns ?? []),
  ];

  // Check if we've exceeded max depth
  if (currentDepth >= maxDepth) {
    return result;
  }

  // Check if directory exists and is accessible
  if (!(await safeAccess(dirPath, fsConstants.R_OK))) {
    result.errors.push(`Directory not accessible: ${dirPath}`);
    return result;
  }

  const stats = await safeStats(dirPath);
  if (!stats) {
    result.errors.push(`Cannot get stats for directory: ${dirPath}`);
    return result;
  }

  if (!stats.isDirectory) {
    result.errors.push(`Path is not a directory: ${dirPath}`);
    return result;
  }

  // Check if this directory should be ignored
  if (
    currentDepth > 0 &&
    shouldIgnoreDirectory(dirPath, dirPath, ignorePatterns)
  ) {
    return result;
  }

  let entries: string[];
  try {
    entries = await fs.readdir(dirPath);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "EACCES") {
      result.warnings.push(`Permission denied accessing directory: ${dirPath}`);
    } else {
      result.errors.push(
        `Failed to read directory ${dirPath}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
    return result;
  }

  // Process each entry
  for (const entry of entries) {
    const entryPath = join(dirPath, entry);
    const entryStats = await safeStats(entryPath);

    if (!entryStats) {
      result.warnings.push(`Cannot get stats for entry: ${entryPath}`);
      continue;
    }

    // Handle symbolic links
    if (entryStats.isSymlink && !options.followSymlinks) {
      continue;
    }

    // Check if entry should be ignored
    const relativeEntryPath = relative(dirPath, entryPath);
    if (matchesIgnorePattern(relativeEntryPath, ignorePatterns)) {
      continue;
    }

    if (entryStats.isDirectory) {
      // Check if this directory contains a persona config file
      const hasPersonaConfig = await Promise.all(
        SCANNER_DEFAULTS.SUPPORTED_CONFIG_FILES.map((configFile) =>
          safeAccess(join(entryPath, configFile), fsConstants.R_OK)
        )
      ).then((results) => results.some((hasAccess) => hasAccess));

      if (hasPersonaConfig) {
        // This is a persona directory
        try {
          const personaRef = await createPersonaReference(entryPath, false);
          result.personas.push(personaRef);
        } catch (error) {
          result.errors.push(
            `Failed to create persona reference for ${entryPath}: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      } else if (currentDepth + 1 < maxDepth) {
        // Recursively scan subdirectory
        try {
          const subResult = await scanSingleDirectory(
            entryPath,
            options,
            currentDepth + 1
          );
          result.personas.push(...subResult.personas);
          result.errors.push(...subResult.errors);
          result.warnings.push(...subResult.warnings);
        } catch (error) {
          result.errors.push(
            `Failed to scan subdirectory ${entryPath}: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }
    } else if (entryStats.isFile && isSupportedArchiveFile(entry)) {
      // This is a persona archive file
      try {
        const personaRef = await createPersonaReference(entryPath, true);
        result.personas.push(personaRef);
      } catch (error) {
        result.errors.push(
          `Failed to create persona reference for archive ${entryPath}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  }

  return result;
}

/**
 * Get all search paths including standard and custom paths
 */
function getSearchPaths(config?: PersonaDiscoveryConfig): string[] {
  // If explicit searchPaths are provided, use those and ignore standard paths
  if (config?.searchPaths && config.searchPaths.length > 0) {
    const searchPaths = config.searchPaths.map(resolvePath);
    const additionalPaths = (config?.additionalPaths ?? []).map(resolvePath);

    // Remove duplicates while preserving order
    const allPaths = [...searchPaths, ...additionalPaths];
    return Array.from(new Set(allPaths));
  }

  // Otherwise use configured path plus additional paths
  const standardPaths = getStandardSearchPaths(); // Already resolved
  const additionalPaths = (config?.additionalPaths ?? []).map(resolvePath);

  // Remove duplicates while preserving order
  const allPaths = [...standardPaths, ...additionalPaths];
  return Array.from(new Set(allPaths));
}

/**
 * Scan multiple directories in parallel
 */
async function scanDirectoriesParallel(
  paths: string[],
  options: ScannerOptions
): Promise<DirectoryScanResult[]> {
  return Promise.all(paths.map((path) => scanSingleDirectory(path, options)));
}

/**
 * Scan multiple directories sequentially
 */
async function scanDirectoriesSequential(
  paths: string[],
  options: ScannerOptions
): Promise<DirectoryScanResult[]> {
  const results: DirectoryScanResult[] = [];

  for (const path of paths) {
    try {
      const result = await scanSingleDirectory(path, options);
      results.push(result);
    } catch (error) {
      // Create a result with just the error
      results.push({
        personas: [],
        errors: [
          `Failed to scan ${path}: ${error instanceof Error ? error.message : String(error)}`,
        ],
        warnings: [],
      });
    }
  }

  return results;
}

/**
 * Scan for persona folders and archives in configured locations
 *
 * @param config Discovery configuration with additional paths and options
 * @returns Promise resolving to array of discovered persona references
 */
export async function scanForPersonas(
  config?: PersonaDiscoveryConfig
): Promise<PersonaReference[]> {
  const searchPaths = getSearchPaths(config);

  const scannerOptions: ScannerOptions = {
    maxDepth: config?.maxDepth ?? SCANNER_DEFAULTS.MAX_SCAN_DEPTH,
    followSymlinks: config?.followSymlinks ?? false,
    ignorePatterns: config?.ignorePatterns ?? [],
    parallel: config?.parallelScan ?? true,
  };

  try {
    const results = scannerOptions.parallel
      ? await scanDirectoriesParallel(searchPaths, scannerOptions)
      : await scanDirectoriesSequential(searchPaths, scannerOptions);

    // Combine all results
    const allPersonas: PersonaReference[] = [];
    const allErrors: string[] = [];
    const allWarnings: string[] = [];

    for (const result of results) {
      allPersonas.push(...result.personas);
      allErrors.push(...result.errors);
      allWarnings.push(...result.warnings);
    }

    // Remove duplicate personas (same path)
    const uniquePersonas = allPersonas.filter(
      (persona, index, array) =>
        array.findIndex((p) => p.path === persona.path) === index
    );

    // Log warnings and errors if there are any
    if (allWarnings.length > 0) {
      console.warn(`Persona scanner warnings: ${allWarnings.join("; ")}`);
    }

    if (allErrors.length > 0) {
      console.warn(`Persona scanner errors: ${allErrors.join("; ")}`);
    }

    return uniquePersonas;
  } catch (error) {
    throw createFileSystemError(
      "scanning for personas",
      searchPaths.join(", "),
      error instanceof Error ? error : undefined
    );
  }
}

/**
 * Scan a specific directory for personas
 *
 * @param dirPath Path to directory to scan
 * @param options Scanner options
 * @returns Promise resolving to array of discovered persona references
 */
export async function scanDirectory(
  dirPath: string,
  options?: Partial<ScannerOptions>
): Promise<PersonaReference[]> {
  const resolvedPath = resolvePath(dirPath);

  const scannerOptions: ScannerOptions = {
    maxDepth: options?.maxDepth ?? SCANNER_DEFAULTS.MAX_SCAN_DEPTH,
    followSymlinks: options?.followSymlinks ?? false,
    ignorePatterns: options?.ignorePatterns ?? [],
    parallel: false, // Single directory scan doesn't benefit from parallelism
  };

  try {
    const result = await scanSingleDirectory(resolvedPath, scannerOptions);

    // Log warnings and errors
    if (result.warnings.length > 0) {
      console.warn(`Directory scan warnings: ${result.warnings.join("; ")}`);
    }

    if (result.errors.length > 0) {
      console.warn(`Directory scan errors: ${result.errors.join("; ")}`);
    }

    return result.personas;
  } catch (error) {
    throw createFileSystemError(
      "scanning directory",
      resolvedPath,
      error instanceof Error ? error : undefined
    );
  }
}

/**
 * Check if a path appears to be a valid persona folder
 *
 * @param dirPath Path to check
 * @returns Promise resolving to true if path contains persona configuration
 */
export async function isPersonaDirectory(dirPath: string): Promise<boolean> {
  const resolvedPath = resolvePath(dirPath);

  // Check if directory exists and is accessible
  if (!(await safeAccess(resolvedPath, fsConstants.R_OK))) {
    return false;
  }

  const stats = await safeStats(resolvedPath);
  if (!stats?.isDirectory) {
    return false;
  }

  // Check for persona config files
  for (const configFile of SCANNER_DEFAULTS.SUPPORTED_CONFIG_FILES) {
    const configPath = join(resolvedPath, configFile);
    if (await safeAccess(configPath, fsConstants.R_OK)) {
      return true;
    }
  }

  return false;
}

/**
 * Check if a path is a valid persona archive
 *
 * @param filePath Path to check
 * @returns Promise resolving to true if path is a supported persona archive
 */
export async function isPersonaArchive(filePath: string): Promise<boolean> {
  const resolvedPath = resolvePath(filePath);

  // Check file extension
  if (!isSupportedArchiveFile(basename(resolvedPath))) {
    return false;
  }

  // Check if file exists and is accessible
  if (!(await safeAccess(resolvedPath, fsConstants.R_OK))) {
    return false;
  }

  const stats = await safeStats(resolvedPath);
  return stats?.isFile ?? false;
}

/**
 * Get configured persona search path
 *
 * @returns Array with single configured persona directory path
 */
export function getStandardSearchPaths(): string[] {
  return [getPersonaDirectorySync()];
}

/**
 * Validate that a search path exists and is accessible
 *
 * @param path Path to validate
 * @returns Promise resolving to true if path is valid for scanning
 */
export async function validateSearchPath(path: string): Promise<boolean> {
  const resolvedPath = resolvePath(path);

  if (!(await safeAccess(resolvedPath, fsConstants.R_OK))) {
    return false;
  }

  const stats = await safeStats(resolvedPath);
  return stats?.isDirectory ?? false;
}

/**
 * Check if scanning would find any personas without doing a full scan
 *
 * @param config Discovery configuration
 * @returns Promise resolving to true if scanning would likely find personas
 */
export async function hasPersonasInPaths(
  config?: PersonaDiscoveryConfig
): Promise<boolean> {
  const searchPaths = getSearchPaths(config);

  for (const path of searchPaths) {
    if (await validateSearchPath(path)) {
      // Quick check: if directory exists and is accessible, assume it might contain personas
      try {
        const entries = await fs.readdir(path);
        // Look for potential persona folders or archives
        for (const entry of entries.slice(0, 10)) {
          // Check first 10 entries for performance
          const entryPath = join(path, entry);
          if (
            (await isPersonaDirectory(entryPath)) ||
            (await isPersonaArchive(entryPath))
          ) {
            return true;
          }
        }
      } catch {
        // Ignore errors and continue checking other paths
      }
    }
  }

  return false;
}
