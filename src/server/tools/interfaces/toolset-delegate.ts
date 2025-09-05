/**
 * Common interface for toolset delegates (ToolsetManager and PersonaManager)
 * 
 * This interface allows configuration tools to work uniformly with both
 * regular toolsets (ToolsetManager) and persona toolsets (PersonaManager)
 * depending on the current activation state.
 */

import type {
  ListSavedToolsetsResponse,
  EquipToolsetResponse,
  GetActiveToolsetResponse
} from "../schemas.js";

/**
 * Common interface for toolset operations
 * Implemented by both ToolsetManager and PersonaManager
 */
export interface IToolsetDelegate {
  /**
   * List available toolsets
   */
  listSavedToolsets(): Promise<ListSavedToolsetsResponse>;

  /**
   * Equip/activate a toolset
   */
  equipToolset(name: string): Promise<EquipToolsetResponse>;

  /**
   * Get information about currently active toolset
   */
  getActiveToolset(): Promise<GetActiveToolsetResponse>;

  /**
   * Check if a toolset is currently active
   */
  hasActiveToolset(): boolean;

  /**
   * Get the delegate type for context
   */
  getDelegateType(): 'regular' | 'persona';
}