/**
 * Exit Configuration Mode - Return to normal operational mode
 */

import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { ToolModuleFactory, ToolModule } from "../types.js";
import { z } from "zod";

// Define the output schema
const exitConfigurationModeResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  currentMode: z.enum(["normal", "configuration"])
});

export const exitConfigurationModeDefinition: Tool = {
  name: "exit-configuration-mode",
  description: "Leave configuration mode and return to normal operational mode. This will hide configuration tools and restore access to your equipped toolset's tools (or show only navigation tools if no toolset is equipped). The server will automatically exit configuration mode when you successfully equip a toolset. Use this when you're done with configuration tasks and ready to use your tools.",
  inputSchema: {
    type: "object" as const,
    properties: {},
    additionalProperties: false
  },
  outputSchema: exitConfigurationModeResponseSchema as any
};

export const createExitConfigurationModeModule: ToolModuleFactory = (
  _deps,
  onModeChangeRequest?: () => void
): ToolModule => {
  return {
    toolName: "exit-configuration-mode",
    definition: exitConfigurationModeDefinition,
    handler: async () => {
      // Call the callback to request mode change
      if (onModeChangeRequest) {
        onModeChangeRequest();
        
        const response = {
          success: true,
          message: "Exiting configuration mode. Returning to normal operational mode.",
          currentMode: "normal" as const
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