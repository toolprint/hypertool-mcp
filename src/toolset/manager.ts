/**
 * Toolset configuration system
 *
 * This module provides a complete toolset configuration system that allows users
 * to specify which tools to expose from each MCP server with support for:
 * - JSON-based configuration with validation
 * - Wildcard and regex patterns for tool selection
 * - Conflict resolution strategies
 * - Default configuration generation
 * 
 * TODO: Per-Application Toolset Management
 * - Associate toolsets with specific applications (claude-desktop, cursor, etc.)
 * - Allow app-specific toolset configurations and preferences
 * - Implement toolset sharing and synchronization between apps
 * - Add application context awareness for tool filtering
 * - Support app-specific tool customization and overrides
 */

// Export types
export * from "./types.js";

// Export validator functions
export { validateToolsetConfig } from "./validator.js";

// Export loader functions
export { loadToolsetConfig, saveToolsetConfig } from "./loader.js";

/**
 * Main toolset manager class
 */
import { EventEmitter } from "events";
import {
  DiscoveredTool,
  IToolDiscoveryEngine,
  DiscoveredToolsChangedEvent,
} from "../discovery/types.js";
import {
  ToolsetConfig,
  ValidationResult,
  ToolsetChangeEvent,
  DynamicToolReference,
  ToolsetToolNote,
} from "./types.js";
import { loadToolsetConfig, saveToolsetConfig } from "./loader.js";
import { validateToolsetConfig } from "./validator.js";
import { createChildLogger } from "../utils/logging.js";
import {
  BuildToolsetResponse,
  ListSavedToolsetsResponse,
  EquipToolsetResponse,
  ToolsetInfo,
} from "../server/tools/schemas.js";
import { Tool } from "@modelcontextprotocol/sdk/types.js";

const logger = createChildLogger({ module: "toolset" });

export class ToolsetManager extends EventEmitter {
  private currentToolset?: ToolsetConfig;
  private configPath?: string;
  private discoveryEngine?: IToolDiscoveryEngine;

  constructor() {
    super();
  }

  /**
   * Load toolset configuration from file
   */
  async loadToolsetFromConfig(filePath: string): Promise<{
    success: boolean;
    validation: ValidationResult;
    error?: string;
  }> {
    const result = await loadToolsetConfig(filePath);

    if (result.config && result.validation.valid) {
      this.currentToolset = result.config;
      this.configPath = filePath;
    }

    return {
      success: result.validation.valid,
      validation: result.validation,
      error: result.error,
    };
  }

  /**
   * Save current configuration to file
   */
  async persistToolset(
    filePath?: string
  ): Promise<{ success: boolean; error?: string }> {
    if (!this.currentToolset) {
      return { success: false, error: "No configuration loaded" };
    }

    const targetPath = filePath || this.configPath;
    if (!targetPath) {
      return { success: false, error: "No file path specified" };
    }

    const result = await saveToolsetConfig(this.currentToolset, targetPath, {
      createDir: true,
      pretty: true,
    });
    if (result.success) {
      this.configPath = targetPath;
    }

    return result;
  }

  /**
   * Generate and set minimal empty configuration
   * Note: Users should create toolsets explicitly using build-toolset
   */
  generateDefaultConfig(
    _discoveredTools: DiscoveredTool[],
    options?: { name?: string; description?: string }
  ): ToolsetConfig {
    // Return empty toolset - users must select tools explicitly
    this.currentToolset = {
      name: options?.name || "empty-toolset",
      description:
        options?.description || "Empty toolset - add tools explicitly",
      version: "1.0.0",
      createdAt: new Date(),
      tools: [], // Intentionally empty - no default tools
    };
    return this.currentToolset;
  }

  /**
   * Set configuration directly
   */
  setCurrentToolset(toolsetConfig: ToolsetConfig): ValidationResult {
    const validation = validateToolsetConfig(toolsetConfig);
    if (validation.valid) {
      const previousConfig = this.currentToolset;
      this.currentToolset = toolsetConfig;

      // Emit toolset change event
      const event: ToolsetChangeEvent = {
        previousToolset: previousConfig || null,
        newToolset: toolsetConfig,
        changeType: previousConfig ? "updated" : "equipped",
        timestamp: new Date(),
      };
      logger.debug("toolsetChanged", event);
      this.emit("toolsetChanged", event);
    }
    return validation;
  }

  /**
   * Get current configuration
   */
  getCurrentToolset(): ToolsetConfig | undefined {
    return this.currentToolset;
  }

  // Note: applyConfig method removed since we eliminated ResolvedTool
  // The toolset system now works directly with DiscoveredTool objects

  /**
   * Validate current configuration
   */
  isCurrentToolsetValid(): ValidationResult {
    if (!this.currentToolset) {
      return {
        valid: false,
        errors: ["No configuration loaded"],
        warnings: [],
      };
    }

    return validateToolsetConfig(this.currentToolset);
  }

  /**
   * Check if configuration is loaded
   */
  isCurrentToolsetLoaded(): boolean {
    return this.currentToolset !== undefined;
  }

  /**
   * Get configuration file path
   */
  getConfigPath(): string | undefined {
    return this.configPath;
  }

  /**
   * Clear current configuration
   */
  clearCurrentToolset(): void {
    this.currentToolset = undefined;
    this.configPath = undefined;
  }

  /**
   * Set discovery engine reference for tool validation
   */
  setDiscoveryEngine(discoveryEngine: IToolDiscoveryEngine): void {
    this.discoveryEngine = discoveryEngine;

    // Listen for discovered tools changes and validate active toolset
    (discoveryEngine as any).on(
      "toolsChanged",
      (event: DiscoveredToolsChangedEvent) => {
        this.handleDiscoveredToolsChanged(event);
      }
    );
  }

  /** Hydrates the tool with any notes loaded from the toolset configuration. */
  _hydrateToolNotes(tool: Tool): Tool {
    if (!this.currentToolset?.toolNotes) {
      return tool;
    }

    // Find the original discovered tool to get its reference
    const discoveredTool = this.findDiscoveredToolByFlattenedName(tool.name);
    if (!discoveredTool) {
      return tool;
    }

    // Look for notes matching this tool by checking both namespacedName and refId
    const toolNotesEntry = this.currentToolset.toolNotes.find((entry) => {
      // Match by namespacedName if provided
      if (
        entry.toolRef.namespacedName &&
        entry.toolRef.namespacedName === discoveredTool.namespacedName
      ) {
        return true;
      }
      // Match by refId if provided
      if (
        entry.toolRef.refId &&
        entry.toolRef.refId === discoveredTool.toolHash
      ) {
        return true;
      }
      return false;
    });

    if (!toolNotesEntry || toolNotesEntry.notes.length === 0) {
      return tool;
    }

    // Format and append notes
    const notesSection = this.formatNotesForLLM(toolNotesEntry.notes);
    tool.description = tool.description
      ? `${tool.description}\n\n${notesSection}`
      : notesSection;

    return tool;
  }

  /** Formats a discovered tool into an MCP tool. */
  _getToolFromDiscoveredTool(dt: DiscoveredTool): Tool {
    let t = dt.tool;

    t.name = this.flattenToolName(dt.namespacedName);
    t.description = dt.tool.description || `Tool from ${dt.serverName} server`;

    return t;
  }

  /**
   * Get currently active MCP tools based on loaded toolset
   * Returns all discovered tools if no toolset is active
   */
  getMcpTools(): Array<Tool> {
    if (!this.discoveryEngine) {
      return [];
    }

    // If no toolset is active, return empty array (no tools should be exposed)
    if (!this.currentToolset || this.currentToolset.tools.length === 0) {
      return [];
    }

    // Filter tools based on active toolset
    const filteredTools: DiscoveredTool[] = [];

    for (const toolRef of this.currentToolset.tools) {
      const resolution = this.discoveryEngine.resolveToolReference(toolRef, {
        allowStaleRefs: false,
      });
      if (resolution?.exists && resolution.tool) {
        filteredTools.push(resolution.tool);
      }
    }

    // Convert to MCP tool format with flattened names for external exposure
    const generatedTools: Tool[] = filteredTools.map((dt: DiscoveredTool) => {
      let t = this._getToolFromDiscoveredTool(dt);
      t = this._hydrateToolNotes(t);

      return t;
    });

    return generatedTools;
  }

  /**
   * Get the original discovered tools that match the current toolset
   * Used internally for routing
   */
  getActiveDiscoveredTools(): DiscoveredTool[] {
    if (!this.discoveryEngine) {
      return [];
    }

    const discoveredTools = this.discoveryEngine.getAvailableTools(true);

    // If no toolset is active, return all tools
    if (!this.currentToolset || this.currentToolset.tools.length === 0) {
      return discoveredTools;
    }

    // Filter tools based on active toolset
    const filteredTools: DiscoveredTool[] = [];

    for (const toolRef of this.currentToolset.tools) {
      const resolution = this.discoveryEngine.resolveToolReference(toolRef, {
        allowStaleRefs: false,
      });
      if (resolution?.exists && resolution.tool) {
        filteredTools.push(resolution.tool);
      }
    }

    return filteredTools;
  }

  /**
   * Flatten tool name for external exposure (git.status → git_status)
   */
  private flattenToolName(namespacedName: string): string {
    return namespacedName.replace(/\./g, "_");
  }

  /**
   * Get original namespaced name from flattened name (git_status → git.status)
   */
  getOriginalToolName(flattenedName: string): string | null {
    if (!this.discoveryEngine) {
      return null;
    }

    const activeTools = this.getActiveDiscoveredTools();

    for (const tool of activeTools) {
      if (this.flattenToolName(tool.namespacedName) === flattenedName) {
        return tool.namespacedName;
      }
    }

    return null;
  }

  /**
   * Check if toolset is currently active
   */
  hasActiveToolset(): boolean {
    return (
      this.currentToolset !== undefined && this.currentToolset.tools.length > 0
    );
  }

  /**
   * Get active toolset information
   */
  getActiveToolsetInfo(): {
    name: string;
    description?: string;
    toolCount: number;
    version?: string;
    createdAt?: string;
  } | null {
    if (!this.currentToolset) {
      return null;
    }

    return {
      name: this.currentToolset.name,
      description: this.currentToolset.description,
      toolCount: this.currentToolset.tools.length,
      version: this.currentToolset.version,
      createdAt:
        this.currentToolset.createdAt instanceof Date
          ? this.currentToolset.createdAt.toISOString()
          : this.currentToolset.createdAt,
    };
  }

  /**
   * Create and save a new toolset
   */
  async buildToolset(
    name: string,
    tools: DynamicToolReference[],
    options: {
      description?: string;
      autoEquip?: boolean;
    } = {}
  ): Promise<BuildToolsetResponse> {
    try {
      // Validate toolset name format
      const namePattern = /^[a-z0-9-]+$/;
      if (!namePattern.test(name)) {
        return {
          meta: {
            success: false,
            error:
              "Invalid toolset name format. Use only lowercase letters, numbers, and hyphens (a-z, 0-9, -)",
          },
        };
      }

      if (name.length < 2 || name.length > 50) {
        return {
          meta: {
            success: false,
            error: "Toolset name must be between 2 and 50 characters",
          },
        };
      }

      if (!tools || tools.length === 0) {
        return {
          meta: {
            success: false,
            error: "Toolset must include at least one tool",
          },
        };
      }

      // Validate tool references if discovery engine is available
      if (this.discoveryEngine) {
        const validationResult = this.validateToolReferences(tools);
        if (!validationResult.valid) {
          return {
            meta: {
              success: false,
              error: `Invalid tool references: ${validationResult.invalidReferences.join(", ")}`,
            },
          };
        }
      }

      // Check if toolset already exists
      const preferences = await import("../config/preferenceStore.js");
      const loadToolsetsFromPreferences = preferences.loadStoredToolsets;
      const saveToolsetsToPreferences = preferences.saveStoredToolsets;
      const stored = await loadToolsetsFromPreferences();

      if (stored[name]) {
        return {
          meta: {
            success: false,
            error: `Toolset "${name}" already exists. Use a different name or delete the existing toolset first.`,
          },
        };
      }

      // Create toolset configuration
      const config: ToolsetConfig = {
        name,
        description: options.description,
        version: "1.0.0",
        createdAt: new Date(),
        tools,
      };

      // Validate configuration
      const validation = validateToolsetConfig(config);
      if (!validation.valid) {
        return {
          meta: {
            success: false,
            error: `Invalid toolset configuration: ${validation.errors.join(", ")}`,
          },
        };
      }

      // Save toolset
      stored[name] = config;
      await saveToolsetsToPreferences(stored);

      // Generate detailed toolset information
      const toolsetInfo = await this.generateToolsetInfo(config);

      const result = {
        meta: {
          success: true,
          toolsetName: name,
          autoEquipped: false,
        },
        toolset: toolsetInfo,
      };

      // Auto-equip if requested
      if (options.autoEquip) {
        const equipResult = await this.equipToolset(name);
        if (equipResult.success) {
          result.meta.autoEquipped = true;
          result.toolset.active = true;
        }
      }

      return result;
    } catch (error) {
      return {
        meta: {
          success: false,
          error: `Failed to create toolset: ${error instanceof Error ? error.message : String(error)}`,
        },
      };
    }
  }

  /**
   * Delete a saved toolset
   */
  async deleteToolset(
    name: string,
    options: { confirm?: boolean } = {}
  ): Promise<{
    success: boolean;
    error?: string;
    message?: string;
  }> {
    try {
      const preferences = await import("../config/preferenceStore.js");
      const loadToolsetsFromPreferences = preferences.loadStoredToolsets;
      const saveToolsetsToPreferences = preferences.saveStoredToolsets;
      const stored = await loadToolsetsFromPreferences();

      if (!stored[name]) {
        const availableNames = Object.keys(stored);
        return {
          success: false,
          error: `Toolset "${name}" not found. Available toolsets: ${availableNames.length > 0 ? availableNames.join(", ") : "none"}`,
        };
      }

      if (!options.confirm) {
        return {
          success: false,
          error: `Deletion requires confirmation. Set confirm: true to delete toolset "${name}".`,
        };
      }

      // Unequip if currently active
      if (this.currentToolset?.name === name) {
        await this.unequipToolset();
      }

      // Delete from storage
      delete stored[name];
      await saveToolsetsToPreferences(stored);

      return {
        success: true,
        message: `Toolset "${name}" has been deleted successfully.`,
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to delete toolset: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * List all saved toolsets
   */
  async listSavedToolsets(): Promise<ListSavedToolsetsResponse> {
    try {
      const preferences = await import("../config/preferenceStore.js");
      const loadToolsetsFromPreferences = preferences.loadStoredToolsets;
      const stored = await loadToolsetsFromPreferences();

      const toolsets = await Promise.all(
        Object.values(stored).map((config) => this.generateToolsetInfo(config))
      );

      return {
        success: true,
        toolsets,
      };
    } catch (error) {
      return {
        success: false,
        toolsets: [],
        error: `Failed to list toolsets: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Format discovered tools for display
   */
  formatAvailableTools(): {
    summary: {
      totalTools: number;
      totalServers: number;
    };
    toolsByServer: Array<{
      serverName: string;
      toolCount: number;
      tools: Array<{
        name: string;
        description?: string;
        namespacedName: string;
        serverName: string;
        refId: string;
      }>;
    }>;
  } {
    if (!this.discoveryEngine) {
      return {
        summary: { totalTools: 0, totalServers: 0 },
        toolsByServer: [],
      };
    }

    const discoveredTools = this.discoveryEngine.getAvailableTools(true);
    const serverToolsMap: Record<
      string,
      Array<{
        name: string;
        description?: string;
        namespacedName: string;
        serverName: string;
        refId: string;
      }>
    > = {};

    // Group tools by server
    for (const tool of discoveredTools) {
      if (!serverToolsMap[tool.serverName]) {
        serverToolsMap[tool.serverName] = [];
      }

      serverToolsMap[tool.serverName].push({
        name: tool.name,
        description: tool.tool.description,
        namespacedName: tool.namespacedName,
        serverName: tool.serverName,
        refId: tool.toolHash,
      });
    }

    // Convert to array format
    const toolsByServer = Object.entries(serverToolsMap).map(
      ([serverName, tools]) => ({
        serverName,
        toolCount: tools.length,
        tools: tools.sort((a, b) => a.name.localeCompare(b.name)),
      })
    );

    return {
      summary: {
        totalTools: discoveredTools.length,
        totalServers: Object.keys(serverToolsMap).length,
      },
      toolsByServer: toolsByServer.sort((a, b) =>
        a.serverName.localeCompare(b.serverName)
      ),
    };
  }

  /**
   * Validate tool references against discovery engine
   */
  validateToolReferences(tools: DynamicToolReference[]): {
    valid: boolean;
    validReferences: DynamicToolReference[];
    invalidReferences: DynamicToolReference[];
    resolvedTools: DiscoveredTool[];
  } {
    const validReferences: DynamicToolReference[] = [];
    const invalidReferences: DynamicToolReference[] = [];
    const resolvedTools: DiscoveredTool[] = [];

    if (!this.discoveryEngine) {
      return {
        valid: false,
        validReferences: [],
        invalidReferences: tools,
        resolvedTools: [],
      };
    }

    for (const toolRef of tools) {
      const resolution = this.discoveryEngine.resolveToolReference(toolRef, {
        allowStaleRefs: false,
      });

      if (resolution?.exists && resolution.tool) {
        validReferences.push(toolRef);
        resolvedTools.push(resolution.tool);
      } else {
        invalidReferences.push(toolRef);
      }
    }

    return {
      valid: invalidReferences.length === 0,
      validReferences,
      invalidReferences,
      resolvedTools,
    };
  }

  /**
   * Equip a toolset by loading it from storage
   */
  async equipToolset(toolsetName: string): Promise<EquipToolsetResponse> {
    try {
      // Import the function here to avoid circular imports
      const preferences = await import("../config/preferenceStore.js");
      const loadToolsetsFromPreferences = preferences.loadStoredToolsets;
      const saveLastEquippedToolset = preferences.saveLastEquippedToolset;

      const stored = await loadToolsetsFromPreferences();
      const toolsetConfig = stored[toolsetName];

      if (!toolsetConfig) {
        return { success: false, error: `Toolset "${toolsetName}" not found` };
      }

      const validation = this.setCurrentToolset(toolsetConfig);
      if (!validation.valid) {
        return {
          success: false,
          error: `Invalid toolset: ${validation.errors.join(", ")}`,
        };
      }

      // Save this as the last equipped toolset
      await saveLastEquippedToolset(toolsetName);

      // Generate toolset info with current status
      const toolsetInfo = await this.generateToolsetInfo(toolsetConfig);

      // Event is already emitted by setConfig()
      return {
        success: true,
        toolset: toolsetInfo,
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to load toolset: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Unequip the current toolset
   */
  async unequipToolset(): Promise<void> {
    const previousConfig = this.currentToolset;
    this.currentToolset = undefined;
    this.configPath = undefined;

    // Clear the last equipped toolset from preferences
    try {
      const preferences = await import("../config/preferenceStore.js");
      const saveLastEquippedToolset = preferences.saveLastEquippedToolset;
      await saveLastEquippedToolset(undefined);
    } catch (error) {
      logger.error(
        "Failed to clear last equipped toolset from preferences",
        error
      );
    }

    // Emit toolset change event
    if (previousConfig) {
      const event: ToolsetChangeEvent = {
        previousToolset: previousConfig,
        newToolset: null,
        changeType: "unequipped",
        timestamp: new Date(),
      };
      this.emit("toolsetChanged", event);
    }
  }

  /**
   * Get the current active toolset config (if any)
   */
  getActiveToolset(): ToolsetConfig | null {
    return this.currentToolset || null;
  }

  /**
   * Restore the last equipped toolset from preferences
   */
  async restoreLastEquippedToolset(): Promise<boolean> {
    try {
      const preferences = await import("../config/preferenceStore.js");
      const getLastEquippedToolset = preferences.getLastEquippedToolset;

      const lastToolsetName = await getLastEquippedToolset();
      if (!lastToolsetName) {
        logger.debug("No last equipped toolset found in preferences");
        return false;
      }

      logger.info(`Restoring last equipped toolset: ${lastToolsetName}`);
      const result = await this.equipToolset(lastToolsetName);

      if (result.success) {
        logger.info(`Successfully restored toolset: ${lastToolsetName}`);
        return true;
      } else {
        logger.warn(`Failed to restore toolset: ${result.error}`);
        return false;
      }
    } catch (error) {
      logger.error("Failed to restore last equipped toolset", error);
      return false;
    }
  }

  /**
   * Generate detailed toolset information
   */
  async generateToolsetInfo(config: ToolsetConfig): Promise<ToolsetInfo> {
    const serverToolCounts: Record<string, number> = {};
    const detailedTools: Array<{
      namespacedName: string;
      refId: string;
      server: string;
      active: boolean;
    }> = [];

    if (this.discoveryEngine) {
      // Process each tool reference
      for (const toolRef of config.tools) {
        const resolution:
          | {
              exists: boolean;
              tool?: any;
              serverName?: string;
              serverStatus?: any;
              namespacedNameMatch: boolean;
              refIdMatch: boolean;
              warnings: string[];
              errors: string[];
            }
          | undefined = this.discoveryEngine.resolveToolReference(toolRef, {
          allowStaleRefs: false,
        });

        if (resolution?.exists && resolution.tool) {
          const serverName = resolution.tool.serverName;
          serverToolCounts[serverName] =
            (serverToolCounts[serverName] || 0) + 1;

          // Add detailed tool information
          detailedTools.push({
            namespacedName: resolution.tool.namespacedName,
            refId: resolution.tool.toolHash,
            server: serverName,
            active: true, // Tool is available
          });
        } else {
          // Tool is not available, but we can still include it with the info we have
          detailedTools.push({
            namespacedName: toolRef.namespacedName || "unknown",
            refId: toolRef.refId || "unknown",
            server: "unknown",
            active: false, // Tool is not available
          });
        }
      }
    } else {
      // No discovery engine available, create tools array with basic info
      detailedTools.push(
        ...config.tools.map((toolRef) => ({
          namespacedName: toolRef.namespacedName || "unknown",
          refId: toolRef.refId || "unknown",
          server: "unknown",
          active: false, // Cannot determine availability without discovery engine
        }))
      );
    }

    const servers = Object.entries(serverToolCounts).map(
      ([name, toolCount]) => ({
        name,
        enabled: true,
        toolCount,
      })
    );

    return {
      name: config.name,
      description: config.description,
      version: config.version,
      createdAt:
        config.createdAt instanceof Date
          ? config.createdAt.toISOString()
          : config.createdAt,
      toolCount: config.tools.length,
      active: this.currentToolset?.name === config.name,
      location: `User preferences (${config.name})`,
      totalServers: servers.length,
      enabledServers: servers.length,
      totalTools: config.tools.length,
      servers,
      tools: detailedTools,
    };
  }

  /**
   * Format tool notes for LLM consumption
   */
  private formatNotesForLLM(notes: ToolsetToolNote[]): string {
    const formattedNotes = notes
      .map((note) => `• **${note.name}**: ${note.note}`)
      .join("\n");

    return `### Additional Tool Notes\n\n${formattedNotes}`;
  }

  /**
   * Find a discovered tool by its flattened name
   */
  private findDiscoveredToolByFlattenedName(
    flattenedName: string
  ): DiscoveredTool | null {
    if (!this.discoveryEngine) {
      return null;
    }

    // Get all discovered tools (not filtered by toolset) since we need to find
    // the tool to check if it has notes
    const allTools = this.discoveryEngine.getAvailableTools(true);

    for (const tool of allTools) {
      if (this.flattenToolName(tool.namespacedName) === flattenedName) {
        return tool;
      }
    }

    return null;
  }

  /**
   * Handle discovered tools changes and validate active toolset
   */
  private handleDiscoveredToolsChanged(
    event: DiscoveredToolsChangedEvent
  ): void {
    // Only validate if we have an active toolset
    if (!this.currentToolset || !this.discoveryEngine) {
      return;
    }

    // Check if any of our toolset's tools are affected by this server change
    const affectedTools: string[] = [];

    for (const toolRef of this.currentToolset.tools) {
      const resolution = this.discoveryEngine.resolveToolReference(toolRef, {
        allowStaleRefs: false,
      });

      // Check if this tool belongs to the server that changed
      if (resolution?.tool?.serverName === event.serverName) {
        // Check if this specific tool was removed or changed
        const wasRemoved = event.changes.some(
          (change) =>
            change.changeType === "removed" &&
            change.tool.namespacedName === resolution.tool!.namespacedName
        );

        const wasChanged = event.changes.some(
          (change) =>
            change.changeType === "updated" &&
            change.tool.namespacedName === resolution.tool!.namespacedName
        );

        if (wasRemoved || wasChanged) {
          affectedTools.push(resolution.tool.namespacedName);
        }
      }
    }

    // If any tools from our toolset were affected, emit a toolset change event
    // This will trigger the server to refresh its tool list
    if (affectedTools.length > 0) {
      const changeEvent: ToolsetChangeEvent = {
        previousToolset: this.currentToolset,
        newToolset: this.currentToolset, // Same toolset, but tools have changed
        changeType: "updated",
        timestamp: new Date(),
      };

      this.emit("toolsetChanged", changeEvent);
    }
  }
}
