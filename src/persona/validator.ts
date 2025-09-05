/**
 * Multi-layer validation for persona configurations
 *
 * This module implements comprehensive validation for persona configurations including
 * schema validation, business rules, tool resolution, and MCP config validation.
 * The PersonaValidator class orchestrates multiple validation layers and provides
 * detailed error reporting with actionable suggestions.
 *
 * @fileoverview Persona configuration validation system
 */

import { readFile, stat } from "fs/promises";
import { basename, dirname } from "path";
import type { MCPConfig } from "../types/config.js";
import type { IToolDiscoveryEngine } from "../discovery/types.js";
import {
  type PersonaConfig,
  type ValidationResult,
  type PersonaValidationErrorInfo,
  type PersonaAssets,
} from "./types.js";
import {
  validatePersonaConfig,
  type SchemaValidationResult,
  SUPPORTED_PERSONA_FILES,
  extractPersonaNameFromPath,
} from "./schemas.js";
import {
  parsePersonaYAML,
  parsePersonaYAMLFile,
  type ParseResult,
  type ParseOptions,
} from "./parser.js";
import {
  PersonaValidationError,
  createSchemaValidationError,
  createToolResolutionError,
  createDuplicatePersonaNameError,
  type PersonaError,
} from "./errors.js";

/**
 * Validation context for providing additional information during validation
 */
export interface ValidationContext {
  /** Path to the persona folder or configuration file */
  personaPath: string;
  /** Expected persona name from folder structure */
  expectedPersonaName?: string;
  /** Whether to perform tool resolution validation */
  checkToolAvailability?: boolean;
  /** Whether to validate MCP config if present */
  validateMcpConfig?: boolean;
  /** Tool discovery engine for tool resolution validation */
  toolDiscoveryEngine?: IToolDiscoveryEngine;
  /** Additional persona assets for comprehensive validation */
  assets?: PersonaAssets;
}

/**
 * Validation options for customizing validation behavior
 */
export interface ValidationOptions {
  /** Whether to include warnings in the result (default: true) */
  includeWarnings?: boolean;
  /** Whether to stop validation on first error (default: false) */
  stopOnFirstError?: boolean;
  /** Whether to perform tool availability checks (default: true) */
  checkToolAvailability?: boolean;
  /** Whether to validate MCP config files (default: true) */
  validateMcpConfig?: boolean;
  /** Custom validation functions for extensibility */
  customValidators?: Array<
    (config: PersonaConfig, context: ValidationContext) => ValidationResult
  >;
}

/**
 * Comprehensive persona configuration validator
 *
 * Implements a multi-layer validation system that covers:
 * 1. YAML syntax and schema validation
 * 2. Business rule validation
 * 3. Tool resolution validation
 * 4. MCP config validation
 */
export class PersonaValidator {
  private toolDiscoveryEngine?: IToolDiscoveryEngine;

  constructor(toolDiscoveryEngine?: IToolDiscoveryEngine) {
    this.toolDiscoveryEngine = toolDiscoveryEngine;
  }

  /**
   * Validate a persona configuration from parsed data
   *
   * @param config - Parsed persona configuration
   * @param context - Validation context
   * @param options - Validation options
   * @returns Comprehensive validation result
   */
  public async validatePersonaConfig(
    config: PersonaConfig,
    context: ValidationContext,
    options: ValidationOptions = {}
  ): Promise<ValidationResult> {
    const {
      includeWarnings = true,
      stopOnFirstError = false,
      checkToolAvailability = true,
      validateMcpConfig = true,
      customValidators = [],
    } = options;

    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
    };

    try {
      // Layer 1: Business rule validation
      const businessResult = this.validateBusinessRules(config, context);
      this.mergeValidationResults(result, businessResult, includeWarnings);
      if (!businessResult.isValid && stopOnFirstError) {
        return result;
      }

      // Layer 2: Tool resolution validation
      if (
        checkToolAvailability &&
        (this.toolDiscoveryEngine || context.toolDiscoveryEngine)
      ) {
        const toolEngine =
          context.toolDiscoveryEngine || this.toolDiscoveryEngine!;
        const toolResult = await this.validateToolResolution(
          config,
          toolEngine
        );
        this.mergeValidationResults(result, toolResult, includeWarnings);
        if (!toolResult.isValid && stopOnFirstError) {
          return result;
        }
      }

      // Layer 3: MCP config validation (if present and enabled)
      if (validateMcpConfig && context.assets?.mcpConfigFile) {
        try {
          const mcpResult = await this.validateMcpConfig(
            context.assets.mcpConfigFile
          );

          // Check if validation failed due to file reading issues (treat as warning)
          const fileReadingErrors = mcpResult.errors.filter((error) =>
            error.message.includes("Failed to read MCP config file")
          );

          if (fileReadingErrors.length > 0) {
            // Convert file reading errors to warnings
            if (includeWarnings) {
              result.warnings.push(
                ...fileReadingErrors.map((error) => ({
                  ...error,
                  severity: "warning" as const,
                }))
              );
            }
            // Remove file reading errors from the result
            const nonFileErrors = mcpResult.errors.filter(
              (error) =>
                !error.message.includes("Failed to read MCP config file")
            );
            mcpResult.errors = nonFileErrors;
            mcpResult.isValid = nonFileErrors.length === 0;
          }

          this.mergeValidationResults(result, mcpResult, includeWarnings);
          if (!mcpResult.isValid && stopOnFirstError) {
            return result;
          }
        } catch (error) {
          // MCP config validation is optional - treat as warning if file exists but can't be validated
          if (includeWarnings) {
            result.warnings.push({
              type: "mcp-config",
              message: `Failed to validate MCP config: ${error instanceof Error ? error.message : String(error)}`,
              suggestion:
                "Check the mcp.json file format and ensure it's valid JSON",
              severity: "warning",
            });
          }
        }
      }

      // Layer 4: Custom validation
      for (const validator of customValidators) {
        try {
          const customResult = validator(config, context);
          this.mergeValidationResults(result, customResult, includeWarnings);
          if (!customResult.isValid && stopOnFirstError) {
            return result;
          }
        } catch (error) {
          result.errors.push({
            type: "business",
            message: `Custom validation failed: ${error instanceof Error ? error.message : String(error)}`,
            severity: "error",
          });
        }
      }

      // Final validation status
      result.isValid = result.errors.length === 0;
    } catch (error) {
      result.isValid = false;
      result.errors.push({
        type: "business",
        message: `Validation failed: ${error instanceof Error ? error.message : String(error)}`,
        suggestion: "Check the persona configuration and try again",
        severity: "error",
      });
    }

    return result;
  }

  /**
   * Validate a persona configuration from a file path
   *
   * @param filePath - Path to persona.yaml/yml file
   * @param options - Validation options
   * @returns Comprehensive validation result
   */
  public async validatePersonaFile(
    filePath: string,
    options: ValidationOptions = {}
  ): Promise<ValidationResult> {
    const result: ValidationResult = {
      isValid: false,
      errors: [],
      warnings: [],
    };

    try {
      // Step 1: Read file content directly (bypassing filename restriction)
      let content: string;
      try {
        content = await readFile(filePath, "utf-8");
      } catch (error) {
        const fsError = error as NodeJS.ErrnoException;
        result.errors.push({
          type: "schema",
          message: `Failed to validate file "${filePath}": ${fsError.message}`,
          suggestion:
            fsError.code === "ENOENT"
              ? `Verify that the file exists at "${filePath}"`
              : fsError.code === "EACCES"
                ? `Check file permissions for "${filePath}"`
                : `Check file accessibility and try again`,
          severity: "error",
        });
        return result;
      }

      // Step 2: Parse the YAML content with schema validation
      const parseResult = parsePersonaYAML(
        content,
        filePath.split(/[/\\]/).pop() || "",
        {
          validateSchema: true,
          includeWarnings: options.includeWarnings ?? true,
        }
      );

      // Convert parse errors to validation errors
      if (!parseResult.success) {
        result.errors.push(...parseResult.errors);
        if (options.includeWarnings && parseResult.warnings.length > 0) {
          result.warnings.push(...parseResult.warnings);
        }
        return result;
      }

      if (!parseResult.data) {
        result.errors.push({
          type: "schema",
          message: "Failed to parse persona configuration",
          severity: "error",
        });
        return result;
      }

      // Step 3: Create validation context
      const context: ValidationContext = {
        personaPath: filePath,
        // Don't enforce folder name matching for explicit file validation
        expectedPersonaName: undefined,
        checkToolAvailability: options.checkToolAvailability,
        validateMcpConfig: options.validateMcpConfig,
        toolDiscoveryEngine: this.toolDiscoveryEngine,
        assets: {
          configFile: filePath,
          // Check for mcp.json in the same directory
          mcpConfigFile:
            (await this.findMcpConfigFile(dirname(filePath))) || undefined,
        },
      };

      // Step 4: Perform comprehensive validation
      const validationResult = await this.validatePersonaConfig(
        parseResult.data,
        context,
        options
      );

      return validationResult;
    } catch (error) {
      result.errors.push({
        type: "schema",
        message: `Failed to validate file "${filePath}": ${error instanceof Error ? error.message : String(error)}`,
        suggestion: "Check that the file exists and is accessible",
        severity: "error",
      });
      return result;
    }
  }

  /**
   * Validate a persona directory (containing persona.yaml/yml)
   *
   * @param directoryPath - Path to persona directory
   * @param options - Validation options
   * @returns Comprehensive validation result
   */
  public async validatePersonaDirectory(
    directoryPath: string,
    options: ValidationOptions = {}
  ): Promise<ValidationResult> {
    try {
      // First, check if directory exists
      const stats = await stat(directoryPath);
      if (!stats.isDirectory()) {
        return {
          isValid: false,
          errors: [
            {
              type: "schema",
              message: `Failed to validate directory "${directoryPath}": Path is not a directory`,
              severity: "error",
            },
          ],
          warnings: [],
        };
      }

      // Find the persona configuration file
      const configFile = await this.findPersonaConfigFile(directoryPath);

      if (!configFile) {
        return {
          isValid: false,
          errors: [
            {
              type: "schema",
              message: `No persona configuration file found in "${directoryPath}"`,
              suggestion: `Add a ${SUPPORTED_PERSONA_FILES.join(" or ")} file to the directory`,
              severity: "error",
            },
          ],
          warnings: [],
        };
      }

      return this.validatePersonaFile(configFile, options);
    } catch (error) {
      return {
        isValid: false,
        errors: [
          {
            type: "schema",
            message: `Failed to validate directory "${directoryPath}": ${error instanceof Error ? error.message : String(error)}`,
            severity: "error",
          },
        ],
        warnings: [],
      };
    }
  }

  /**
   * Validate business rules for persona configuration
   *
   * @param config - Persona configuration
   * @param context - Validation context
   * @returns Business rule validation result
   */
  private validateBusinessRules(
    config: PersonaConfig,
    context: ValidationContext
  ): ValidationResult {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
    };

    // Rule 1: Persona name must match folder name (if expected name provided)
    if (
      context.expectedPersonaName &&
      config.name !== context.expectedPersonaName
    ) {
      result.errors.push({
        type: "business",
        field: "name",
        message: `Persona name "${config.name}" does not match folder name "${context.expectedPersonaName}"`,
        suggestion: `Change the persona name to "${context.expectedPersonaName}" or rename the folder to "${config.name}"`,
        severity: "error",
      });
    }

    // Rule 2: Default toolset must exist in toolsets array (already checked by schema)
    // But we can provide better error messages here
    if (config.defaultToolset && config.toolsets) {
      const toolsetNames = config.toolsets.map((ts) => ts.name);
      if (!toolsetNames.includes(config.defaultToolset)) {
        result.errors.push({
          type: "business",
          field: "defaultToolset",
          message: `Default toolset "${config.defaultToolset}" is not defined in the toolsets array`,
          suggestion: `Add a toolset named "${config.defaultToolset}" or change the defaultToolset to one of: ${toolsetNames.join(", ")}`,
          severity: "error",
        });
      }
    }

    // Rule 3: No duplicate toolset names (already checked by schema)
    // But we can provide warnings for similar names
    if (config.toolsets && config.toolsets.length > 1) {
      const toolsetNames = config.toolsets.map((ts) => ts.name.toLowerCase());
      const seenNames = new Set<string>();
      const similarNames: string[] = [];

      for (const name of toolsetNames) {
        if (seenNames.has(name)) {
          similarNames.push(name);
        }
        seenNames.add(name);
      }

      // Check for similar names that might be confusing
      for (let i = 0; i < config.toolsets.length; i++) {
        for (let j = i + 1; j < config.toolsets.length; j++) {
          const name1 = config.toolsets[i].name;
          const name2 = config.toolsets[j].name;
          if (this.areNamesSimilar(name1, name2)) {
            result.warnings.push({
              type: "business",
              field: "toolsets",
              message: `Toolset names "${name1}" and "${name2}" are very similar and may be confusing`,
              suggestion: `Consider using more distinct names to avoid confusion`,
              severity: "warning",
            });
          }
        }
      }
    }

    // Rule 4: Warn if no toolsets defined
    if (!config.toolsets || config.toolsets.length === 0) {
      result.warnings.push({
        type: "business",
        field: "toolsets",
        message: "No toolsets defined in this persona",
        suggestion:
          "Consider adding at least one toolset to make this persona useful for tool management",
        severity: "warning",
      });
    }

    result.isValid = result.errors.length === 0;
    return result;
  }

  /**
   * Validate tool resolution against discovery engine
   *
   * @param config - Persona configuration
   * @param toolDiscoveryEngine - Tool discovery engine
   * @returns Tool resolution validation result
   */
  private async validateToolResolution(
    config: PersonaConfig,
    toolDiscoveryEngine: IToolDiscoveryEngine
  ): Promise<ValidationResult> {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
    };

    if (!config.toolsets) {
      return result; // No toolsets to validate
    }

    try {
      // Get available tools from discovery engine
      const availableTools = toolDiscoveryEngine.getAvailableTools(true); // connected only
      const availableToolIds = new Set(
        availableTools.map((tool) => tool.namespacedName)
      );

      for (const toolset of config.toolsets) {
        const unavailableTools: string[] = [];
        const warningTools: string[] = [];

        for (const toolId of toolset.toolIds) {
          if (!availableToolIds.has(toolId)) {
            // Check if tool exists but server is disconnected
            const allTools = toolDiscoveryEngine.getAvailableTools(false); // include disconnected
            const disconnectedTool = allTools.find(
              (tool) => tool.namespacedName === toolId
            );

            if (disconnectedTool) {
              warningTools.push(toolId);
            } else {
              unavailableTools.push(toolId);
            }
          }
        }

        // Report unavailable tools as errors
        if (unavailableTools.length > 0) {
          result.errors.push({
            type: "tool-resolution",
            field: `toolsets.${toolset.name}.toolIds`,
            message: `${unavailableTools.length} tool(s) in toolset "${toolset.name}" could not be resolved: ${unavailableTools.join(", ")}`,
            suggestion: `Check that the tool names are correct and that the required MCP servers are connected. Available tools can be listed with the discovery engine.`,
            severity: "error",
          });
        }

        // Report disconnected tools as warnings
        if (warningTools.length > 0) {
          result.warnings.push({
            type: "tool-resolution",
            field: `toolsets.${toolset.name}.toolIds`,
            message: `${warningTools.length} tool(s) in toolset "${toolset.name}" are from disconnected servers: ${warningTools.join(", ")}`,
            suggestion: `Connect the required MCP servers to use these tools. The tools exist but their servers are currently unavailable.`,
            severity: "warning",
          });
        }
      }
    } catch (error) {
      result.errors.push({
        type: "tool-resolution",
        message: `Failed to validate tool availability: ${error instanceof Error ? error.message : String(error)}`,
        suggestion: "Check the tool discovery engine connection and try again",
        severity: "error",
      });
    }

    result.isValid = result.errors.length === 0;
    return result;
  }

  /**
   * Validate MCP configuration file
   *
   * @param mcpConfigPath - Path to mcp.json file
   * @returns MCP config validation result
   */
  private async validateMcpConfig(
    mcpConfigPath: string
  ): Promise<ValidationResult> {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
    };

    try {
      const configContent = await readFile(mcpConfigPath, "utf-8");
      let mcpConfig: MCPConfig;

      try {
        mcpConfig = JSON.parse(configContent);
      } catch (parseError) {
        result.errors.push({
          type: "mcp-config",
          message: `Invalid JSON in MCP config file "${mcpConfigPath}": ${parseError instanceof Error ? parseError.message : String(parseError)}`,
          suggestion: "Fix the JSON syntax errors in the mcp.json file",
          severity: "error",
        });
        result.isValid = false;
        return result;
      }

      // Basic structure validation
      if (!mcpConfig.mcpServers || typeof mcpConfig.mcpServers !== "object") {
        result.errors.push({
          type: "mcp-config",
          field: "mcpServers",
          message: "MCP config must have an 'mcpServers' object",
          suggestion:
            "Add an 'mcpServers' object to the mcp.json file with server configurations",
          severity: "error",
        });
        result.isValid = false;
        return result;
      }

      // Validate each server configuration
      for (const [serverName, serverConfig] of Object.entries(
        mcpConfig.mcpServers
      )) {
        if (!serverConfig || typeof serverConfig !== "object") {
          result.errors.push({
            type: "mcp-config",
            field: `mcpServers.${serverName}`,
            message: `Server configuration for "${serverName}" must be an object`,
            severity: "error",
          });
          continue;
        }

        // Validate transport type
        if ("type" in serverConfig && serverConfig.type) {
          const validTypes = ["stdio", "http", "sse", "dxt-extension"];
          if (!validTypes.includes(serverConfig.type)) {
            result.errors.push({
              type: "mcp-config",
              field: `mcpServers.${serverName}.type`,
              message: `Invalid transport type "${serverConfig.type}" for server "${serverName}"`,
              suggestion: `Use one of: ${validTypes.join(", ")}`,
              severity: "error",
            });
          }
        }

        // Validate required fields based on type
        if ("type" in serverConfig && serverConfig.type) {
          const configType = serverConfig.type;

          if (configType === "stdio" && !("command" in serverConfig)) {
            result.errors.push({
              type: "mcp-config",
              field: `mcpServers.${serverName}.command`,
              message: `Stdio server "${serverName}" must have a 'command' field`,
              severity: "error",
            });
          }

          if (
            (configType === "http" || configType === "sse") &&
            !("url" in serverConfig)
          ) {
            result.errors.push({
              type: "mcp-config",
              field: `mcpServers.${serverName}.url`,
              message: `${configType.toUpperCase()} server "${serverName}" must have a 'url' field`,
              severity: "error",
            });
          }

          if (configType === "dxt-extension" && !("path" in serverConfig)) {
            result.errors.push({
              type: "mcp-config",
              field: `mcpServers.${serverName}.path`,
              message: `DXT extension "${serverName}" must have a 'path' field`,
              severity: "error",
            });
          }
        }
      }

      // Check for potential naming conflicts (warn about common server names)
      const serverNames = Object.keys(mcpConfig.mcpServers);
      const commonNames = ["git", "filesystem", "docker", "web", "api"];
      for (const serverName of serverNames) {
        if (commonNames.includes(serverName.toLowerCase())) {
          result.warnings.push({
            type: "mcp-config",
            field: `mcpServers.${serverName}`,
            message: `Server name "${serverName}" is commonly used and may conflict with other configurations`,
            suggestion:
              "Consider using a more specific server name to avoid potential conflicts",
            severity: "warning",
          });
        }
      }
    } catch (error) {
      result.errors.push({
        type: "mcp-config",
        message: `Failed to read MCP config file "${mcpConfigPath}": ${error instanceof Error ? error.message : String(error)}`,
        suggestion: "Check that the file exists and is readable",
        severity: "error",
      });
    }

    result.isValid = result.errors.length === 0;
    return result;
  }

  /**
   * Find persona configuration file in a directory
   *
   * @param directoryPath - Directory to search
   * @returns Path to config file or null if not found
   */
  private async findPersonaConfigFile(
    directoryPath: string
  ): Promise<string | null> {
    for (const filename of SUPPORTED_PERSONA_FILES) {
      const configPath = `${directoryPath}/${filename}`;
      try {
        await readFile(configPath, "utf-8");
        return configPath;
      } catch {
        // File doesn't exist, try next
        continue;
      }
    }
    return null;
  }

  /**
   * Find MCP config file in a directory
   *
   * @param directoryPath - Directory to search
   * @returns Path to mcp.json file or null if not found
   */
  private async findMcpConfigFile(
    directoryPath: string
  ): Promise<string | null> {
    const mcpConfigPath = `${directoryPath}/mcp.json`;
    try {
      await readFile(mcpConfigPath, "utf-8");
      return mcpConfigPath;
    } catch {
      return null;
    }
  }

  /**
   * Check if two names are similar enough to be confusing
   *
   * @param name1 - First name
   * @param name2 - Second name
   * @returns True if names are similar
   */
  private areNamesSimilar(name1: string, name2: string): boolean {
    // Simple similarity check - could be enhanced with more sophisticated algorithms
    const n1 = name1.toLowerCase().replace(/[-_\s]/g, "");
    const n2 = name2.toLowerCase().replace(/[-_\s]/g, "");

    // Check for very similar names (differing by 1-2 characters)
    if (Math.abs(n1.length - n2.length) <= 2) {
      let differences = 0;
      const maxLen = Math.max(n1.length, n2.length);
      for (let i = 0; i < maxLen; i++) {
        if (n1[i] !== n2[i]) {
          differences++;
          if (differences > 2) break;
        }
      }
      return differences <= 2;
    }

    return false;
  }

  /**
   * Merge validation results together
   *
   * @param target - Target validation result to merge into
   * @param source - Source validation result to merge from
   * @param includeWarnings - Whether to include warnings
   */
  private mergeValidationResults(
    target: ValidationResult,
    source: ValidationResult,
    includeWarnings: boolean = true
  ): void {
    target.errors.push(...source.errors);
    if (includeWarnings) {
      target.warnings.push(...source.warnings);
    }
    target.isValid = target.isValid && source.isValid;
  }

  /**
   * Set the tool discovery engine for this validator
   *
   * @param toolDiscoveryEngine - Tool discovery engine instance
   */
  public setToolDiscoveryEngine(
    toolDiscoveryEngine: IToolDiscoveryEngine
  ): void {
    this.toolDiscoveryEngine = toolDiscoveryEngine;
  }

  /**
   * Get validation statistics
   *
   * @returns Validation statistics
   */
  public getValidationStats(): {
    hasToolDiscoveryEngine: boolean;
    supportedFileTypes: readonly string[];
    validationLayers: string[];
  } {
    return {
      hasToolDiscoveryEngine: !!this.toolDiscoveryEngine,
      supportedFileTypes: SUPPORTED_PERSONA_FILES,
      validationLayers: [
        "YAML Syntax & Schema",
        "Business Rules",
        "Tool Resolution",
        "MCP Configuration",
      ],
    };
  }
}

/**
 * Create a default persona validator instance
 *
 * @param toolDiscoveryEngine - Optional tool discovery engine
 * @returns PersonaValidator instance
 */
export function createPersonaValidator(
  toolDiscoveryEngine?: IToolDiscoveryEngine
): PersonaValidator {
  return new PersonaValidator(toolDiscoveryEngine);
}

/**
 * Quick validation function for simple use cases
 *
 * @param filePath - Path to persona file or directory
 * @param toolDiscoveryEngine - Optional tool discovery engine
 * @param options - Validation options
 * @returns Validation result
 */
export async function validatePersona(
  filePath: string,
  toolDiscoveryEngine?: IToolDiscoveryEngine,
  options: ValidationOptions = {}
): Promise<ValidationResult> {
  const validator = new PersonaValidator(toolDiscoveryEngine);

  try {
    // Check if path exists and determine if it's a file or directory
    const stats = await stat(filePath);

    if (stats.isDirectory()) {
      return await validator.validatePersonaDirectory(filePath, options);
    } else if (stats.isFile()) {
      return await validator.validatePersonaFile(filePath, options);
    } else {
      return {
        isValid: false,
        errors: [
          {
            type: "schema",
            message: `Path must be a file or directory: ${filePath}`,
            severity: "error",
          },
        ],
        warnings: [],
      };
    }
  } catch (error) {
    // Handle file system errors (path doesn't exist, no permission, etc.)
    const nodeError = error as NodeJS.ErrnoException;
    return {
      isValid: false,
      errors: [
        {
          type: "schema",
          message:
            nodeError.code === "ENOENT"
              ? `Path does not exist: ${filePath}`
              : `Failed to access path: ${filePath} - ${nodeError.message}`,
          severity: "error",
        },
      ],
      warnings: [],
    };
  }
}

/**
 * Batch validation for multiple personas
 *
 * @param paths - Array of file or directory paths
 * @param toolDiscoveryEngine - Optional tool discovery engine
 * @param options - Validation options
 * @returns Map of path to validation result
 */
export async function validateMultiplePersonas(
  paths: string[],
  toolDiscoveryEngine?: IToolDiscoveryEngine,
  options: ValidationOptions = {}
): Promise<Map<string, ValidationResult>> {
  const validator = new PersonaValidator(toolDiscoveryEngine);
  const results = new Map<string, ValidationResult>();

  const validationPromises = paths.map(async (path) => {
    try {
      const result = await validatePersona(path, toolDiscoveryEngine, options);
      return { path, result };
    } catch (error) {
      return {
        path,
        result: {
          isValid: false,
          errors: [
            {
              type: "schema" as const,
              message: `Validation failed: ${error instanceof Error ? error.message : String(error)}`,
              severity: "error" as const,
            },
          ],
          warnings: [],
        },
      };
    }
  });

  const validationResults = await Promise.allSettled(validationPromises);

  validationResults.forEach((promiseResult, index) => {
    const path = paths[index];
    if (promiseResult.status === "fulfilled") {
      results.set(path, promiseResult.value.result);
    } else {
      results.set(path, {
        isValid: false,
        errors: [
          {
            type: "schema",
            message: `Validation failed: ${promiseResult.reason}`,
            severity: "error",
          },
        ],
        warnings: [],
      });
    }
  });

  return results;
}
