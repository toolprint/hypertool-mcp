/**
 * Custom error classes and factory functions for persona operations
 *
 * This module provides a comprehensive error handling system for the persona
 * content pack system, including typed error codes, detailed error messages,
 * and actionable suggestions for resolution.
 *
 * @fileoverview Persona system error handling and custom error types
 */

import { PersonaErrorCode, type PersonaErrorInterface } from "./types.js";

/**
 * Base persona error class
 *
 * Custom error class for persona operations that includes error codes,
 * additional details, and actionable suggestions for resolution.
 */
export class PersonaError extends Error implements PersonaErrorInterface {
  /** Specific error code for programmatic handling */
  public readonly code: PersonaErrorCode;

  /** Additional error details */
  public readonly details: Record<string, any>;

  /** Actionable suggestions for resolving the error */
  public readonly suggestions: string[];

  /** Whether the error is recoverable */
  public readonly recoverable: boolean;

  constructor(
    code: PersonaErrorCode,
    message: string,
    options: {
      details?: Record<string, any>;
      suggestions?: string[];
      recoverable?: boolean;
      cause?: Error;
    } = {}
  ) {
    super(message, { cause: options.cause });

    this.name = "PersonaError";
    this.code = code;
    this.details = options.details ?? {};
    this.suggestions = options.suggestions ?? [];
    this.recoverable = options.recoverable ?? false;

    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, PersonaError);
    }
  }

  /**
   * Create a formatted error message that includes suggestions
   */
  public getFormattedMessage(): string {
    let message = `[${this.code}] ${this.message}`;

    if (this.suggestions.length > 0) {
      message += "\n\nSuggestions:";
      this.suggestions.forEach((suggestion, index) => {
        message += `\n  ${index + 1}. ${suggestion}`;
      });
    }

    if (Object.keys(this.details).length > 0) {
      message += `\n\nDetails: ${JSON.stringify(this.details, null, 2)}`;
    }

    return message;
  }

  /**
   * Serialize error to JSON for logging or transmission
   */
  public toJSON(): Record<string, any> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      details: this.details,
      suggestions: this.suggestions,
      recoverable: this.recoverable,
      stack: this.stack,
    };
  }
}

/**
 * Discovery-specific persona error
 */
export class PersonaDiscoveryError extends PersonaError {
  constructor(
    code:
      | PersonaErrorCode.PERSONA_NOT_FOUND
      | PersonaErrorCode.PERMISSION_DENIED
      | PersonaErrorCode.FILE_SYSTEM_ERROR,
    message: string,
    options: {
      details?: Record<string, any>;
      suggestions?: string[];
      recoverable?: boolean;
      cause?: Error;
    } = {}
  ) {
    super(code, message, {
      ...options,
      recoverable: options.recoverable ?? true,
    });
    this.name = "PersonaDiscoveryError";
  }
}

/**
 * Validation-specific persona error
 */
export class PersonaValidationError extends PersonaError {
  constructor(
    code:
      | PersonaErrorCode.INVALID_SCHEMA
      | PersonaErrorCode.VALIDATION_FAILED
      | PersonaErrorCode.YAML_PARSE_ERROR
      | PersonaErrorCode.DUPLICATE_PERSONA_NAME,
    message: string,
    options: {
      details?: Record<string, any>;
      suggestions?: string[];
      recoverable?: boolean;
      cause?: Error;
    } = {}
  ) {
    super(code, message, {
      ...options,
      recoverable: options.recoverable ?? true,
    });
    this.name = "PersonaValidationError";
  }
}

/**
 * Activation-specific persona error
 */
export class PersonaActivationError extends PersonaError {
  constructor(
    code:
      | PersonaErrorCode.ACTIVATION_FAILED
      | PersonaErrorCode.TOOLSET_NOT_FOUND
      | PersonaErrorCode.TOOL_RESOLUTION_FAILED
      | PersonaErrorCode.MCP_CONFIG_CONFLICT,
    message: string,
    options: {
      details?: Record<string, any>;
      suggestions?: string[];
      recoverable?: boolean;
      cause?: Error;
    } = {}
  ) {
    super(code, message, {
      ...options,
      recoverable: options.recoverable ?? false,
    });
    this.name = "PersonaActivationError";
  }
}

/**
 * Runtime-specific persona error
 */
export class PersonaRuntimeError extends PersonaError {
  constructor(
    code:
      | PersonaErrorCode.FILE_SYSTEM_ERROR
      | PersonaErrorCode.ARCHIVE_EXTRACTION_FAILED,
    message: string,
    options: {
      details?: Record<string, any>;
      suggestions?: string[];
      recoverable?: boolean;
      cause?: Error;
    } = {}
  ) {
    super(code, message, {
      ...options,
      recoverable: options.recoverable ?? false,
    });
    this.name = "PersonaRuntimeError";
  }
}

// Factory functions for common error types

/**
 * Create a persona not found error
 */
export function createPersonaNotFoundError(
  personaName: string,
  searchPaths: string[] = []
): PersonaDiscoveryError {
  return new PersonaDiscoveryError(
    PersonaErrorCode.PERSONA_NOT_FOUND,
    `Persona "${personaName}" was not found in any configured search paths.`,
    {
      details: { personaName, searchPaths },
      suggestions: [
        `Verify that the persona name "${personaName}" is correct`,
        "Check if the persona folder exists in one of the search paths",
        "Ensure the persona folder contains a valid persona.yaml or persona.yml file",
        "Use 'hypertool persona list' to see available personas",
        searchPaths.length > 0
          ? `Current search paths: ${searchPaths.join(", ")}`
          : "Consider adding custom search paths to your configuration",
      ],
      recoverable: true,
    }
  );
}

/**
 * Create a schema validation error
 */
export function createSchemaValidationError(
  field: string,
  value: any,
  expectedType: string,
  cause?: Error
): PersonaValidationError {
  return new PersonaValidationError(
    PersonaErrorCode.INVALID_SCHEMA,
    `Invalid schema: field "${field}" expected ${expectedType}, got ${typeof value}`,
    {
      details: { field, value, expectedType },
      suggestions: [
        `Ensure field "${field}" is of type ${expectedType}`,
        "Check the persona.yaml file for syntax errors",
        "Refer to the persona schema documentation for valid field formats",
        "Use a YAML validator to check file structure",
      ],
      recoverable: true,
      cause,
    }
  );
}

/**
 * Create a YAML parsing error
 */
export function createYamlParseError(
  filePath: string,
  line?: number,
  column?: number,
  cause?: Error
): PersonaValidationError {
  const lineInfo = line && column ? ` at line ${line}, column ${column}` : "";
  return new PersonaValidationError(
    PersonaErrorCode.YAML_PARSE_ERROR,
    `Failed to parse YAML file "${filePath}"${lineInfo}`,
    {
      details: { filePath, line, column },
      suggestions: [
        "Check the YAML file for syntax errors",
        "Ensure proper indentation (use spaces, not tabs)",
        "Verify that strings with special characters are properly quoted",
        "Use a YAML validator to identify syntax issues",
        line && column
          ? `Focus on line ${line}, column ${column}`
          : "Check the entire file structure",
      ],
      recoverable: true,
      cause,
    }
  );
}

/**
 * Create a tool resolution error
 */
export function createToolResolutionError(
  toolIds: string[],
  unavailableTools: string[]
): PersonaActivationError {
  return new PersonaActivationError(
    PersonaErrorCode.TOOL_RESOLUTION_FAILED,
    `Failed to resolve ${unavailableTools.length} out of ${toolIds.length} tools`,
    {
      details: { requestedTools: toolIds, unavailableTools },
      suggestions: [
        "Ensure all required MCP servers are connected and running",
        "Check that tool names follow the correct format (e.g., 'server.toolName')",
        "Use 'hypertool toolset list-tools' to see available tools",
        "Update your persona configuration to remove unavailable tools",
        unavailableTools.length <= 3
          ? `Unavailable tools: ${unavailableTools.join(", ")}`
          : `First few unavailable tools: ${unavailableTools.slice(0, 3).join(", ")}...`,
      ],
      recoverable: false,
    }
  );
}

/**
 * Create a toolset not found error
 */
export function createToolsetNotFoundError(
  toolsetName: string,
  availableToolsets: string[]
): PersonaActivationError {
  return new PersonaActivationError(
    PersonaErrorCode.TOOLSET_NOT_FOUND,
    `Toolset "${toolsetName}" not found in persona configuration`,
    {
      details: { requestedToolset: toolsetName, availableToolsets },
      suggestions: [
        `Verify that toolset "${toolsetName}" is defined in the persona.yaml file`,
        availableToolsets.length > 0
          ? `Available toolsets: ${availableToolsets.join(", ")}`
          : "No toolsets are defined in this persona",
        "Check for typos in the toolset name",
        "Consider using the default toolset if one is configured",
      ],
      recoverable: true,
    }
  );
}

/**
 * Create a file system permission error
 */
export function createPermissionError(
  operation: string,
  path: string,
  cause?: Error
): PersonaDiscoveryError {
  return new PersonaDiscoveryError(
    PersonaErrorCode.PERMISSION_DENIED,
    `Permission denied while ${operation} "${path}"`,
    {
      details: { operation, path },
      suggestions: [
        `Check file permissions for "${path}"`,
        "Ensure the current user has read access to the directory",
        "Consider running with appropriate permissions",
        "Verify that the path exists and is accessible",
      ],
      recoverable: true,
      cause,
    }
  );
}

/**
 * Create a file system error
 */
export function createFileSystemError(
  operation: string,
  path: string,
  cause?: Error
): PersonaRuntimeError {
  return new PersonaRuntimeError(
    PersonaErrorCode.FILE_SYSTEM_ERROR,
    `File system error during ${operation} of "${path}"`,
    {
      details: { operation, path },
      suggestions: [
        `Verify that the path "${path}" exists`,
        "Check available disk space",
        "Ensure the file system is not read-only",
        "Check for file locks or other processes using the file",
        "Try the operation again after a brief moment",
      ],
      recoverable: true,
      cause,
    }
  );
}

/**
 * Create an MCP configuration conflict error
 */
export function createMcpConfigConflictError(
  conflictingKeys: string[],
  personaName: string
): PersonaActivationError {
  return new PersonaActivationError(
    PersonaErrorCode.MCP_CONFIG_CONFLICT,
    `MCP configuration conflict when activating persona "${personaName}"`,
    {
      details: { conflictingKeys, personaName },
      suggestions: [
        "Review the persona's mcp.json file for conflicting server configurations",
        `Conflicting configuration keys: ${conflictingKeys.join(", ")}`,
        "Consider renaming servers in the persona's MCP config to avoid conflicts",
        "Remove duplicate server configurations",
        "Use different transport configurations for conflicting servers",
      ],
      recoverable: false,
    }
  );
}

/**
 * Create a duplicate persona name error
 */
export function createDuplicatePersonaNameError(
  personaName: string,
  existingPaths: string[]
): PersonaValidationError {
  return new PersonaValidationError(
    PersonaErrorCode.DUPLICATE_PERSONA_NAME,
    `Duplicate persona name "${personaName}" found in multiple locations`,
    {
      details: { personaName, existingPaths },
      suggestions: [
        `Rename one of the personas to have a unique name`,
        `Existing paths: ${existingPaths.join(", ")}`,
        "Ensure each persona folder has a unique name",
        "Consider using more descriptive names to avoid conflicts",
        "Remove unused or duplicate persona folders",
      ],
      recoverable: true,
    }
  );
}

/**
 * Create an activation failed error
 */
export function createActivationFailedError(
  personaName: string,
  reason: string,
  cause?: Error
): PersonaActivationError {
  return new PersonaActivationError(
    PersonaErrorCode.ACTIVATION_FAILED,
    `Failed to activate persona "${personaName}": ${reason}`,
    {
      details: { personaName, reason },
      suggestions: [
        "Validate the persona configuration using 'hypertool persona validate'",
        "Check that all required MCP servers are running",
        "Ensure there are no validation errors in the persona",
        "Try deactivating any currently active persona first",
        "Check the logs for more detailed error information",
      ],
      recoverable: false,
      cause,
    }
  );
}

/**
 * Create an archive extraction error
 */
export function createArchiveExtractionError(
  archivePath: string,
  cause?: Error
): PersonaRuntimeError {
  return new PersonaRuntimeError(
    PersonaErrorCode.ARCHIVE_EXTRACTION_FAILED,
    `Failed to extract persona archive "${archivePath}"`,
    {
      details: { archivePath },
      suggestions: [
        "Verify that the archive file is not corrupted",
        "Check available disk space for extraction",
        "Ensure the archive format is supported (.htp)",
        "Try extracting the archive manually to verify its integrity",
        "Check file permissions for the archive and target directory",
      ],
      recoverable: false,
      cause,
    }
  );
}

/**
 * Check if an error is a PersonaError
 */
export function isPersonaError(error: any): error is PersonaError {
  return error instanceof PersonaError;
}

/**
 * Check if a PersonaError is recoverable
 */
export function isRecoverableError(error: PersonaError): boolean {
  return error.recoverable;
}

/**
 * Extract error code from any error (returns undefined for non-PersonaErrors)
 */
export function getErrorCode(error: any): PersonaErrorCode | undefined {
  return isPersonaError(error) ? error.code : undefined;
}

/**
 * Format an error for user-friendly display
 */
export function formatErrorForUser(error: PersonaError): string {
  return error.getFormattedMessage();
}

/**
 * Create a summary of multiple errors for batch operations
 */
export function createErrorSummary(errors: PersonaError[]): string {
  if (errors.length === 0) return "No errors";

  const errorsByType = errors.reduce(
    (acc, error) => {
      const type = error.name;
      if (!acc[type]) acc[type] = [];
      acc[type].push(error);
      return acc;
    },
    {} as Record<string, PersonaError[]>
  );

  let summary = `Found ${errors.length} error${errors.length > 1 ? "s" : ""}:\n\n`;

  for (const [type, typeErrors] of Object.entries(errorsByType)) {
    summary += `${type} (${typeErrors.length}):\n`;
    typeErrors.forEach((error, index) => {
      summary += `  ${index + 1}. [${error.code}] ${error.message}\n`;
    });
    summary += "\n";
  }

  const recoverableCount = errors.filter((e) => e.recoverable).length;
  if (recoverableCount > 0) {
    summary += `Note: ${recoverableCount} error${recoverableCount > 1 ? "s are" : " is"} recoverable and may be retried.\n`;
  }

  return summary;
}
