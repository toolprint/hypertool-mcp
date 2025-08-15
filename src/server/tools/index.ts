/**
 * Default toolset management tool definitions and factories
 */

import { createListAvailableToolsModule } from "./config-tools/tools/list-available-tools.js";
import { createBuildToolsetModule } from "./config-tools/tools/build-toolset.js";
import { createListSavedToolsetsModule } from "./config-tools/tools/list-saved-toolsets.js";
import { createEquipToolsetModule } from "./config-tools/tools/equip-toolset.js";
import { createDeleteToolsetModule } from "./config-tools/tools/delete-toolset.js";
import { createUnequipToolsetModule } from "./config-tools/tools/unequip-toolset.js";
import { createGetActiveToolsetModule } from "./config-tools/tools/get-active-toolset.js";
import { createAddToolAnnotationModule } from "./config-tools/tools/add-tool-annotation.js";

export type {
  ToolModule,
  ToolDependencies,
  ToolModuleFactory,
} from "./types.js";

/**
 * Default tool modules
 */
export const TOOL_MODULE_FACTORIES = [
  createListAvailableToolsModule,
  createBuildToolsetModule,
  createListSavedToolsetsModule,
  createEquipToolsetModule,
  createDeleteToolsetModule,
  createUnequipToolsetModule,
  createGetActiveToolsetModule,
  createAddToolAnnotationModule,
];
