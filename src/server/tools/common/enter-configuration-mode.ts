/**
 * Enter Configuration Mode - Switch to configuration mode for managing toolsets
 */

import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { ToolModuleFactory, ToolModule } from "../types.js";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { CONFIG_TOOL_NAMES } from "../config-tools/registry.js";

// Define the output schema
const enterConfigurationModeResponseSchema = zodToJsonSchema(
  z.object({
    success: z.boolean(),
    message: z.string(),
    availableTools: z.array(z.string()).optional()
  })
);

export const enterConfigurationModeDefinition: Tool = {
  name: "enter-configuration-mode",
  description: "Switch the server to configuration mode for managing tools and toolsets. In this mode, you can access: list-available-tools (browse all discovered tools), build-toolset (create custom tool collections), list-saved-toolsets (view saved configurations), equip-toolset (activate a toolset), delete-toolset (remove configurations), get-active-toolset (check current status), and add-tool-annotation (add context to tools). Operational tools will be hidden while in configuration mode. Use this when you need to organize, create, or modify tool configurations.",
  inputSchema: {
    type: "object" as const,
    properties: {},
    additionalProperties: false
  },
  outputSchema: enterConfigurationModeResponseSchema as any
};

export const createEnterConfigurationModeModule: ToolModuleFactory = (
  _deps,
  onModeChangeRequest?: () => void
): ToolModule => {
  return {
    toolName: "enter-configuration-mode",
    definition: enterConfigurationModeDefinition,
    handler: async () => {
      // Call the callback to request mode change
      if (onModeChangeRequest) {
        onModeChangeRequest();
        
        const response = {
          success: true,
          message: "Entering configuration mode. Configuration tools are now available.",
          availableTools: [...CONFIG_TOOL_NAMES]
        };
        
        return {
          content: [{
            type: "text",
            text: JSON.stringify(response)
          }]
        };
      }
      throw new Error("Mode change callback not configured");
    }
  };
};