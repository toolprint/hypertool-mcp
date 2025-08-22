/**
 * Persona Loader Implementation
 *
 * This module implements persona loading functionality that parses YAML configs, 
 * loads MCP configurations, and catalogs all assets in persona folders. The loader
 * orchestrates the parsing, validation, and asset discovery process to create
 * complete LoadedPersona objects ready for activation.
 *
 * @fileoverview Comprehensive persona loading with asset cataloging and validation
 */

import { promises as fs } from "fs";
import { basename, dirname, extname, join } from "path";
import type { MCPConfig } from "../types/config.js";
import type { IToolDiscoveryEngine } from "../discovery/types.js";
import {
  type PersonaConfig,
  type LoadedPersona,
  type PersonaAssets,
  type ValidationResult,
  type PersonaReference,
  type PersonaDiscoveryConfig,
} from "./types.js";
import {
  parsePersonaYAMLFile,
  isPersonaConfigFile,
  getSupportedPersonaFiles,
  type ParseResult,
  type ParseOptions,
} from "./parser.js";
import {
  PersonaValidator,
  type ValidationContext,
  type ValidationOptions,
} from "./validator.js";
import {
  PersonaError,
  PersonaRuntimeError,
  createFileSystemError,
  createPersonaNotFoundError,
  createActivationFailedError,
  isPersonaError,
} from "./errors.js";
import { PersonaDiscovery } from "./discovery.js";

/**
 * Persona loading options
 */
export interface PersonaLoadOptions {
  /** Whether to perform full validation during loading */
  validateOnLoad?: boolean;
  
  /** Whether to load MCP configuration files */
  loadMcpConfig?: boolean;
  
  /** Whether to catalog all assets in the persona folder */
  catalogAssets?: boolean;
  
  /** Tool discovery engine for validation */
  toolDiscoveryEngine?: IToolDiscoveryEngine;
  
  /** Custom validation options */
  validationOptions?: ValidationOptions;
  
  /** Whether to stop on validation errors */
  stopOnValidationError?: boolean;
  
  /** Whether to include warnings in validation results */
  includeWarnings?: boolean;
}

/**
 * Asset cataloging options
 */
export interface AssetCatalogOptions {
  /** Maximum directory depth to scan for assets */
  maxDepth?: number;
  
  /** File extensions to include in asset catalog */
  includedExtensions?: string[];
  
  /** File patterns to exclude from asset catalog */
  excludePatterns?: string[];
  
  /** Whether to follow symbolic links */
  followSymlinks?: boolean;
}

/**
 * Persona loading result
 */
export interface PersonaLoadResult {
  /** Whether loading was successful */
  success: boolean;
  
  /** Loaded persona if successful */
  persona?: LoadedPersona;
  
  /** Loading errors */
  errors: string[];
  
  /** Loading warnings */
  warnings: string[];
  
  /** Load time in milliseconds */
  loadTime: number;
}

/**
 * Batch loading result for multiple personas
 */
export interface BatchLoadResult {
  /** Successfully loaded personas */
  loaded: LoadedPersona[];
  
  /** Failed loading attempts with errors */
  failed: Array<{
    path: string;
    errors: string[];
    warnings: string[];
  }>;
  
  /** Total load time in milliseconds */
  totalLoadTime: number;
  
  /** Load statistics */
  stats: {
    attempted: number;
    succeeded: number;
    failed: number;
    averageLoadTime: number;
  };
}

/**
 * PersonaLoader class for comprehensive persona loading
 *
 * Orchestrates the loading process including YAML parsing, MCP configuration loading,
 * validation, and asset cataloging. Provides both individual and batch loading
 * capabilities with comprehensive error handling and performance monitoring.
 */
export class PersonaLoader {
  private validator: PersonaValidator;
  private discovery?: PersonaDiscovery;
  private toolDiscoveryEngine?: IToolDiscoveryEngine;
  
  constructor(
    toolDiscoveryEngine?: IToolDiscoveryEngine,
    discovery?: PersonaDiscovery
  ) {
    this.toolDiscoveryEngine = toolDiscoveryEngine;
    this.validator = new PersonaValidator(toolDiscoveryEngine);
    this.discovery = discovery;
  }

  /**
   * Load a persona from a file path
   *
   * @param filePath - Path to persona.yaml/yml file or persona directory
   * @param options - Loading options
   * @returns Promise resolving to load result
   */
  public async loadPersona(
    filePath: string,
    options: PersonaLoadOptions = {}
  ): Promise<PersonaLoadResult> {
    const startTime = Date.now();
    const result: PersonaLoadResult = {
      success: false,
      errors: [],
      warnings: [],
      loadTime: 0,
    };

    try {
      // Step 1: Determine if path is file or directory
      let configFilePath: string;
      let personaDirectory: string;
      
      const stats = await fs.stat(filePath);
      
      if (stats.isDirectory()) {
        // Find persona config file in directory
        personaDirectory = filePath;
        configFilePath = await this.findPersonaConfigFile(personaDirectory);
        
        if (!configFilePath) {
          result.errors.push(
            `No persona configuration file found in directory "${filePath}". Expected: ${getSupportedPersonaFiles().join(" or ")}`
          );
          return result;
        }
      } else if (stats.isFile()) {
        // Validate file is a supported persona config
        if (!isPersonaConfigFile(filePath)) {
          result.errors.push(
            `File "${filePath}" is not a supported persona configuration file. Expected: ${getSupportedPersonaFiles().join(" or ")}`
          );
          return result;
        }
        
        configFilePath = filePath;
        personaDirectory = dirname(filePath);
      } else {
        result.errors.push(`Path "${filePath}" is not a valid file or directory`);
        return result;
      }

      // Step 2: Parse YAML configuration
      const parseResult = await parsePersonaYAMLFile(configFilePath, {
        validateSchema: true,
        includeWarnings: options.includeWarnings ?? true,
      });

      if (!parseResult.success || !parseResult.data) {
        result.errors.push(...parseResult.errors.map(e => e.message));
        if (options.includeWarnings && parseResult.warnings.length > 0) {
          result.warnings.push(...parseResult.warnings.map(w => w.message));
        }
        return result;
      }

      const personaConfig = parseResult.data;

      // Step 3: Catalog assets in persona folder
      const assets = await this.catalogPersonaAssets(
        personaDirectory,
        configFilePath,
        options.catalogAssets ?? true
      );

      // Step 4: Load MCP configuration if present and requested
      let mcpConfig: MCPConfig | undefined;
      if (options.loadMcpConfig !== false && assets.mcpConfigFile) {
        try {
          mcpConfig = await this.loadMcpConfigFile(assets.mcpConfigFile);
        } catch (error) {
          const errorMessage = `Failed to load MCP configuration: ${error instanceof Error ? error.message : String(error)}`;
          
          if (options.stopOnValidationError) {
            result.errors.push(errorMessage);
            return result;
          } else {
            result.warnings.push(errorMessage);
          }
        }
      }

      // Step 5: Perform validation if requested
      let validationResult: ValidationResult = {
        isValid: true,
        errors: [],
        warnings: [],
      };

      if (options.validateOnLoad !== false) {
        const context: ValidationContext = {
          personaPath: personaDirectory,
          expectedPersonaName: basename(personaDirectory),
          checkToolAvailability: options.validationOptions?.checkToolAvailability,
          validateMcpConfig: options.validationOptions?.validateMcpConfig,
          toolDiscoveryEngine: options.toolDiscoveryEngine || this.toolDiscoveryEngine,
          assets,
        };

        validationResult = await this.validator.validatePersonaConfig(
          personaConfig,
          context,
          {
            ...options.validationOptions,
            includeWarnings: options.includeWarnings ?? true,
          }
        );

        // Add validation errors and warnings to result
        if (!validationResult.isValid) {
          const validationErrors = validationResult.errors.map(e => e.message);
          
          if (options.stopOnValidationError) {
            result.errors.push(...validationErrors);
            return result;
          } else {
            result.warnings.push(...validationErrors);
          }
        }

        if (options.includeWarnings && validationResult.warnings.length > 0) {
          result.warnings.push(...validationResult.warnings.map(w => w.message));
        }
      }

      // Step 6: Create LoadedPersona object
      const loadedPersona: LoadedPersona = {
        config: personaConfig,
        assets,
        mcpConfig,
        validation: validationResult,
        loadedAt: new Date(),
        sourcePath: personaDirectory,
      };

      result.success = true;
      result.persona = loadedPersona;
      
      return result;

    } catch (error) {
      const errorMessage = isPersonaError(error) 
        ? error.message 
        : `Failed to load persona: ${error instanceof Error ? error.message : String(error)}`;
      
      result.errors.push(errorMessage);
      return result;
    } finally {
      result.loadTime = Date.now() - startTime;
    }
  }

  /**
   * Load a persona from a PersonaReference
   *
   * @param reference - Persona reference from discovery
   * @param options - Loading options
   * @returns Promise resolving to load result
   */
  public async loadPersonaFromReference(
    reference: PersonaReference,
    options: PersonaLoadOptions = {}
  ): Promise<PersonaLoadResult> {
    if (reference.isArchive) {
      // TODO: Add support for archive loading in future versions
      return {
        success: false,
        errors: ["Archive persona loading not yet supported"],
        warnings: [],
        loadTime: 0,
      };
    }

    return this.loadPersona(reference.path, options);
  }

  /**
   * Load multiple personas from paths
   *
   * @param paths - Array of file or directory paths
   * @param options - Loading options
   * @returns Promise resolving to batch load result
   */
  public async loadMultiplePersonas(
    paths: string[],
    options: PersonaLoadOptions = {}
  ): Promise<BatchLoadResult> {
    const startTime = Date.now();
    const result: BatchLoadResult = {
      loaded: [],
      failed: [],
      totalLoadTime: 0,
      stats: {
        attempted: paths.length,
        succeeded: 0,
        failed: 0,
        averageLoadTime: 0,
      },
    };

    // Load all personas concurrently
    const loadPromises = paths.map(async (path) => {
      const loadResult = await this.loadPersona(path, options);
      return { path, loadResult };
    });

    const loadResults = await Promise.allSettled(loadPromises);

    // Process results
    const loadTimes: number[] = [];

    loadResults.forEach((promiseResult, index) => {
      const path = paths[index];

      if (promiseResult.status === "fulfilled") {
        const { loadResult } = promiseResult.value;
        loadTimes.push(loadResult.loadTime);

        if (loadResult.success && loadResult.persona) {
          result.loaded.push(loadResult.persona);
          result.stats.succeeded++;
        } else {
          result.failed.push({
            path,
            errors: loadResult.errors,
            warnings: loadResult.warnings,
          });
          result.stats.failed++;
        }
      } else {
        // Promise rejection
        result.failed.push({
          path,
          errors: [`Load operation failed: ${promiseResult.reason}`],
          warnings: [],
        });
        result.stats.failed++;
      }
    });

    // Calculate statistics
    result.totalLoadTime = Date.now() - startTime;
    result.stats.averageLoadTime = 
      loadTimes.length > 0 ? Math.round(loadTimes.reduce((a, b) => a + b, 0) / loadTimes.length) : 0;

    return result;
  }

  /**
   * Load personas from discovery results
   *
   * @param discoveredPersonas - Array of persona references
   * @param options - Loading options
   * @returns Promise resolving to batch load result
   */
  public async loadPersonasFromDiscovery(
    discoveredPersonas: PersonaReference[],
    options: PersonaLoadOptions = {}
  ): Promise<BatchLoadResult> {
    const paths = discoveredPersonas.map(ref => ref.path);
    return this.loadMultiplePersonas(paths, options);
  }

  /**
   * Discover and load all available personas
   *
   * @param discoveryConfig - Discovery configuration
   * @param loadOptions - Loading options
   * @returns Promise resolving to batch load result with discovery info
   */
  public async discoverAndLoadPersonas(
    discoveryConfig: PersonaDiscoveryConfig = {},
    loadOptions: PersonaLoadOptions = {}
  ): Promise<BatchLoadResult & { discoveryErrors: string[]; discoveryWarnings: string[] }> {
    // Use provided discovery instance or create a default one
    const discovery = this.discovery || new PersonaDiscovery();
    
    try {
      // Discover personas
      const discoveryResult = await discovery.discoverPersonas(discoveryConfig);
      
      // Load discovered personas
      const batchResult = await this.loadPersonasFromDiscovery(
        discoveryResult.personas,
        loadOptions
      );

      return {
        ...batchResult,
        discoveryErrors: discoveryResult.errors,
        discoveryWarnings: discoveryResult.warnings,
      };
    } catch (error) {
      const errorMessage = `Discovery failed: ${error instanceof Error ? error.message : String(error)}`;
      
      return {
        loaded: [],
        failed: [],
        totalLoadTime: 0,
        stats: { attempted: 0, succeeded: 0, failed: 0, averageLoadTime: 0 },
        discoveryErrors: [errorMessage],
        discoveryWarnings: [],
      };
    }
  }

  /**
   * Validate loaded persona without reloading
   *
   * @param persona - Loaded persona to validate
   * @param options - Validation options
   * @returns Promise resolving to validation result
   */
  public async validateLoadedPersona(
    persona: LoadedPersona,
    options: ValidationOptions = {}
  ): Promise<ValidationResult> {
    const context: ValidationContext = {
      personaPath: persona.sourcePath,
      expectedPersonaName: basename(persona.sourcePath),
      checkToolAvailability: options.checkToolAvailability,
      validateMcpConfig: options.validateMcpConfig,
      toolDiscoveryEngine: this.toolDiscoveryEngine,
      assets: persona.assets,
    };

    return this.validator.validatePersonaConfig(persona.config, context, options);
  }

  /**
   * Find persona configuration file in directory
   */
  private async findPersonaConfigFile(directory: string): Promise<string> {
    const supportedFiles = getSupportedPersonaFiles();
    
    for (const filename of supportedFiles) {
      const filePath = join(directory, filename);
      try {
        await fs.access(filePath);
        return filePath;
      } catch {
        // File doesn't exist, try next
        continue;
      }
    }
    
    throw createPersonaNotFoundError(
      basename(directory),
      [`No persona configuration file found in "${directory}"`]
    );
  }

  /**
   * Load MCP configuration from file
   */
  private async loadMcpConfigFile(filePath: string): Promise<MCPConfig> {
    try {
      const content = await fs.readFile(filePath, "utf-8");
      const mcpConfig = JSON.parse(content) as MCPConfig;
      
      // Basic validation
      if (!mcpConfig.mcpServers || typeof mcpConfig.mcpServers !== "object") {
        throw new Error("Invalid MCP config: missing or invalid 'mcpServers' object");
      }
      
      return mcpConfig;
    } catch (error) {
      throw createFileSystemError(
        "loading MCP config",
        filePath,
        error as Error
      );
    }
  }

  /**
   * Catalog all assets in persona folder
   */
  private async catalogPersonaAssets(
    personaDirectory: string,
    configFilePath: string,
    enableCataloging: boolean = true
  ): Promise<PersonaAssets> {
    const assets: PersonaAssets = {
      configFile: configFilePath,
    };

    // Check for MCP configuration file
    const mcpConfigPath = join(personaDirectory, "mcp.json");
    try {
      await fs.access(mcpConfigPath);
      assets.mcpConfigFile = mcpConfigPath;
    } catch {
      // MCP config is optional
    }

    if (!enableCataloging) {
      return assets;
    }

    // Catalog additional assets
    try {
      const assetFiles: string[] = [];
      const entries = await fs.readdir(personaDirectory, { withFileTypes: true });
      
      for (const entry of entries) {
        if (entry.isFile()) {
          const filePath = join(personaDirectory, entry.name);
          
          // Skip the main config files we've already cataloged
          if (filePath === configFilePath || filePath === assets.mcpConfigFile) {
            continue;
          }
          
          // Skip common non-asset files
          const skipPatterns = [
            /^\..*/, // Hidden files
            /readme\.md$/i, // README files
            /license$/i, // License files
            /\.log$/i, // Log files
          ];
          
          const shouldSkip = skipPatterns.some(pattern => pattern.test(entry.name));
          if (!shouldSkip) {
            assetFiles.push(filePath);
          }
        }
      }
      
      if (assetFiles.length > 0) {
        assets.assetFiles = assetFiles;
      }
    } catch (error) {
      // Asset cataloging is best-effort, don't fail the load
      // Could emit a warning here if needed
    }

    return assets;
  }

  /**
   * Set tool discovery engine for validation
   */
  public setToolDiscoveryEngine(engine: IToolDiscoveryEngine): void {
    this.toolDiscoveryEngine = engine;
    this.validator.setToolDiscoveryEngine(engine);
  }

  /**
   * Set persona discovery engine
   */
  public setDiscoveryEngine(discovery: PersonaDiscovery): void {
    this.discovery = discovery;
  }

  /**
   * Get loader statistics
   */
  public getLoaderStats(): {
    hasToolDiscoveryEngine: boolean;
    hasDiscoveryEngine: boolean;
    validatorStats: ReturnType<PersonaValidator['getValidationStats']>;
  } {
    return {
      hasToolDiscoveryEngine: !!this.toolDiscoveryEngine,
      hasDiscoveryEngine: !!this.discovery,
      validatorStats: this.validator.getValidationStats(),
    };
  }
}

/**
 * Create a default persona loader instance
 *
 * @param toolDiscoveryEngine - Optional tool discovery engine
 * @param discovery - Optional persona discovery engine
 * @returns PersonaLoader instance
 */
export function createPersonaLoader(
  toolDiscoveryEngine?: IToolDiscoveryEngine,
  discovery?: PersonaDiscovery
): PersonaLoader {
  return new PersonaLoader(toolDiscoveryEngine, discovery);
}

/**
 * Quick load function for simple use cases
 *
 * @param personaPath - Path to persona file or directory
 * @param options - Loading options
 * @returns Promise resolving to load result
 */
export async function loadPersona(
  personaPath: string,
  options: PersonaLoadOptions = {}
): Promise<PersonaLoadResult> {
  const loader = new PersonaLoader(options.toolDiscoveryEngine);
  return loader.loadPersona(personaPath, options);
}

/**
 * Batch load function for multiple personas
 *
 * @param paths - Array of persona paths
 * @param options - Loading options
 * @returns Promise resolving to batch load result
 */
export async function loadMultiplePersonas(
  paths: string[],
  options: PersonaLoadOptions = {}
): Promise<BatchLoadResult> {
  const loader = new PersonaLoader(options.toolDiscoveryEngine);
  return loader.loadMultiplePersonas(paths, options);
}

/**
 * Discover and load all available personas
 *
 * @param discoveryConfig - Discovery configuration
 * @param loadOptions - Loading options
 * @returns Promise resolving to batch load result with discovery info
 */
export async function discoverAndLoadAllPersonas(
  discoveryConfig: PersonaDiscoveryConfig = {},
  loadOptions: PersonaLoadOptions = {}
): Promise<BatchLoadResult & { discoveryErrors: string[]; discoveryWarnings: string[] }> {
  const loader = new PersonaLoader(loadOptions.toolDiscoveryEngine);
  return loader.discoverAndLoadPersonas(discoveryConfig, loadOptions);
}

/**
 * Default persona loader instance
 */
export const defaultPersonaLoader = new PersonaLoader();