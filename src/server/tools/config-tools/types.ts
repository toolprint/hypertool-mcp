/**
 * Types for configuration tools management
 */

import { ToolModule } from "../types.js";

/**
 * Dependencies specific to configuration tools
 */
export interface ConfigToolDependencies {
  setConfigurationMode?: (mode: boolean) => void;
  isConfigurationMode?: () => boolean;
}

/**
 * Extended tool module for configuration tools
 */
export interface ConfigToolModule extends ToolModule {
  // Mode availability - when this tool should be available
  availableInMode?: "configuration" | "normal" | "both";
}