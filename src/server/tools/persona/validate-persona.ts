/**
 * Validate Persona Tool - Validate a specific persona's structure and configuration with detailed reporting
 */

import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { ToolModuleFactory, ToolModule } from "../types.js";
import { validatePersona, ValidationOptions } from "../../../persona/validator.js";
import { ValidationResult, PersonaValidationErrorInfo } from "../../../persona/types.js";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { stat } from "fs/promises";

// Define the response schema using Zod
const validatePersonaResponseSchema = z.object({
  success: z.boolean(),
  result: z.object({
    isValid: z.boolean(),
    errors: z.array(
      z.object({
        type: z.enum(["schema", "business", "tool-resolution", "mcp-config"]),
        field: z.string().optional(),
        message: z.string(),
        suggestion: z.string().optional(),
        severity: z.enum(["error", "warning"]),
      })
    ),
    warnings: z.array(
      z.object({
        type: z.enum(["schema", "business", "tool-resolution", "mcp-config"]),
        field: z.string().optional(),
        message: z.string(),
        suggestion: z.string().optional(),
        severity: z.enum(["error", "warning"]),
      })
    ),
  }),
  personaPath: z.string(),
  summary: z.object({
    totalErrors: z.number(),
    totalWarnings: z.number(),
    validationLayers: z.array(z.string()),
    pathType: z.enum(["file", "directory"]),
  }),
  error: z.string().optional(),
});

export const validatePersonaDefinition: Tool = {
  name: "validate-persona",
  description:
    "Validate a specific persona's structure and configuration with comprehensive reporting. Performs multi-layer validation including YAML syntax, schema validation, business rules, tool resolution, and MCP config validation. Supports both persona folder paths and individual persona.yaml/yml file paths. Returns detailed validation results with actionable suggestions for fixing any issues found.",
  inputSchema: {
    type: "object" as const,
    properties: {
      personaPath: {
        type: "string",
        description: "Path to the persona folder or persona.yaml/yml file to validate",
      },
      includeWarnings: {
        type: "boolean",
        description: "Whether to include warnings in the validation result (default: true)",
        default: true,
      },
      checkToolAvailability: {
        type: "boolean", 
        description: "Whether to perform tool availability validation (default: true)",
        default: true,
      },
      validateMcpConfig: {
        type: "boolean",
        description: "Whether to validate MCP config files if present (default: true)",
        default: true,
      },
    },
    required: ["personaPath"],
    additionalProperties: false,
  },
  outputSchema: zodToJsonSchema(validatePersonaResponseSchema) as any,
  annotations: {
    title: "Validate Persona",
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
};

/**
 * Determine if the given path is a file or directory
 * @param path Path to check
 * @returns "file" | "directory" | "not-found"
 */
async function getPathType(path: string): Promise<"file" | "directory" | "not-found"> {
  try {
    const stats = await stat(path);
    return stats.isDirectory() ? "directory" : "file";
  } catch {
    return "not-found";
  }
}

/**
 * Create validation summary with error categorization
 * @param result ValidationResult
 * @param pathType Type of path validated
 * @returns Summary object
 */
function createValidationSummary(
  result: ValidationResult,
  pathType: "file" | "directory" | "not-found"
) {
  return {
    totalErrors: result.errors.length,
    totalWarnings: result.warnings.length,
    validationLayers: [
      "YAML Syntax & Schema",
      "Business Rules",
      "Tool Resolution", 
      "MCP Configuration",
    ],
    pathType: pathType as "file" | "directory", // Filter out "not-found"
  };
}

/**
 * Generate actionable suggestions based on validation results
 * @param result ValidationResult
 * @param personaPath Original path provided
 * @returns Array of suggestion strings
 */
function generateActionableSuggestions(
  result: ValidationResult,
  personaPath: string
): string[] {
  const suggestions: string[] = [];

  if (!result.isValid) {
    suggestions.push(`Fix the ${result.errors.length} error(s) found in "${personaPath}"`);
    
    // Group suggestions by error type
    const errorTypes = [...new Set(result.errors.map(e => e.type))];
    for (const errorType of errorTypes) {
      switch (errorType) {
        case "schema":
          suggestions.push("Check YAML syntax and ensure all required fields are present");
          break;
        case "business":
          suggestions.push("Review business rules: persona name should match folder name, default toolset should exist");
          break;
        case "tool-resolution":
          suggestions.push("Verify that all tool IDs reference existing tools from connected MCP servers");
          break;
        case "mcp-config":
          suggestions.push("Check mcp.json file format and server configuration validity");
          break;
      }
    }
  }

  if (result.warnings.length > 0) {
    suggestions.push(`Consider addressing ${result.warnings.length} warning(s) to improve persona quality`);
  }

  return suggestions;
}

export const createValidatePersonaModule: ToolModuleFactory = (deps): ToolModule => {
  return {
    toolName: "validate-persona",
    definition: validatePersonaDefinition,
    handler: async (args: any) => {
      try {
        const { 
          personaPath,
          includeWarnings = true,
          checkToolAvailability = true,
          validateMcpConfig = true,
        } = args || {};

        if (!personaPath || typeof personaPath !== "string") {
          const errorResponse = {
            success: false,
            result: {
              isValid: false,
              errors: [{
                type: "schema" as const,
                message: "personaPath parameter is required and must be a string",
                suggestion: "Provide a valid path to a persona folder or persona.yaml/yml file",
                severity: "error" as const,
              }],
              warnings: [],
            },
            personaPath: personaPath || "",
            summary: {
              totalErrors: 1,
              totalWarnings: 0,
              validationLayers: [
                "YAML Syntax & Schema",
                "Business Rules", 
                "Tool Resolution",
                "MCP Configuration",
              ],
              pathType: "file" as const,
            },
            error: "Invalid personaPath parameter",
          };

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(errorResponse),
              },
            ],
            structuredContent: errorResponse,
            isError: true,
          };
        }

        // Check if path exists and determine type
        const pathType = await getPathType(personaPath);
        
        if (pathType === "not-found") {
          const errorResponse = {
            success: false,
            result: {
              isValid: false,
              errors: [{
                type: "schema" as const,
                message: `Path "${personaPath}" does not exist`,
                suggestion: "Check the path and ensure the persona folder or file exists",
                severity: "error" as const,
              }],
              warnings: [],
            },
            personaPath,
            summary: {
              totalErrors: 1,
              totalWarnings: 0,
              validationLayers: [
                "YAML Syntax & Schema",
                "Business Rules",
                "Tool Resolution", 
                "MCP Configuration",
              ],
              pathType: "file" as const,
            },
            error: `File or directory not found: ${personaPath}`,
          };

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(errorResponse),
              },
            ],
            structuredContent: errorResponse,
            isError: true,
          };
        }

        // Set up validation options
        const validationOptions: ValidationOptions = {
          includeWarnings,
          checkToolAvailability,
          validateMcpConfig,
          stopOnFirstError: false,
        };

        // Perform validation using PersonaValidator
        const validationResult = await validatePersona(
          personaPath,
          deps.discoveryEngine,
          validationOptions
        );

        // Generate actionable suggestions
        const suggestions = generateActionableSuggestions(validationResult, personaPath);

        // Add suggestions to errors and warnings if they don't already have them
        const enrichedErrors = validationResult.errors.map(error => ({
          ...error,
          suggestion: error.suggestion || suggestions.find(s => s.includes(error.type)) || "Check the persona configuration and documentation",
        }));

        const enrichedWarnings = validationResult.warnings.map(warning => ({
          ...warning,
          suggestion: warning.suggestion || suggestions.find(s => s.includes(warning.type)) || "Consider improving the persona configuration",
        }));

        const response = {
          success: true,
          result: {
            isValid: validationResult.isValid,
            errors: enrichedErrors,
            warnings: enrichedWarnings,
          },
          personaPath,
          summary: createValidationSummary(validationResult, pathType),
        };

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(response),
            },
          ],
          structuredContent: response,
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        
        const errorResponse = {
          success: false,
          result: {
            isValid: false,
            errors: [{
              type: "schema" as const,
              message: `Validation failed: ${errorMessage}`,
              suggestion: "Check that the path is accessible and the persona configuration is valid",
              severity: "error" as const,
            }],
            warnings: [],
          },
          personaPath: args?.personaPath || "",
          summary: {
            totalErrors: 1,
            totalWarnings: 0,
            validationLayers: [
              "YAML Syntax & Schema",
              "Business Rules",
              "Tool Resolution",
              "MCP Configuration",
            ],
            pathType: "file" as const,
          },
          error: `Failed to validate persona: ${errorMessage}`,
        };

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(errorResponse),
            },
          ],
          structuredContent: errorResponse,
          isError: true,
        };
      }
    },
  };
};