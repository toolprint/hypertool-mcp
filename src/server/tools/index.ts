/**
 * Default toolset management tool definitions and factories
 */

import { createListAvailableToolsModule } from "./list-available-tools.js";
import { createBuildToolsetModule } from "./build-toolset.js";
import { createListSavedToolsetsModule } from "./list-saved-toolsets.js";
import { createEquipToolsetModule } from "./equip-toolset.js";
import { createDeleteToolsetModule } from "./delete-toolset.js";
import { createUnequipToolsetModule } from "./unequip-toolset.js";
import { createGetActiveToolsetModule } from "./get-active-toolset.js";

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
];
