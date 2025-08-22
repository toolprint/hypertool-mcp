/**
 * List Personas Tool - List available personas with their validation status and metadata
 */

import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { ToolModuleFactory, ToolModule } from "../types.js";
import { discoverPersonas } from "../../../persona/discovery.js";
import { promises as fs } from "fs";
import { getSupportedPersonaFiles } from "../../../persona/parser.js";

export const listPersonasDefinition: Tool = {
  name: "list-personas",
  description:
    "List available personas with their validation status and metadata. Returns structured data showing all discovered personas with essential information for selection and activation.",
  inputSchema: {
    type: "object" as const,
    properties: {
      includeInvalid: {
        type: "boolean",
        description: "Whether to include invalid personas in the results (default: false)",
        default: false,
      },
    },
    additionalProperties: false,
  },
  outputSchema: {
    type: "object" as const,
    properties: {
      success: {
        type: "boolean",
        description: "Whether the operation was successful",
      },
      personas: {
        type: "array",
        description: "Array of discovered personas",
        items: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description: "Persona name",
            },
            description: {
              type: "string",
              description: "Persona description (if available)",
            },
            path: {
              type: "string",
              description: "Full path to persona folder or archive",
            },
            isValid: {
              type: "boolean",
              description: "Whether the persona passed validation checks",
            },
            isArchive: {
              type: "boolean",
              description: "Whether this persona is in archive format (.htp)",
            },
            toolsetCount: {
              type: "number",
              description: "Number of toolsets defined in this persona",
            },
            issues: {
              type: "array",
              description: "Validation issues found (if any)",
              items: {
                type: "string",
              },
            },
          },
          required: ["name", "path", "isValid", "isArchive"],
        },
      },
      summary: {
        type: "object",
        description: "Summary statistics about discovered personas",
        properties: {
          totalPersonas: {
            type: "number",
            description: "Total number of personas discovered",
          },
          validPersonas: {
            type: "number",
            description: "Number of valid personas",
          },
          invalidPersonas: {
            type: "number",
            description: "Number of invalid personas",
          },
          searchPaths: {
            type: "array",
            description: "Paths that were searched for personas",
            items: {
              type: "string",
            },
          },
        },
        required: ["totalPersonas", "validPersonas", "invalidPersonas", "searchPaths"],
      },
      warnings: {
        type: "array",
        description: "Warnings encountered during discovery",
        items: {
          type: "string",
        },
      },
      errors: {
        type: "array",
        description: "Errors encountered during discovery",
        items: {
          type: "string",
        },
      },
      error: {
        type: "string",
        description: "Error message if the operation failed",
      },
    },
    required: ["success", "personas", "summary"],
  },
  annotations: {
    title: "List Personas",
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
};

/**
 * Quick parse toolset count from persona YAML content
 * @param personaPath Path to persona directory
 * @returns Number of toolsets found, or 0 if unable to parse
 */
async function getToolsetCount(personaPath: string): Promise<number> {
  try {
    // Skip toolset counting for archive files
    if (personaPath.endsWith('.htp')) {
      return 0; // Cannot easily count toolsets in archives without extraction
    }

    // Find persona config file
    const supportedFiles = getSupportedPersonaFiles();
    let configContent: string | null = null;

    for (const fileName of supportedFiles) {
      try {
        const filePath = `${personaPath}/${fileName}`;
        configContent = await fs.readFile(filePath, "utf-8");
        break;
      } catch {
        // File doesn't exist, try next
        continue;
      }
    }

    if (!configContent) {
      return 0; // No config file found
    }

    // Count toolsets using regex (similar to discovery engine approach)
    const toolsetMatches = configContent.match(/^\s*-\s*name:\s*["']?([^"'\n\r]+)["']?/gm);
    
    // Check if we're in a toolsets section
    const toolsetsMatch = configContent.match(/^toolsets:\s*$/m);
    if (toolsetsMatch && toolsetMatches) {
      return toolsetMatches.length;
    }
    
    return 0; // No toolsets section or no toolset entries found
  } catch (error) {
    // If we can't parse, return 0 rather than failing the entire operation
    return 0;
  }
}

export const createListPersonasModule: ToolModuleFactory = (deps): ToolModule => {
  return {
    toolName: "list-personas",
    definition: listPersonasDefinition,
    handler: async (args: any) => {
      try {
        const { includeInvalid = false } = args || {};

        // Discover personas using the discovery engine
        const discoveryResult = await discoverPersonas();

        // Filter personas based on includeInvalid parameter
        const filteredPersonas = discoveryResult.personas.filter(
          (persona) => includeInvalid || persona.isValid
        );

        // Calculate summary statistics
        const totalPersonas = discoveryResult.personas.length;
        const validPersonas = discoveryResult.personas.filter((p) => p.isValid).length;
        const invalidPersonas = totalPersonas - validPersonas;

        // Build response structure with toolset counts
        const personasWithToolsetCounts = await Promise.all(
          filteredPersonas.map(async (persona) => ({
            name: persona.name,
            description: persona.description || "",
            path: persona.path,
            isValid: persona.isValid,
            isArchive: persona.isArchive,
            toolsetCount: await getToolsetCount(persona.path),
            ...(persona.issues && persona.issues.length > 0 && { issues: persona.issues }),
          }))
        );

        const response = {
          success: true,
          personas: personasWithToolsetCounts,
          summary: {
            totalPersonas,
            validPersonas,
            invalidPersonas,
            searchPaths: discoveryResult.searchPaths,
          },
          warnings: discoveryResult.warnings,
          errors: discoveryResult.errors,
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
          personas: [],
          summary: {
            totalPersonas: 0,
            validPersonas: 0,
            invalidPersonas: 0,
            searchPaths: [],
          },
          warnings: [],
          errors: [errorMessage],
          error: `Failed to list personas: ${errorMessage}`,
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