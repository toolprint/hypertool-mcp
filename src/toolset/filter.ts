/**
 * Simplified toolset filtering (legacy compatibility)
 * 
 * Note: In the simplified toolset system, filtering is handled by 
 * ToolsetManager.applyConfig() using the discovery engine.
 * These functions are kept for backward compatibility.
 */

import { DiscoveredTool } from "../discovery/types";
import {
  ToolsetConfig,
  ToolsetResolution,
} from "./types";

/**
 * Apply toolset configuration (legacy - use ToolsetManager.applyConfig instead)
 */
export async function applyToolsetConfig(
  _discoveredTools: DiscoveredTool[],
  _config: ToolsetConfig
): Promise<ToolsetResolution> {
  // Legacy function - redirect to ToolsetManager
  console.warn("applyToolsetConfig is legacy. Use ToolsetManager.applyConfig() instead.");
  
  return {
    success: false,
    tools: [],
    errors: ["Use ToolsetManager.applyConfig() instead of legacy applyToolsetConfig"],
  };
}

/**
 * Get available tools for config (legacy)
 */
export function getAvailableToolsForConfig(
  _discoveredTools: DiscoveredTool[],
  _config: ToolsetConfig
): DiscoveredTool[] {
  console.warn("getAvailableToolsForConfig is legacy. Use ToolsetManager instead.");
  return [];
}

/**
 * Preview toolset configuration (legacy)
 */
export async function previewToolsetConfig(
  _discoveredTools: DiscoveredTool[],
  _config: ToolsetConfig
): Promise<ToolsetResolution> {
  console.warn("previewToolsetConfig is legacy. Use ToolsetManager instead.");
  
  return {
    success: false,
    tools: [],
    errors: ["Use ToolsetManager instead of legacy preview functions"],
  };
}