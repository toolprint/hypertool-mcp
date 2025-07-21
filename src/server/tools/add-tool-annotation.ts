/**
 * Add Tool Annotation - Add contextual notes to tools in the current toolset
 */

import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { ToolModuleFactory, ToolModule } from "./types.js";
import { addToolAnnotationResponseSchema, AddToolAnnotationResponse } from "./schemas.js";
import { DynamicToolReference, ToolsetToolNote } from "../../toolset/types.js";

export const addToolAnnotationDefinition: Tool = {
  name: "add-tool-annotation",
  description:
    "Add contextual annotations to a tool in the current toolset to guide LLM usage. Annotations provide user-specific guidance, best practices, and usage notes that will be displayed with the tool's description. Example: {toolRef: {namespacedName: 'linear.create_issue'}, notes: [{name: 'team-selection', note: 'Always confirm team with user first'}]}",
  inputSchema: {
    type: "object" as const,
    properties: {
      toolRef: {
        type: "object",
        description:
          "Reference to the tool (use namespacedName or refId). Use list-available-tools to find the correct reference.",
        properties: {
          namespacedName: {
            type: "string",
            description:
              "Tool reference by namespaced name (e.g., 'linear.create_issue', 'git.status')",
          },
          refId: {
            type: "string",
            description:
              "Tool reference by unique hash identifier (shown in list-available-tools output)",
          },
        },
        oneOf: [{ required: ["namespacedName"] }, { required: ["refId"] }],
        additionalProperties: false,
      },
      notes: {
        type: "array",
        description:
          "Array of annotations to add to the tool. Each annotation has a name (identifier) and note (content).",
        minItems: 1,
        maxItems: 20,
        items: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description:
                "Identifier for this annotation (e.g., 'usage-tips', 'team-conventions', 'common-pitfalls')",
              pattern: "^[a-z0-9-]+$",
              minLength: 2,
              maxLength: 50,
            },
            note: {
              type: "string",
              description:
                "The annotation content to help guide LLM usage. Be clear and specific.",
              minLength: 1,
              maxLength: 500,
            },
          },
          required: ["name", "note"],
          additionalProperties: false,
        },
      },
    },
    required: ["toolRef", "notes"],
    additionalProperties: false,
  },
  outputSchema: addToolAnnotationResponseSchema as any,
};

export const createAddToolAnnotationModule: ToolModuleFactory = (
  deps
): ToolModule => {
  return {
    toolName: "add-tool-annotation",
    definition: addToolAnnotationDefinition,
    handler: async (args: any) => {
      // Check if a toolset is equipped
      if (!deps.toolsetManager.hasActiveToolset()) {
        // Get list of available toolsets
        const availableToolsets = await deps.toolsetManager.listSavedToolsets();
        const toolsetNames = availableToolsets.success
          ? availableToolsets.toolsets.map((t) => t.name)
          : [];

        const response: AddToolAnnotationResponse = {
          toolset: "",
          tool: {
            namespacedName: "",
            refId: "",
            server: "",
          },
          addedNotes: [],
          successCount: 0,
          errorCount: 1,
          errors: [
            "No toolset is currently equipped. Use equip-toolset to load a toolset first.",
            ...(toolsetNames.length > 0
              ? [`Available toolsets: ${toolsetNames.join(", ")}`]
              : ["No saved toolsets found. Use build-toolset to create one."]),
          ],
        };

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(response),
            },
          ],
        };
      }

      // Check if discovery engine is available
      if (!deps.discoveryEngine) {
        const response: AddToolAnnotationResponse = {
          toolset: deps.toolsetManager.getCurrentToolset()?.name || "",
          tool: {
            namespacedName: "",
            refId: "",
            server: "",
          },
          addedNotes: [],
          successCount: 0,
          errorCount: 1,
          errors: ["Tool discovery not available. Server may not be fully started."],
        };

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(response),
            },
          ],
        };
      }

      try {
        const toolRef = args?.toolRef as DynamicToolReference;
        const notes = args?.notes as ToolsetToolNote[];

        // Validate tool reference
        if (!toolRef || (!toolRef.namespacedName && !toolRef.refId)) {
          const response: AddToolAnnotationResponse = {
            toolset: deps.toolsetManager.getCurrentToolset()?.name || "",
            tool: {
              namespacedName: "",
              refId: "",
              server: "",
            },
            addedNotes: [],
            successCount: 0,
            errorCount: 1,
            errors: ["Invalid tool reference. Must provide either namespacedName or refId."],
          };

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(response),
              },
            ],
          };
        }

        // Resolve the tool reference
        const resolution = deps.discoveryEngine.resolveToolReference(toolRef, {
          allowStaleRefs: false,
        });

        if (!resolution?.exists || !resolution.tool) {
          const response: AddToolAnnotationResponse = {
            toolset: deps.toolsetManager.getCurrentToolset()?.name || "",
            tool: {
              namespacedName: "",
              refId: "",
              server: "",
            },
            addedNotes: [],
            successCount: 0,
            errorCount: 1,
            errors: [
              `Tool not found: ${toolRef.namespacedName || toolRef.refId}. Use list-available-tools to see available tools.`
            ],
          };

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(response),
              },
            ],
          };
        }

        // Check if the tool is in the current toolset
        const currentToolset = deps.toolsetManager.getCurrentToolset();
        if (!currentToolset) {
          const response: AddToolAnnotationResponse = {
            toolset: "",
            tool: {
              namespacedName: resolution.tool.namespacedName,
              refId: resolution.tool.toolHash,
              server: resolution.tool.serverName,
            },
            addedNotes: [],
            successCount: 0,
            errorCount: 1,
            errors: ["No toolset configuration loaded."],
          };

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(response),
              },
            ],
          };
        }

        // Verify the tool is part of the current toolset
        const toolInToolset = currentToolset.tools.some((t) => {
          if (t.namespacedName && t.namespacedName === resolution.tool!.namespacedName) {
            return true;
          }
          if (t.refId && t.refId === resolution.tool!.toolHash) {
            return true;
          }
          return false;
        });

        if (!toolInToolset) {
          const response: AddToolAnnotationResponse = {
            toolset: currentToolset.name,
            tool: {
              namespacedName: resolution.tool.namespacedName,
              refId: resolution.tool.toolHash,
              server: resolution.tool.serverName,
            },
            addedNotes: [],
            successCount: 0,
            errorCount: 1,
            errors: [
              `Tool "${resolution.tool.namespacedName}" is not in the current toolset "${currentToolset.name}".`
            ],
          };

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(response),
              },
            ],
          };
        }

        // Initialize toolNotes array if it doesn't exist
        if (!currentToolset.toolNotes) {
          currentToolset.toolNotes = [];
        }

        // Find existing notes for this tool
        let toolNotesEntry = currentToolset.toolNotes.find((entry) => {
          if (
            entry.toolRef.namespacedName &&
            entry.toolRef.namespacedName === resolution.tool!.namespacedName
          ) {
            return true;
          }
          if (
            entry.toolRef.refId &&
            entry.toolRef.refId === resolution.tool!.toolHash
          ) {
            return true;
          }
          return false;
        });

        // Create new entry if none exists
        if (!toolNotesEntry) {
          toolNotesEntry = {
            toolRef: {
              namespacedName: resolution.tool.namespacedName,
              refId: resolution.tool.toolHash,
            },
            notes: [],
          };
          currentToolset.toolNotes.push(toolNotesEntry);
        }

        // Add new notes (skip duplicates)
        const addedNotes: ToolsetToolNote[] = [];
        const skippedNotes: string[] = [];

        for (const note of notes) {
          const existingNote = toolNotesEntry.notes.find(
            (n) => n.name === note.name
          );
          if (existingNote) {
            skippedNotes.push(note.name);
          } else {
            toolNotesEntry.notes.push(note);
            addedNotes.push(note);
          }
        }

        // Update the last modified timestamp
        currentToolset.lastModified = new Date();

        // Save the updated toolset to preferences
        try {
          const preferences = await import("../../config/preferenceStore.js");
          const loadToolsetsFromPreferences = preferences.loadStoredToolsets;
          const saveToolsetsToPreferences = preferences.saveStoredToolsets;
          
          const stored = await loadToolsetsFromPreferences();
          stored[currentToolset.name] = currentToolset;
          await saveToolsetsToPreferences(stored);
        } catch (error) {
          const response: AddToolAnnotationResponse = {
            toolset: currentToolset.name,
            tool: {
              namespacedName: resolution.tool.namespacedName,
              refId: resolution.tool.toolHash,
              server: resolution.tool.serverName,
            },
            addedNotes: [],
            successCount: 0,
            errorCount: 1,
            errors: [`Failed to save annotations: ${error instanceof Error ? error.message : String(error)}`],
          };

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(response),
              },
            ],
          };
        }

        // Emit toolset change event to refresh tools
        deps.toolsetManager.setCurrentToolset(currentToolset);

        // Prepare response
        const response: AddToolAnnotationResponse = {
          toolset: currentToolset.name,
          tool: {
            namespacedName: resolution.tool.namespacedName,
            refId: resolution.tool.toolHash,
            server: resolution.tool.serverName,
          },
          addedNotes,
          successCount: addedNotes.length,
          errorCount: skippedNotes.length,
          errors: skippedNotes.length > 0 
            ? skippedNotes.map(name => `Annotation "${name}" already exists`)
            : undefined,
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
        const response: AddToolAnnotationResponse = {
          toolset: deps.toolsetManager.getCurrentToolset()?.name || "",
          tool: {
            namespacedName: "",
            refId: "",
            server: "",
          },
          addedNotes: [],
          successCount: 0,
          errorCount: 1,
          errors: [
            `Failed to add annotations: ${
              error instanceof Error ? error.message : String(error)
            }`
          ],
        };

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(response),
            },
          ],
        };
      }
    },
  };
};