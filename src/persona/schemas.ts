/**
 * Zod schemas for persona configuration validation
 *
 * This module provides comprehensive validation schemas for persona YAML configurations
 * using Zod. It includes validation for structure, format requirements, and business rules.
 *
 * @fileoverview Persona YAML configuration validation schemas
 */

import { z } from "zod";

/**
 * Schema for persona name validation
 *
 * Names must be hyphen-delimited lowercase following the pattern:
 * - Start with a lowercase letter (a-z)
 * - Contain only lowercase letters, numbers, and hyphens
 * - End with a lowercase letter or number
 * - No consecutive hyphens allowed
 */
export const PersonaNameSchema = z
  .string()
  .min(2, "Persona name must be at least 2 characters long")
  .max(63, "Persona name must not exceed 63 characters")
  .regex(
    /^[a-z][a-z0-9-]*[a-z0-9]$/,
    "Persona name must be hyphen-delimited lowercase (e.g., 'dev-tools', 'backend-api')"
  )
  .refine(
    (name) => !name.includes("--"),
    "Persona name cannot contain consecutive hyphens"
  );

/**
 * Schema for tool ID validation
 *
 * Tool IDs must follow the namespacedName format with MCP server prefix.
 * Supports compound tool names with multiple segments separated by dots.
 * Examples: "git.status", "docker.compose.up", "testing.unit.run", "linear.create-issue"
 */
export const ToolIdSchema = z
  .string()
  .min(3, "Tool ID must be at least 3 characters long")
  .regex(
    /^[a-zA-Z][a-zA-Z0-9_-]*(\.[a-zA-Z][a-zA-Z0-9_-]*)+$/,
    "Tool ID must follow namespacedName format (e.g., 'server.tool_name' or 'server.compound-tool_name')"
  );

/**
 * Schema for persona toolset configuration
 *
 * Validates individual toolset within a persona configuration
 */
export const PersonaToolsetSchema = z.object({
  name: PersonaNameSchema.describe("Toolset name (hyphen-delimited lowercase)"),
  toolIds: z
    .array(ToolIdSchema)
    .min(1, "Toolset must contain at least one tool ID")
    .describe("Array of tool IDs with MCP server prefix"),
});

/**
 * Schema for persona metadata
 *
 * Optional metadata fields for persona information
 */
export const PersonaMetadataSchema = z
  .object({
    author: z.string().optional().describe("Persona author"),
    tags: z
      .array(z.string().min(1, "Tag cannot be empty"))
      .optional()
      .describe("Categorization tags"),
    created: z.string().optional().describe("Creation timestamp (ISO string)"),
    lastModified: z
      .string()
      .optional()
      .describe("Last modification timestamp (ISO string)"),
  })
  .strict()
  .describe("Additional metadata for the persona");

/**
 * Main persona configuration schema
 *
 * Validates the complete structure of a persona.yaml/yml file
 */
export const PersonaConfigSchema = z
  .object({
    name: PersonaNameSchema.describe("Persona name (must match folder name)"),
    description: z
      .string()
      .min(10, "Description must be at least 10 characters long")
      .max(500, "Description must not exceed 500 characters")
      .describe("Human-readable description of the persona"),
    toolsets: z
      .array(PersonaToolsetSchema)
      .optional()
      .describe("Optional array of toolset configurations"),
    defaultToolset: z
      .string()
      .optional()
      .describe("Optional default toolset name (must exist in toolsets array)"),
    version: z
      .string()
      .optional()
      .describe("Schema version for future compatibility"),
    metadata: PersonaMetadataSchema.optional().describe("Additional metadata"),
  })
  .strict()
  .describe("Main persona configuration schema")
  .superRefine((data, ctx) => {
    // Validate defaultToolset exists in toolsets array
    if (data.defaultToolset && data.toolsets) {
      const toolsetNames = data.toolsets.map((ts) => ts.name);
      if (!toolsetNames.includes(data.defaultToolset)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["defaultToolset"],
          message: `Default toolset "${data.defaultToolset}" must exist in the toolsets array. Available toolsets: ${toolsetNames.join(", ")}`,
        });
      }
    } else if (data.defaultToolset && !data.toolsets) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["defaultToolset"],
        message: "Cannot specify defaultToolset without defining any toolsets",
      });
    }

    // Validate no duplicate toolset names
    if (data.toolsets && data.toolsets.length > 1) {
      const toolsetNames = data.toolsets.map((ts) => ts.name);
      const duplicates = toolsetNames.filter(
        (name, index) => toolsetNames.indexOf(name) !== index
      );
      if (duplicates.length > 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["toolsets"],
          message: `Duplicate toolset names found: ${duplicates.join(", ")}. Each toolset must have a unique name.`,
        });
      }
    }

    // Validate no duplicate tool IDs within the same toolset
    if (data.toolsets) {
      data.toolsets.forEach((toolset, toolsetIndex) => {
        const toolIds = toolset.toolIds;
        const duplicateTools = toolIds.filter(
          (toolId, index) => toolIds.indexOf(toolId) !== index
        );
        if (duplicateTools.length > 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["toolsets", toolsetIndex, "toolIds"],
            message: `Duplicate tool IDs found in toolset "${toolset.name}": ${duplicateTools.join(", ")}`,
          });
        }
      });
    }
  });

/**
 * Type inference for PersonaConfig
 */
export type PersonaConfigData = z.infer<typeof PersonaConfigSchema>;

/**
 * Type inference for PersonaToolset
 */
export type PersonaToolsetData = z.infer<typeof PersonaToolsetSchema>;

/**
 * Type inference for PersonaMetadata
 */
export type PersonaMetadataData = z.infer<typeof PersonaMetadataSchema>;

/**
 * Validation result with enhanced error information
 */
export interface SchemaValidationResult {
  /** Whether validation passed */
  success: boolean;
  /** Parsed and validated data if successful */
  data?: PersonaConfigData;
  /** Validation errors with field paths */
  errors: SchemaValidationError[];
  /** Validation warnings */
  warnings: SchemaValidationError[];
}

/**
 * Enhanced validation error with field path information
 */
export interface SchemaValidationError {
  /** Field path where the error occurred */
  path: string;
  /** Error message */
  message: string;
  /** Error code from Zod */
  code: string;
  /** Expected value or type */
  expected?: string;
  /** Received value */
  received?: any;
  /** Suggested fix */
  suggestion?: string;
}

/**
 * Validate persona configuration against schema
 *
 * @param data - Raw persona configuration data to validate
 * @returns Detailed validation result with errors and suggestions
 */
export function validatePersonaConfig(data: unknown): SchemaValidationResult {
  const result = PersonaConfigSchema.safeParse(data);

  if (result.success) {
    return {
      success: true,
      data: result.data,
      errors: [],
      warnings: [],
    };
  }

  const errors: SchemaValidationError[] = result.error.issues.map((issue) => {
    const path = issue.path.join(".");
    const suggestion = generateSuggestion(issue);

    return {
      path: path || "root",
      message: issue.message,
      code: issue.code,
      expected: "expected" in issue ? String(issue.expected) : undefined,
      received: "received" in issue ? issue.received : undefined,
      suggestion,
    };
  });

  return {
    success: false,
    errors,
    warnings: [],
  };
}

/**
 * Validate just the toolset array
 *
 * @param toolsets - Array of toolset configurations to validate
 * @returns Validation result for toolsets
 */
export function validatePersonaToolsets(
  toolsets: unknown
): SchemaValidationResult {
  const schema = z.array(PersonaToolsetSchema);
  const result = schema.safeParse(toolsets);

  if (result.success) {
    return {
      success: true,
      data: result.data as any, // Type assertion for compatibility
      errors: [],
      warnings: [],
    };
  }

  const errors: SchemaValidationError[] = result.error.issues.map((issue) => {
    const path = issue.path.join(".");
    const suggestion = generateSuggestion(issue);

    return {
      path: path || "toolsets",
      message: issue.message,
      code: issue.code,
      expected: "expected" in issue ? String(issue.expected) : undefined,
      received: "received" in issue ? issue.received : undefined,
      suggestion,
    };
  });

  return {
    success: false,
    errors,
    warnings: [],
  };
}

/**
 * Generate helpful suggestions based on validation errors
 *
 * @param issue - Zod validation issue
 * @returns Suggested fix for the validation error
 */
function generateSuggestion(issue: z.ZodIssue): string {
  const path = issue.path.join(".");

  switch (issue.code) {
    case z.ZodIssueCode.invalid_type:
      if (path === "name") {
        return "Ensure the persona name is a string with hyphen-delimited lowercase format";
      }
      if (path === "description") {
        return "Provide a string description that's at least 10 characters long";
      }
      if (path.includes("toolIds")) {
        return "Ensure toolIds is an array of strings in namespacedName format";
      }
      return `Ensure ${path} is of the correct type`;

    case z.ZodIssueCode.too_small:
      if (path === "description") {
        return "Add more detail to the description (minimum 10 characters)";
      }
      if (path.includes("toolIds")) {
        return "Add at least one tool ID to the toolset";
      }
      if (path === "name") {
        return "Persona name must be at least 2 characters long";
      }
      return `Provide a longer value for ${path}`;

    case z.ZodIssueCode.too_big:
      if (path === "description") {
        return "Shorten the description to 500 characters or less";
      }
      if (path === "name") {
        return "Shorten the persona name to 63 characters or less";
      }
      return `Provide a shorter value for ${path}`;

    case z.ZodIssueCode.invalid_string:
      if (path === "name") {
        return "Use hyphen-delimited lowercase format: letters, numbers, and hyphens only (e.g., 'dev-tools')";
      }
      if (path.includes("toolIds")) {
        return "Use namespacedName format: 'server.tool-name' or 'server.compound.tool-name' (e.g., 'git.status', 'docker.compose.up')";
      }
      return `Follow the required format for ${path}`;

    case z.ZodIssueCode.custom:
      // Custom validation errors already have descriptive messages
      if (issue.message.includes("defaultToolset")) {
        return "Remove the defaultToolset field or add the referenced toolset to the toolsets array";
      }
      if (issue.message.includes("Duplicate")) {
        return "Ensure all names are unique within their respective arrays";
      }
      return "Check the validation rules and fix the configuration";

    case z.ZodIssueCode.unrecognized_keys:
      return `Remove the unrecognized field(s) or check for typos`;

    default:
      return `Check the value and format for ${path}`;
  }
}

/**
 * Create a validation error summary for display
 *
 * @param errors - Array of validation errors
 * @returns Formatted error summary string
 */
export function createValidationErrorSummary(
  errors: SchemaValidationError[]
): string {
  if (errors.length === 0) {
    return "No validation errors";
  }

  let summary = `Found ${errors.length} validation error${errors.length > 1 ? "s" : ""}:\n\n`;

  errors.forEach((error, index) => {
    summary += `${index + 1}. ${error.path}: ${error.message}\n`;
    if (error.suggestion) {
      summary += `   Suggestion: ${error.suggestion}\n`;
    }
    summary += "\n";
  });

  return summary.trim();
}

/**
 * Supported persona configuration file names
 */
export const SUPPORTED_PERSONA_FILES = ["persona.yaml", "persona.yml"] as const;

/**
 * Check if a filename is a supported persona configuration file
 *
 * @param filename - Name of the file to check
 * @returns True if the file is a supported persona configuration file
 */
export function isSupportedPersonaFile(filename: string): boolean {
  return SUPPORTED_PERSONA_FILES.includes(filename as any);
}

/**
 * Extract persona name from a file path
 *
 * @param filePath - Path to the persona configuration file
 * @returns Extracted persona name from the parent directory
 */
export function extractPersonaNameFromPath(filePath: string): string {
  const pathParts = filePath.replace(/\\/g, "/").split("/");
  // Find the parent directory of the persona.yaml file
  const configFileIndex = pathParts.findIndex((part) =>
    SUPPORTED_PERSONA_FILES.includes(part as any)
  );

  if (configFileIndex > 0) {
    return pathParts[configFileIndex - 1];
  }

  // Fallback: use the last directory in the path
  return pathParts[pathParts.length - 2] || "unknown";
}
