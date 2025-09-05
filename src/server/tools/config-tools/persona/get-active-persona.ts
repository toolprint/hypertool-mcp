/**
 * Get Active Persona Tool - Query the currently active persona state and metadata
 */

import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { ToolModuleFactory, ToolModule } from "../../types.js";
import { defaultPersonaManager } from "../../../../persona/manager.js";

export const getActivePersonaDefinition: Tool = {
  name: "get-active-persona",
  description:
    "Get information about the currently active persona. Returns the active persona's configuration, toolset, activation metadata, and validation status. Returns null if no persona is currently active.",
  inputSchema: {
    type: "object" as const,
    properties: {},
    additionalProperties: false,
  },
  outputSchema: {
    type: "object" as const,
    properties: {
      success: {
        type: "boolean",
        description: "Whether the operation was successful",
      },
      activePersona: {
        type: ["object", "null"],
        description: "Active persona information or null if none is active",
        properties: {
          name: {
            type: "string",
            description: "Currently active persona name",
          },
          description: {
            type: "string",
            description: "Persona description",
          },
          sourcePath: {
            type: "string",
            description: "Path to the persona source directory or archive",
          },
          activeToolset: {
            type: ["string", "null"],
            description: "Name of the currently active toolset (if any)",
          },
          activationTime: {
            type: "string",
            description: "ISO timestamp when the persona was activated",
          },
          validationStatus: {
            type: "string",
            description: "Validation status of the persona",
            enum: ["valid", "invalid", "warning"],
          },
          metadata: {
            type: "object",
            description: "Activation metadata and statistics",
            properties: {
              activationSource: {
                type: "string",
                description: "How the persona was activated",
                enum: ["manual", "automatic", "restored"],
              },
              validationPassed: {
                type: "boolean",
                description: "Whether validation passed during activation",
              },
              toolsResolved: {
                type: "number",
                description: "Number of tools successfully resolved",
              },
              warnings: {
                type: "array",
                description: "Warnings encountered during activation",
                items: {
                  type: "string",
                },
              },
            },
            required: [
              "activationSource",
              "validationPassed",
              "toolsResolved",
              "warnings",
            ],
          },
        },
        required: [
          "name",
          "description",
          "sourcePath",
          "activationTime",
          "validationStatus",
          "metadata",
        ],
      },
      message: {
        type: "string",
        description: "Descriptive message about the current state",
      },
      error: {
        type: "string",
        description: "Error message if the operation failed",
      },
    },
    required: ["success", "activePersona"],
  },
  annotations: {
    title: "Get Active Persona",
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
};

/**
 * Create the get-active-persona tool module
 */
export const createGetActivePersonaModule: ToolModuleFactory = (
  deps
): ToolModule => {
  return {
    toolName: "get-active-persona",
    definition: getActivePersonaDefinition,
    handler: async (args: any) => {
      try {
        // Get the active persona state from the manager
        const activeState = defaultPersonaManager.getActivePersona();

        if (!activeState) {
          // No persona is currently active
          const response = {
            success: true,
            activePersona: null,
            message: "No persona is currently active",
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
        }

        // Format the active persona information
        const persona = activeState.persona;
        const validationStatus = persona.validation.isValid
          ? "valid"
          : persona.validation.warnings.length > 0 &&
              persona.validation.errors.length === 0
            ? "warning"
            : "invalid";

        const activePersonaInfo = {
          name: persona.config.name,
          description: persona.config.description,
          sourcePath: persona.sourcePath,
          activeToolset: activeState.activeToolset || null,
          activationTime: activeState.activatedAt.toISOString(),
          validationStatus,
          metadata: {
            activationSource: activeState.metadata.activationSource,
            validationPassed: activeState.metadata.validationPassed,
            toolsResolved: activeState.metadata.toolsResolved,
            warnings: activeState.metadata.warnings,
          },
        };

        const response = {
          success: true,
          activePersona: activePersonaInfo,
          message: `Persona "${persona.config.name}" is currently active${activeState.activeToolset ? ` with toolset "${activeState.activeToolset}"` : ""}`,
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
        const errorMessage =
          error instanceof Error ? error.message : String(error);

        const errorResponse = {
          success: false,
          activePersona: null,
          message: "Failed to retrieve active persona information",
          error: `Failed to get active persona: ${errorMessage}`,
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
