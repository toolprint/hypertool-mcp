/**
 * Deactivate Persona Tool - Deactivate the currently active persona with cleanup
 */

import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { ToolModuleFactory, ToolModule } from "../types.js";
import { PersonaManager } from "../../../persona/manager.js";
import { ActivationResult } from "../../../persona/types.js";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { createChildLogger } from "../../../utils/logging.js";

const logger = createChildLogger({ module: "deactivate-persona-tool" });

// Define the response schema using Zod
const deactivatePersonaResponseSchema = z.object({
  success: z.boolean().describe("Whether the deactivation was successful"),
  deactivated: z
    .object({
      name: z.string().describe("Deactivated persona name"),
      wasActive: z.boolean().describe("Whether a persona was actually active"),
      deactivationTime: z
        .string()
        .describe("ISO timestamp when the persona was deactivated"),
      restoredState: z
        .object({
          previousToolset: z
            .string()
            .optional()
            .describe("Previous toolset that was restored"),
          configChangesReverted: z
            .boolean()
            .describe("Whether MCP config changes were reverted"),
          stateCleared: z
            .boolean()
            .describe("Whether persona state was cleared successfully"),
        })
        .describe("Information about state restoration during deactivation"),
    })
    .nullable()
    .describe(
      "Deactivated persona information (null if no persona was active)"
    ),
  warnings: z
    .array(z.string())
    .optional()
    .describe("Non-fatal warnings during deactivation"),
  errors: z
    .array(z.string())
    .optional()
    .describe("Error messages if deactivation failed"),
  error: z.string().optional().describe("Primary error message if failed"),
  message: z.string().describe("Human-readable status message"),
});

export const deactivatePersonaDefinition: Tool = {
  name: "deactivate-persona",
  description:
    "Deactivate the currently active persona and restore the previous system state. This tool performs complete cleanup including toolset restoration, MCP configuration reversion, and state clearing. Returns comprehensive deactivation results with detailed information about cleanup operations. If no persona is currently active, returns success with appropriate messaging.",
  inputSchema: {
    type: "object" as const,
    properties: {},
    additionalProperties: false,
  },
  outputSchema: zodToJsonSchema(deactivatePersonaResponseSchema) as any,
  annotations: {
    title: "Deactivate Persona",
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: false,
  },
};

/**
 * Create detailed deactivation response from PersonaManager result
 */
function createDeactivationResponse(
  result: ActivationResult,
  personaManager: PersonaManager,
  wasActive: boolean
): any {
  const deactivationTime = new Date().toISOString();

  if (!result.success) {
    return {
      success: false,
      deactivated: wasActive
        ? {
            name: result.personaName,
            wasActive: true,
            deactivationTime,
            restoredState: {
              previousToolset: undefined,
              configChangesReverted: false,
              stateCleared: false,
            },
          }
        : null,
      errors: result.errors || ["Unknown deactivation error"],
      error: result.errors?.[0] || "Deactivation failed",
      warnings: result.warnings,
      message: wasActive
        ? `Failed to deactivate persona: ${result.errors?.[0] || "Unknown error"}`
        : "No persona was active",
    };
  }

  // Successful deactivation
  if (!wasActive) {
    return {
      success: true,
      deactivated: null,
      message: "No persona was active",
      warnings: result.warnings,
    };
  }

  return {
    success: true,
    deactivated: {
      name: result.personaName,
      wasActive: true,
      deactivationTime,
      restoredState: {
        previousToolset: result.activatedToolset, // This was the previous toolset that got restored
        configChangesReverted: true,
        stateCleared: true,
      },
    },
    warnings: result.warnings,
    message: `Successfully deactivated ${result.personaName}`,
  };
}

export const createDeactivatePersonaModule: ToolModuleFactory = (
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
    toolName: "deactivate-persona",
    definition: deactivatePersonaDefinition,
    handler: async (args: any) => {
      try {
        logger.info("Persona deactivation requested");

        // Initialize the persona manager
        await personaManager.initialize();

        // Check if a persona is currently active
        const activeState = personaManager.getActivePersona();
        const wasActive = !!activeState;

        if (wasActive) {
          logger.info("Deactivating active persona", {
            personaName: activeState.persona.config.name,
            activeToolset: activeState.activeToolset,
            activatedAt: activeState.activatedAt.toISOString(),
          });
        } else {
          logger.info("No persona currently active");
        }

        // Attempt persona deactivation
        const deactivationResult = await personaManager.deactivatePersona({
          silent: false,
        });

        logger.info("Persona deactivation completed", {
          personaName: deactivationResult.personaName,
          success: deactivationResult.success,
          wasActive,
          hasErrors: !!deactivationResult.errors?.length,
          hasWarnings: !!deactivationResult.warnings?.length,
        });

        // Create detailed response
        const response = createDeactivationResponse(
          deactivationResult,
          personaManager,
          wasActive
        );

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(response),
            },
          ],
          structuredContent: response,
          isError: !deactivationResult.success,
        };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);

        logger.error("Persona deactivation failed with exception", {
          error: errorMessage,
        });

        const errorResponse = {
          success: false,
          deactivated: null,
          errors: [`Deactivation failed: ${errorMessage}`],
          error: `Failed to deactivate persona: ${errorMessage}`,
          message: `Deactivation error: ${errorMessage}`,
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
