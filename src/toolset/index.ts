/**
 * Toolset configuration system
 *
 * This module provides a complete toolset configuration system that allows users
 * to specify which tools to expose from each MCP server with support for:
 * - JSON-based configuration with validation
 * - Wildcard and regex patterns for tool selection
 * - Conflict resolution strategies
 * - Default configuration generation
 */

// Export types
export * from "./types.js";

// Export validator functions
export { validateToolsetConfig } from "./validator.js";

// Export loader functions
export {
  loadToolsetConfig,
  saveToolsetConfig,
} from "./loader.js";

/**
 * Main toolset manager class
 */
import { EventEmitter } from "events";
import { DiscoveredTool, IToolDiscoveryEngine, DiscoveredToolsChangedEvent } from "../discovery/types.js";
import { ToolsetConfig, ValidationResult, ToolsetChangeEvent, DynamicToolReference } from "./types.js";
import { loadToolsetConfig, saveToolsetConfig } from "./loader.js";
import { validateToolsetConfig } from "./validator.js";

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
  async loadToolsetFromConfig(
    filePath: string
  ): Promise<{
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
      description: options?.description || "Empty toolset - add tools explicitly",
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
        changeType: previousConfig ? 'updated' : 'equipped',
        timestamp: new Date()
      };
      console.debug('toolsetChanged', event);
      this.emit('toolsetChanged', event);
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
    (discoveryEngine as any).on('toolsChanged', (event: DiscoveredToolsChangedEvent) => {
      this.handleDiscoveredToolsChanged(event);
    });
  }

  /**
   * Get currently active MCP tools based on loaded toolset
   * Returns all discovered tools if no toolset is active
   */
  getMcpTools(): Array<{ name: string; description: string; inputSchema: any }> {
    if (!this.discoveryEngine) {
      return [];
    }

    const discoveredTools = this.discoveryEngine.getAvailableTools(true);

    // If no toolset is active, return empty array (no tools should be exposed)
    if (!this.currentToolset || this.currentToolset.tools.length === 0) {
      return [];
    }

    // Filter tools based on active toolset
    const filteredTools: DiscoveredTool[] = [];

    for (const toolRef of this.currentToolset.tools) {
      const resolution = this.discoveryEngine.resolveToolReference(toolRef, { allowStaleRefs: false });
      if (resolution?.exists && resolution.tool) {
        filteredTools.push(resolution.tool);
      }
    }

    // Convert to MCP tool format with flattened names for external exposure
    return filteredTools.map(tool => ({
      name: this.flattenToolName(tool.namespacedName),
      description: tool.tool.description || `Tool from ${tool.serverName} server`,
      inputSchema: {
        ...tool.tool.inputSchema,
        type: "object" as const,
      },
    }));
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
      const resolution = this.discoveryEngine.resolveToolReference(toolRef, { allowStaleRefs: false });
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
    return namespacedName.replace(/\./g, '_');
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
    return this.currentToolset !== undefined && this.currentToolset.tools.length > 0;
  }

  /**
   * Get active toolset information
   */
  getActiveToolsetInfo(): { name: string; description?: string; toolCount: number; version?: string; createdAt?: Date } | null {
    if (!this.currentToolset) {
      return null;
    }

    return {
      name: this.currentToolset.name,
      description: this.currentToolset.description,
      toolCount: this.currentToolset.tools.length,
      version: this.currentToolset.version,
      createdAt: this.currentToolset.createdAt,
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
  ): Promise<{
    success: boolean;
    error?: string;
    toolsetName?: string;
    location?: string;
    configuration?: {
      totalServers: number;
      enabledServers: number;
      totalTools: number;
      servers: Array<{
        name: string;
        enabled: boolean;
        toolCount: number;
      }>;
    };
    createdAt?: string;
    autoEquipped?: boolean;
  }> {
    try {
      // Validate toolset name format
      const namePattern = /^[a-z0-9-]+$/;
      if (!namePattern.test(name)) {
        return {
          success: false,
          error: "Invalid toolset name format. Use only lowercase letters, numbers, and hyphens (a-z, 0-9, -)"
        };
      }

      if (name.length < 2 || name.length > 50) {
        return {
          success: false,
          error: "Toolset name must be between 2 and 50 characters"
        };
      }

      if (!tools || tools.length === 0) {
        return {
          success: false,
          error: "Toolset must include at least one tool"
        };
      }

      // Validate tool references if discovery engine is available
      if (this.discoveryEngine) {
        const validationResult = this.validateToolReferences(tools);
        if (!validationResult.valid) {
          return {
            success: false,
            error: `Invalid tool references: ${validationResult.invalidReferences.join(', ')}`
          };
        }
      }

      // Check if toolset already exists
      const preferences = await import("../config/preferences.js");
      const loadToolsetsFromPreferences = preferences.loadStoredToolsets;
      const saveToolsetsToPreferences = preferences.saveStoredToolsets;
      const stored = await loadToolsetsFromPreferences();

      if (stored[name]) {
        return {
          success: false,
          error: `Toolset "${name}" already exists. Use a different name or delete the existing toolset first.`
        };
      }

      // Create toolset configuration
      const config: ToolsetConfig = {
        name,
        description: options.description,
        version: "1.0.0",
        createdAt: new Date(),
        tools
      };

      // Validate configuration
      const validation = validateToolsetConfig(config);
      if (!validation.valid) {
        return {
          success: false,
          error: `Invalid toolset configuration: ${validation.errors.join(', ')}`
        };
      }

      // Save toolset
      stored[name] = config;
      await saveToolsetsToPreferences(stored);

      // Generate configuration summary
      const serverToolCounts: Record<string, number> = {};
      if (this.discoveryEngine) {
        for (const toolRef of tools) {
          const resolution: {
            exists: boolean;
            tool?: DiscoveredTool;
            serverName?: string;
            serverStatus?: any;
            namespacedNameMatch: boolean;
            refIdMatch: boolean;
            warnings: string[];
            errors: string[];
          } | undefined = this.discoveryEngine.resolveToolReference(toolRef, { allowStaleRefs: false });
          if (resolution?.exists && resolution.tool) {
            const serverName = resolution.tool.serverName;
            serverToolCounts[serverName] = (serverToolCounts[serverName] || 0) + 1;
          }
        }
      }

      const servers = Object.entries(serverToolCounts).map(([name, toolCount]) => ({
        name,
        enabled: true,
        toolCount
      }));

      const result = {
        success: true,
        toolsetName: name,
        location: `User preferences (${name})`,
        configuration: {
          totalServers: servers.length,
          enabledServers: servers.length,
          totalTools: tools.length,
          servers
        },
        createdAt: config.createdAt?.toISOString(),
        autoEquipped: false
      };

      // Auto-equip if requested
      if (options.autoEquip) {
        const equipResult = await this.equipToolset(name);
        if (equipResult.success) {
          result.autoEquipped = true;
        }
      }

      return result;
    } catch (error) {
      return {
        success: false,
        error: `Failed to create toolset: ${error instanceof Error ? error.message : String(error)}`
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
      const preferences = await import("../config/preferences.js");
      const loadToolsetsFromPreferences = preferences.loadStoredToolsets;
      const saveToolsetsToPreferences = preferences.saveStoredToolsets;
      const stored = await loadToolsetsFromPreferences();

      if (!stored[name]) {
        const availableNames = Object.keys(stored);
        return {
          success: false,
          error: `Toolset "${name}" not found. Available toolsets: ${availableNames.length > 0 ? availableNames.join(', ') : 'none'}`
        };
      }

      if (!options.confirm) {
        return {
          success: false,
          error: `Deletion requires confirmation. Set confirm: true to delete toolset "${name}".`
        };
      }

      // Unequip if currently active
      if (this.currentToolset?.name === name) {
        this.unequipToolset();
      }

      // Delete from storage
      delete stored[name];
      await saveToolsetsToPreferences(stored);

      return {
        success: true,
        message: `Toolset "${name}" has been deleted successfully.`
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to delete toolset: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * List all saved toolsets
   */
  async listSavedToolsets(): Promise<{
    success: boolean;
    toolsets: Array<{
      name: string;
      description?: string;
      version?: string;
      createdAt?: string;
      toolCount: number;
      active: boolean;
    }>;
    error?: string;
  }> {
    try {
      const preferences = await import("../config/preferences.js");
      const loadToolsetsFromPreferences = preferences.loadStoredToolsets;
      const stored = await loadToolsetsFromPreferences();

      const toolsets = Object.values(stored).map(config => ({
        name: config.name,
        description: config.description,
        version: config.version,
        createdAt: config.createdAt?.toISOString(),
        toolCount: config.tools.length,
        active: this.currentToolset?.name === config.name
      }));

      return {
        success: true,
        toolsets
      };
    } catch (error) {
      return {
        success: false,
        toolsets: [],
        error: `Failed to list toolsets: ${error instanceof Error ? error.message : String(error)}`
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
        toolsByServer: []
      };
    }

    const discoveredTools = this.discoveryEngine.getAvailableTools(true);
    const serverToolsMap: Record<string, Array<{
      name: string;
      description?: string;
      namespacedName: string;
      serverName: string;
      refId: string;
    }>> = {};

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
    const toolsByServer = Object.entries(serverToolsMap).map(([serverName, tools]) => ({
      serverName,
      toolCount: tools.length,
      tools: tools.sort((a, b) => a.name.localeCompare(b.name))
    }));

    return {
      summary: {
        totalTools: discoveredTools.length,
        totalServers: Object.keys(serverToolsMap).length
      },
      toolsByServer: toolsByServer.sort((a, b) => a.serverName.localeCompare(b.serverName))
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
        resolvedTools: []
      };
    }

    for (const toolRef of tools) {
      const resolution = this.discoveryEngine.resolveToolReference(toolRef, { allowStaleRefs: false });

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
      resolvedTools
    };
  }

  /**
   * Equip a toolset by loading it from storage
   */
  async equipToolset(toolsetName: string): Promise<{ success: boolean; error?: string }> {
    try {
      // Import the function here to avoid circular imports
      const preferences = await import("../config/preferences.js");
      const loadToolsetsFromPreferences = preferences.loadStoredToolsets;

      const stored = await loadToolsetsFromPreferences();
      const toolsetConfig = stored[toolsetName];

      if (!toolsetConfig) {
        return { success: false, error: `Toolset "${toolsetName}" not found` };
      }

      const validation = this.setCurrentToolset(toolsetConfig);
      if (!validation.valid) {
        return { success: false, error: `Invalid toolset: ${validation.errors.join(", ")}` };
      }

      // Event is already emitted by setConfig()
      return { success: true };
    } catch (error) {
      return { success: false, error: `Failed to load toolset: ${error instanceof Error ? error.message : String(error)}` };
    }
  }

  /**
   * Unequip the current toolset
   */
  unequipToolset(): void {
    const previousConfig = this.currentToolset;
    this.currentToolset = undefined;
    this.configPath = undefined;

    // Emit toolset change event
    if (previousConfig) {
      const event: ToolsetChangeEvent = {
        previousToolset: previousConfig,
        newToolset: null,
        changeType: 'unequipped',
        timestamp: new Date()
      };
      this.emit('toolsetChanged', event);
    }
  }

  /**
   * Get the current active toolset config (if any)
   */
  getActiveToolset(): ToolsetConfig | null {
    return this.currentToolset || null;
  }

  /**
   * Handle discovered tools changes and validate active toolset
   */
  private handleDiscoveredToolsChanged(event: DiscoveredToolsChangedEvent): void {
    // Only validate if we have an active toolset
    if (!this.currentToolset || !this.discoveryEngine) {
      return;
    }

    // Check if any of our toolset's tools are affected by this server change
    const affectedTools: string[] = [];

    for (const toolRef of this.currentToolset.tools) {
      const resolution = this.discoveryEngine.resolveToolReference(toolRef, { allowStaleRefs: false });

      // Check if this tool belongs to the server that changed
      if (resolution?.tool?.serverName === event.serverName) {
        // Check if this specific tool was removed or changed
        const wasRemoved = event.changes.some(change =>
          change.changeType === 'removed' &&
          change.tool.namespacedName === resolution.tool!.namespacedName
        );

        const wasChanged = event.changes.some(change =>
          change.changeType === 'updated' &&
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
        changeType: 'updated',
        timestamp: new Date()
      };

      this.emit('toolsetChanged', changeEvent);
    }
  }
}
