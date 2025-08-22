/**
 * YAML parser implementation for persona configuration files
 *
 * This module provides comprehensive YAML parsing functionality for persona.yaml/yml files
 * with robust error handling, line number preservation, and schema validation integration.
 *
 * @fileoverview Persona YAML parsing with comprehensive error handling
 */

import { readFile } from "fs/promises";
import { parse as parseYAML, YAMLParseError } from "yaml";
import {
  PersonaConfigSchema,
  validatePersonaConfig,
  SUPPORTED_PERSONA_FILES,
  isSupportedPersonaFile,
  type PersonaConfigData,
  type SchemaValidationResult,
} from "./schemas.js";
import {
  createYamlParseError,
  createFileSystemError,
  createSchemaValidationError,
  PersonaValidationError,
  type PersonaError,
} from "./errors.js";
import {
  type PersonaConfig,
  type ValidationResult,
  type PersonaValidationErrorInfo,
} from "./types.js";

/**
 * Result of YAML parsing operation
 */
export interface ParseResult<T = PersonaConfig> {
  /** Whether parsing was successful */
  success: boolean;

  /** Parsed and validated data if successful */
  data?: T;

  /** Parsing or validation errors */
  errors: PersonaValidationErrorInfo[];

  /** Parsing or validation warnings */
  warnings: PersonaValidationErrorInfo[];

  /** Raw YAML parsing errors with line numbers (if any) */
  yamlErrors?: YAMLError[];
}

/**
 * YAML parsing error with line number information
 */
export interface YAMLError {
  /** Error message from YAML parser */
  message: string;

  /** Line number where error occurred */
  line?: number;

  /** Column number where error occurred */
  column?: number;

  /** Error name/type from YAML parser */
  name?: string;

  /** Original error for debugging */
  originalError: Error;
}

/**
 * Options for YAML parsing
 */
export interface ParseOptions {
  /** Whether to perform schema validation after parsing */
  validateSchema?: boolean;

  /** Whether to include warnings in the result */
  includeWarnings?: boolean;

  /** Custom validation beyond schema (business rules, etc.) */
  customValidation?: (data: PersonaConfigData) => ValidationResult;
}

/**
 * Parse persona YAML content from string
 *
 * @param content - YAML content as string
 * @param filename - Optional filename for error reporting
 * @param options - Parse options
 * @returns Parse result with data, errors, and warnings
 */
export function parsePersonaYAML(
  content: string,
  filename?: string,
  options: ParseOptions = {}
): ParseResult<PersonaConfig> {
  const { validateSchema = true, includeWarnings = true } = options;
  const result: ParseResult<PersonaConfig> = {
    success: false,
    errors: [],
    warnings: [],
  };

  // Step 1: Parse YAML syntax
  let rawData: unknown;
  try {
    rawData = parseYAML(content);
  } catch (error) {
    // Handle YAML parsing errors
    const yamlError = extractYAMLError(error, filename);
    result.yamlErrors = [yamlError];

    result.errors.push({
      type: "schema",
      message: yamlError.message,
      suggestion: generateYAMLErrorSuggestion(yamlError),
      severity: "error",
    });

    return result;
  }

  // Step 2: Schema validation (if enabled)
  if (validateSchema) {
    const schemaResult = validatePersonaConfig(rawData);

    if (!schemaResult.success) {
      // Convert schema errors to PersonaValidationErrorInfo
      result.errors.push(
        ...schemaResult.errors.map((error) => ({
          type: "schema" as const,
          field: error.path,
          message: error.message,
          suggestion: error.suggestion,
          severity: "error" as const,
        }))
      );

      // Add warnings from schema validation
      if (includeWarnings && schemaResult.warnings.length > 0) {
        result.warnings.push(
          ...schemaResult.warnings.map((warning) => ({
            type: "schema" as const,
            field: warning.path,
            message: warning.message,
            suggestion: warning.suggestion,
            severity: "warning" as const,
          }))
        );
      }

      return result;
    }

    // Schema validation successful - assign validated data
    result.data = schemaResult.data as PersonaConfig;
  } else {
    // No schema validation - use raw data (type assertion)
    result.data = rawData as PersonaConfig;
  }

  // Step 3: Custom validation (if provided)
  if (options.customValidation && result.data) {
    const customResult = options.customValidation(result.data);

    // Convert custom validation errors
    result.errors.push(
      ...customResult.errors.map((error) => ({
        type: "business" as const,
        message: error.message,
        severity: "error" as const,
      }))
    );

    // Add custom warnings
    if (includeWarnings) {
      result.warnings.push(
        ...customResult.warnings.map((warning) => ({
          type: "business" as const,
          message: warning.message,
          severity: "warning" as const,
        }))
      );
    }

    // If custom validation failed, don't mark as success
    if (!customResult.isValid) {
      return result;
    }
  }

  // Step 4: Success if no errors
  result.success = result.errors.length === 0;
  return result;
}

/**
 * Parse persona YAML file from file system
 *
 * @param filePath - Path to the YAML file
 * @param options - Parse options
 * @returns Parse result with data, errors, and warnings
 */
export async function parsePersonaYAMLFile(
  filePath: string,
  options: ParseOptions = {}
): Promise<ParseResult<PersonaConfig>> {
  // Validate file extension
  const filename = filePath.split(/[/\\]/).pop() || "";
  if (!isSupportedPersonaFile(filename)) {
    return {
      success: false,
      errors: [
        {
          type: "schema",
          message: `Unsupported file type: ${filename}. Expected: ${SUPPORTED_PERSONA_FILES.join(" or ")}`,
          suggestion: `Rename the file to use one of the supported extensions: ${SUPPORTED_PERSONA_FILES.join(", ")}`,
          severity: "error",
        },
      ],
      warnings: [],
    };
  }

  // Read file content
  let content: string;
  try {
    content = await readFile(filePath, "utf-8");
  } catch (error) {
    const fsError = error as NodeJS.ErrnoException;

    return {
      success: false,
      errors: [
        {
          type: "schema",
          message: `Failed to read file "${filePath}": ${fsError.message}`,
          suggestion:
            fsError.code === "ENOENT"
              ? `Verify that the file exists at "${filePath}"`
              : fsError.code === "EACCES"
                ? `Check file permissions for "${filePath}"`
                : `Check file accessibility and try again`,
          severity: "error",
        },
      ],
      warnings: [],
    };
  }

  // Parse the content
  return parsePersonaYAML(content, filename, options);
}

/**
 * Check if a file is a persona configuration file
 *
 * @param filePath - Path to check
 * @returns True if the file appears to be a persona config
 */
export function isPersonaConfigFile(filePath: string): boolean {
  const filename = filePath.split(/[/\\]/).pop() || "";
  return isSupportedPersonaFile(filename);
}

/**
 * Get supported persona file extensions
 *
 * @returns Array of supported file extensions
 */
export function getSupportedPersonaFiles(): readonly string[] {
  return SUPPORTED_PERSONA_FILES;
}

/**
 * Extract YAML parsing error information
 *
 * @param error - Error from YAML parsing
 * @param filename - Optional filename for context
 * @returns Structured YAML error information
 */
function extractYAMLError(error: unknown, filename?: string): YAMLError {
  if (error instanceof YAMLParseError) {
    // YAML parser provides structured error information
    const linePos = error.linePos?.[0];
    return {
      message: error.message,
      line: linePos?.line,
      column: linePos?.col,
      name: error.name,
      originalError: error,
    };
  }

  // Generic error - try to extract line information from message
  const errorMessage = error instanceof Error ? error.message : String(error);
  const lineMatch = errorMessage.match(/line (\d+)/i);
  const columnMatch = errorMessage.match(/column (\d+)/i);

  return {
    message: filename
      ? `YAML parsing error in ${filename}: ${errorMessage}`
      : `YAML parsing error: ${errorMessage}`,
    line: lineMatch ? parseInt(lineMatch[1], 10) : undefined,
    column: columnMatch ? parseInt(columnMatch[1], 10) : undefined,
    originalError: error instanceof Error ? error : new Error(String(error)),
  };
}

/**
 * Generate helpful suggestions for YAML parsing errors
 *
 * @param yamlError - YAML error information
 * @returns Suggested fix for the error
 */
function generateYAMLErrorSuggestion(yamlError: YAMLError): string {
  const message = yamlError.message.toLowerCase();

  // Common YAML error patterns and suggestions
  if (message.includes("tab") || message.includes("indentation")) {
    return "Use spaces for indentation, not tabs. YAML requires consistent spacing.";
  }

  if (message.includes("expected") && message.includes("found")) {
    return "Check YAML syntax - ensure proper structure with colons, dashes, and indentation.";
  }

  if (message.includes("string")) {
    return "Wrap string values in quotes if they contain special characters or start with reserved words.";
  }

  if (message.includes("duplicate")) {
    return "Remove or rename duplicate keys - each key in a YAML object must be unique.";
  }

  if (message.includes("anchor") || message.includes("alias")) {
    return "Check YAML anchor (&) and alias (*) syntax for correct format and matching names.";
  }

  // Generic suggestions based on line/column information
  if (yamlError.line && yamlError.column) {
    return `Check the syntax around line ${yamlError.line}, column ${yamlError.column}. Verify proper indentation and YAML structure.`;
  }

  if (yamlError.line) {
    return `Check the syntax around line ${yamlError.line}. Verify proper indentation and YAML structure.`;
  }

  return "Validate YAML syntax using an online YAML validator or editor with YAML support.";
}

/**
 * Create a validation result from parsing errors
 *
 * @param parseResult - Parse result to convert
 * @returns ValidationResult compatible with existing patterns
 */
export function parseResultToValidationResult(
  parseResult: ParseResult
): ValidationResult {
  return {
    isValid: parseResult.success,
    errors: parseResult.errors,
    warnings: parseResult.warnings,
  };
}

/**
 * Parse multiple persona YAML files concurrently
 *
 * @param filePaths - Array of file paths to parse
 * @param options - Parse options
 * @returns Map of file paths to parse results
 */
export async function parseMultiplePersonaFiles(
  filePaths: string[],
  options: ParseOptions = {}
): Promise<Map<string, ParseResult<PersonaConfig>>> {
  const results = new Map<string, ParseResult<PersonaConfig>>();

  // Parse all files concurrently
  const parsePromises = filePaths.map(async (filePath) => {
    const result = await parsePersonaYAMLFile(filePath, options);
    return { filePath, result };
  });

  const parsedResults = await Promise.allSettled(parsePromises);

  // Process results
  parsedResults.forEach((promiseResult, index) => {
    const filePath = filePaths[index];

    if (promiseResult.status === "fulfilled") {
      results.set(filePath, promiseResult.value.result);
    } else {
      // Handle promise rejection
      results.set(filePath, {
        success: false,
        errors: [
          {
            type: "schema",
            message: `Failed to parse ${filePath}: ${promiseResult.reason}`,
            severity: "error",
          },
        ],
        warnings: [],
      });
    }
  });

  return results;
}

/**
 * Validate raw YAML content without full parsing
 *
 * Quick validation to check if content is valid YAML syntax
 * without performing schema validation or data processing.
 *
 * @param content - YAML content to validate
 * @returns True if YAML syntax is valid
 */
export function isValidYAMLSyntax(content: string): boolean {
  try {
    parseYAML(content, { strict: false });
    return true;
  } catch {
    return false;
  }
}

/**
 * Extract persona name from parsed YAML content
 *
 * @param content - YAML content
 * @returns Persona name if found, undefined otherwise
 */
export function extractPersonaNameFromYAML(
  content: string
): string | undefined {
  try {
    const data = parseYAML(content, { strict: false });
    if (data && typeof data === "object" && "name" in data) {
      return typeof data.name === "string" ? data.name : undefined;
    }
  } catch {
    // Ignore parsing errors for quick extraction
  }
  return undefined;
}
