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
export * from "./types";

// Export validator functions
export { validateToolsetConfig, matchesToolPattern } from "./validator";

// Export loader functions
export {
  loadToolsetConfig,
  saveToolsetConfig,
  loadToolsetConfigs,
  fileExists,
  getDefaultConfigPath,
  createExampleConfig,
} from "./loader";

// Note: Filtering is now handled by ToolsetManager.applyConfig()

// Export generator functions
export {
  generateDefaultToolsetConfig,
  generateMinimalToolsetConfig,
  generateUseCaseToolsetConfig,
  generateConflictAwareToolsetConfig,
} from "./generator";

/**
 * Main toolset manager class
 */
import { DiscoveredTool, IToolDiscoveryEngine } from "../discovery/types";
import { ToolsetConfig, ToolsetResolution, ValidationResult, ResolvedTool } from "./types";
import { loadToolsetConfig, saveToolsetConfig } from "./loader";
import { validateToolsetConfig } from "./validator";

export class ToolsetManager {
  private currentConfig?: ToolsetConfig;
  private configPath?: string;

  /**
   * Load toolset configuration from file
   */
  async loadConfig(
    filePath: string
  ): Promise<{
    success: boolean;
    validation: ValidationResult;
    error?: string;
  }> {
    const result = await loadToolsetConfig(filePath);

    if (result.config && result.validation.valid) {
      this.currentConfig = result.config;
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
  async saveConfig(
    filePath?: string
  ): Promise<{ success: boolean; error?: string }> {
    if (!this.currentConfig) {
      return { success: false, error: "No configuration loaded" };
    }

    const targetPath = filePath || this.configPath;
    if (!targetPath) {
      return { success: false, error: "No file path specified" };
    }

    const result = await saveToolsetConfig(this.currentConfig, targetPath, {
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
    this.currentConfig = {
      name: options?.name || "empty-toolset",
      description: options?.description || "Empty toolset - add tools explicitly",
      version: "1.0.0",
      createdAt: new Date(),
      tools: [], // Intentionally empty - no default tools
    };
    return this.currentConfig;
  }

  /**
   * Set configuration directly
   */
  setConfig(config: ToolsetConfig): ValidationResult {
    const validation = validateToolsetConfig(config);
    if (validation.valid) {
      this.currentConfig = config;
    }
    return validation;
  }

  /**
   * Get current configuration
   */
  getConfig(): ToolsetConfig | undefined {
    return this.currentConfig;
  }

  /**
   * Apply current configuration using discovery engine for tool resolution
   */
  async applyConfig(
    discoveredTools: DiscoveredTool[],
    discoveryEngine?: IToolDiscoveryEngine
  ): Promise<ToolsetResolution> {
    if (!this.currentConfig) {
      return {
        success: false,
        tools: [],
        errors: ["No configuration loaded"],
      };
    }

    const startTime = Date.now();
    const resolvedTools: ResolvedTool[] = [];
    const allWarnings: string[] = [];
    const errors: string[] = [];

    // Group tools by server for statistics
    const toolsByServer: Record<string, number> = {};

    // Validate and resolve each tool reference using discovery engine
    for (const toolRef of this.currentConfig.tools) {
      if (discoveryEngine) {
        // Use discovery engine to resolve the tool reference with strict validation by default
        const resolution = discoveryEngine.resolveToolReference(toolRef, { 
          allowStaleRefs: false // Secure by default
        });
        
        // Handle warnings from resolution
        if (resolution.warnings && resolution.warnings.length > 0) {
          allWarnings.push(...resolution.warnings);
        }
        
        // Handle errors from strict validation
        if (resolution.errors && resolution.errors.length > 0) {
          allWarnings.push(...resolution.errors.map(err => `SECURITY: ${err}`));
        }
        
        if (!resolution.exists || !resolution.tool) {
          // Tool was rejected or not found - skip and continue with others
          if (resolution.errors.length === 0) {
            allWarnings.push(`Tool not found: ${toolRef.namespacedName || toolRef.refId}`);
          }
          continue;
        }
        
        const foundTool = resolution.tool;
        const serverName = resolution.serverName!;
        
        // Count tools by server
        toolsByServer[serverName] = (toolsByServer[serverName] || 0) + 1;
        
        // Convert to resolved tool
        resolvedTools.push({
          originalName: foundTool.name,
          resolvedName: foundTool.namespacedName,
          serverName: serverName,
          isNamespaced: true,
          namespace: serverName,
          description: foundTool.description,
          inputSchema: foundTool.schema,
        });
      } else {
        // Fallback to manual lookup if no discovery engine provided
        let foundTool: DiscoveredTool | undefined;
        
        if (toolRef.namespacedName) {
          foundTool = discoveredTools.find(tool => tool.namespacedName === toolRef.namespacedName);
        }
        
        if (!foundTool && toolRef.refId) {
          foundTool = discoveredTools.find(tool => tool.fullHash === toolRef.refId);
        }
        
        if (!foundTool) {
          allWarnings.push(`Tool reference not found: ${toolRef.namespacedName || toolRef.refId}`);
          continue;
        }
        
        // Count tools by server
        toolsByServer[foundTool.serverName] = (toolsByServer[foundTool.serverName] || 0) + 1;
        
        resolvedTools.push({
          originalName: foundTool.name,
          resolvedName: foundTool.namespacedName,
          serverName: foundTool.serverName,
          isNamespaced: true,
          namespace: foundTool.serverName,
          description: foundTool.description,
          inputSchema: foundTool.schema,
        });
      }
    }

    return {
      success: errors.length === 0,
      tools: resolvedTools,
      warnings: allWarnings,
      errors,
      stats: {
        totalDiscovered: discoveredTools.length,
        totalIncluded: resolvedTools.length,
        totalExcluded: discoveredTools.length - resolvedTools.length,
        toolsByServer,
        conflictsDetected: 0,
        resolutionTime: Date.now() - startTime,
      },
    };
  }

  /**
   * Validate current configuration
   */
  validateConfig(): ValidationResult {
    if (!this.currentConfig) {
      return {
        valid: false,
        errors: ["No configuration loaded"],
        warnings: [],
      };
    }

    return validateToolsetConfig(this.currentConfig);
  }

  /**
   * Check if configuration is loaded
   */
  isConfigLoaded(): boolean {
    return this.currentConfig !== undefined;
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
  clearConfig(): void {
    this.currentConfig = undefined;
    this.configPath = undefined;
  }
}
