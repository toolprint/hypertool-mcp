/**
 * Activate Persona Tool - Activate a specific persona with optional toolset selection
 */

import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { ToolModuleFactory, ToolModule } from "../types.js";
import { PersonaManager } from "../../../persona/manager.js";
import { ActivationResult } from "../../../persona/types.js";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { discoverPersonas } from "../../../persona/discovery.js";
import { createChildLogger } from "../../../utils/logging.js";

const logger = createChildLogger({ module: "activate-persona-tool" });

// Define the response schema using Zod
const activatePersonaResponseSchema = z.object({
  success: z.boolean().describe("Whether the activation was successful"),
  persona: z
    .object({
      name: z.string().describe("Activated persona name"),
      description: z.string().optional().describe("Persona description"),
      activatedToolset: z
        .string()
        .optional()
        .describe("Name of the activated toolset"),
      activationTime: z
        .string()
        .describe("ISO timestamp when the persona was activated"),
      metadata: z
        .object({
          activationSource: z
            .enum(["manual", "automatic", "restored"])
            .describe("Source of the activation"),
          validationPassed: z
            .boolean()
            .describe("Whether validation passed during activation"),
          toolsResolved: z
            .number()
            .describe("Number of tools successfully resolved"),
          warnings: z
            .array(z.string())
            .describe("Any warnings during activation"),
        })
        .describe("Activation metadata"),
    })
    .optional()
    .describe("Activated persona information (only present if successful)"),
  toolsetInfo: z
    .object({
      name: z.string().describe("Toolset name"),
      toolCount: z.number().describe("Number of tools in the toolset"),
      resolvedTools: z
        .array(z.string())
        .optional()
        .describe("List of successfully resolved tool IDs"),
    })
    .optional()
    .describe("Toolset information (only present if toolset was activated)"),
  warnings: z
    .array(z.string())
    .optional()
    .describe("Non-fatal warnings during activation"),
  errors: z
    .array(z.string())
    .optional()
    .describe("Error messages if activation failed"),
  error: z.string().optional().describe("Primary error message if failed"),
  suggestions: z
    .array(z.string())
    .optional()
    .describe("Actionable suggestions if activation failed"),
});

export const activatePersonaDefinition: Tool = {
  name: "activate-persona",
  description:
    "Activate a specific persona with optional toolset selection. This tool orchestrates the complete persona activation workflow including validation, toolset application, and state management. Only one persona can be active at a time - activating a new persona will automatically deactivate the current one. Returns comprehensive activation results with detailed error handling and actionable suggestions for troubleshooting.",
  inputSchema: {
    type: "object" as const,
    properties: {
      personaName: {
        type: "string",
        description:
          "Name of the persona to activate (must match an available persona)",
      },
      toolsetName: {
        type: "string",
        description:
          "Optional specific toolset to activate. If not provided, the persona's default toolset will be used",
      },
      force: {
        type: "boolean",
        description:
          "Force activation even if validation fails (default: false)",
        default: false,
      },
      preserveState: {
        type: "boolean",
        description:
          "Whether to preserve current state for potential restoration (default: true)",
        default: true,
      },
    },
    required: ["personaName"],
    additionalProperties: false,
  },
  outputSchema: zodToJsonSchema(activatePersonaResponseSchema) as any,
  annotations: {
    title: "Activate Persona",
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  },
};

/**
 * Generate actionable suggestions based on activation failure
 * @param personaName Failed persona name
 * @param error Error message
 * @param availablePersonas List of available personas
 * @returns Array of suggestion strings
 */
function generateActivationSuggestions(
  personaName: string,
  error: string,
  availablePersonas: string[] = []
): string[] {
  const suggestions: string[] = [];

  if (error.includes("not found") || error.includes("PERSONA_NOT_FOUND")) {
    suggestions.push(`Persona "${personaName}" was not found.`);
    
    if (availablePersonas.length > 0) {
      suggestions.push("Available personas:");
      availablePersonas.slice(0, 5).forEach((name) => {
        suggestions.push(`  - ${name}`);
      });
      if (availablePersonas.length > 5) {
        suggestions.push(`  ... and ${availablePersonas.length - 5} more`);
      }
    } else {
      suggestions.push(
        "No personas are currently available. Try refreshing persona discovery."
      );
    }
    
    suggestions.push('Use "list-personas" to see all available personas.');
  } else if (error.includes("validation failed") || error.includes("VALIDATION_FAILED")) {
    suggestions.push("Persona validation failed. Common issues:");
    suggestions.push("  - Check YAML syntax in persona.yaml");
    suggestions.push("  - Ensure all required fields are present");
    suggestions.push("  - Verify toolset references are valid");
    suggestions.push('Use "validate-persona" to see detailed validation results.');
  } else if (error.includes("toolset") && error.includes("not found")) {
    suggestions.push("Specified toolset was not found in the persona.");
    suggestions.push(
      "Check available toolsets in the persona configuration."
    );
    suggestions.push("Try activating without specifying a toolset to use the default.");
  } else if (error.includes("tool resolution")) {
    suggestions.push("Tool resolution failed during activation:");
    suggestions.push("  - Check that required MCP servers are running");
    suggestions.push("  - Verify tool IDs match available tools");
    suggestions.push("  - Consider using partial activation if some tools are unavailable");
  } else {
    // Generic suggestions
    suggestions.push("Activation failed. Try these troubleshooting steps:");
    suggestions.push('  1. Use "list-personas" to verify the persona exists');
    suggestions.push('  2. Use "validate-persona" to check for configuration issues');
    suggestions.push("  3. Check that required MCP servers are connected");
    suggestions.push("  4. Try activating with force=true to bypass validation");
  }

  return suggestions;
}

/**
 * Get list of available persona names for suggestions
 */
async function getAvailablePersonaNames(): Promise<string[]> {
  try {
    const discoveryResult = await discoverPersonas();
    return discoveryResult.personas
      .filter((p) => p.isValid)
      .map((p) => p.name)
      .sort();
  } catch (error) {
    logger.warn("Failed to get available personas for suggestions", { error });
    return [];
  }
}

/**
 * Create detailed activation response from PersonaManager result
 */
function createActivationResponse(
  result: ActivationResult,
  personaManager: PersonaManager
): any {
  if (!result.success) {
    return {
      success: false,
      errors: result.errors || ["Unknown activation error"],
      error: result.errors?.[0] || "Activation failed",
      warnings: result.warnings,
    };
  }

  // Get active persona state for detailed information
  const activeState = personaManager.getActivePersona();
  
  const response: any = {
    success: true,
    persona: {
      name: result.personaName,
      description: activeState?.persona.config.description,
      activatedToolset: result.activatedToolset,
      activationTime: (activeState?.activatedAt || new Date()).toISOString(),
      metadata: {
        activationSource: activeState?.metadata.activationSource || "manual",
        validationPassed: activeState?.metadata.validationPassed || false,
        toolsResolved: activeState?.metadata.toolsResolved || 0,
        warnings: activeState?.metadata.warnings || [],
      },
    },
    warnings: result.warnings,
  };

  // Add toolset information if available
  if (result.activatedToolset && activeState) {
    const toolset = activeState.persona.config.toolsets?.find(
      (t) => t.name === result.activatedToolset
    );
    
    if (toolset) {
      response.toolsetInfo = {
        name: toolset.name,
        toolCount: toolset.toolIds.length,
        resolvedTools: toolset.toolIds.slice(0, 10), // Limit for response size
      };
    }
  }

  return response;
}

export const createActivatePersonaModule: ToolModuleFactory = (
  deps
): ToolModule => {
  // Create PersonaManager instance with dependencies
  const personaManager = new PersonaManager({
    toolDiscoveryEngine: deps.discoveryEngine,
    toolsetManager: deps.toolsetManager,
    validateOnActivation: true,
    autoDiscover: true,
  });

  return {
    toolName: "activate-persona",
    definition: activatePersonaDefinition,
    handler: async (args: any) => {
      try {
        const {
          personaName,
          toolsetName,
          force = false,
          preserveState = true,
        } = args || {};

        logger.info("Persona activation requested", {
          personaName,
          toolsetName,
          force,
          preserveState,
        });

        // Validate required parameters
        if (!personaName || typeof personaName !== "string") {
          const errorResponse = {
            success: false,
            errors: ["personaName parameter is required and must be a string"],
            error: "Invalid personaName parameter",
            suggestions: [
              "Provide a valid persona name as a string",
              'Use "list-personas" to see available personas',
            ],
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

        // Initialize the persona manager
        await personaManager.initialize();

        // Attempt persona activation
        const activationResult = await personaManager.activatePersona(
          personaName,
          {
            toolsetName,
            force,
            backupState: preserveState,
            silent: false,
          }
        );

        logger.info("Persona activation completed", {
          personaName,
          success: activationResult.success,
          activatedToolset: activationResult.activatedToolset,
          hasErrors: !!activationResult.errors?.length,
          hasWarnings: !!activationResult.warnings?.length,
        });

        // Create detailed response
        const response = createActivationResponse(activationResult, personaManager);

        // Add suggestions if activation failed
        if (!activationResult.success) {
          const availablePersonas = await getAvailablePersonaNames();
          const primaryError = activationResult.errors?.[0] || "Unknown error";
          
          response.suggestions = generateActivationSuggestions(
            personaName,
            primaryError,
            availablePersonas
          );
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(response),
            },
          ],
          structuredContent: response,
          isError: !activationResult.success,
        };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);

        logger.error("Persona activation failed with exception", {
          error: errorMessage,
          personaName: args?.personaName,
        });

        const availablePersonas = await getAvailablePersonaNames();
        
        const errorResponse = {
          success: false,
          errors: [`Activation failed: ${errorMessage}`],
          error: `Failed to activate persona: ${errorMessage}`,
          suggestions: generateActivationSuggestions(
            args?.personaName || "(unknown)",
            errorMessage,
            availablePersonas
          ),
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