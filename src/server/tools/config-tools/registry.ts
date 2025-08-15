/**
 * Configuration Tools Registry
 * 
 * Central registry of all configuration tools for HyperTool MCP.
 * This provides a single source of truth for configuration tool management.
 */

import { ToolModuleFactory } from "../types.js";
import { createListAvailableToolsModule } from "./tools/list-available-tools.js";
import { createBuildToolsetModule } from "./tools/build-toolset.js";
import { createListSavedToolsetsModule } from "./tools/list-saved-toolsets.js";
import { createEquipToolsetModule } from "./tools/equip-toolset.js";
import { createDeleteToolsetModule } from "./tools/delete-toolset.js";
import { createUnequipToolsetModule } from "./tools/unequip-toolset.js";
import { createGetActiveToolsetModule } from "./tools/get-active-toolset.js";
import { createAddToolAnnotationModule } from "./tools/add-tool-annotation.js";
import { createExitConfigurationModeModule } from "../common/exit-configuration-mode.js";

/**
 * Registry of all configuration tool factories
 */
export const CONFIG_TOOL_FACTORIES: ToolModuleFactory[] = [
  createListAvailableToolsModule,
  createBuildToolsetModule,
  createListSavedToolsetsModule,
  createEquipToolsetModule,
  createDeleteToolsetModule,
  createUnequipToolsetModule,
  createGetActiveToolsetModule,
  createAddToolAnnotationModule,
  createExitConfigurationModeModule,
];

/**
 * List of configuration tool names (derived from factories)
 * Note: This requires instantiation to get the actual names,
 * so we maintain a static list for convenience
 */
export const CONFIG_TOOL_NAMES = [
  "list-available-tools",
  "build-toolset",
  "list-saved-toolsets",
  "equip-toolset",
  "delete-toolset",
  "unequip-toolset",
  "get-active-toolset",
  "add-tool-annotation",
  "exit-configuration-mode",
] as const;

export type ConfigToolName = typeof CONFIG_TOOL_NAMES[number];