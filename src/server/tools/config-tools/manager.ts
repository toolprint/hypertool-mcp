/**
 * Configuration Tools Manager
 * 
 * Manages all configuration-related tools for HyperTool MCP.
 * This component is responsible for exposing tools in configuration mode
 * separate from the operational tools managed by ToolsetManager.
 */

import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { ToolsProvider } from "../../types.js";
import { 
  ToolModule, 
  ToolDependencies, 
  ToolModuleFactory 
} from "../types.js";
import { ConfigToolDependencies, ConfigToolModule } from "./types.js";
import { createChildLogger } from "../../../utils/logging.js";

// Import configuration tool factories from local tools directory
import { createListAvailableToolsModule } from "./tools/list-available-tools.js";
import { createBuildToolsetModule } from "./tools/build-toolset.js";
import { createListSavedToolsetsModule } from "./tools/list-saved-toolsets.js";
import { createEquipToolsetModule } from "./tools/equip-toolset.js";
import { createDeleteToolsetModule } from "./tools/delete-toolset.js";
import { createUnequipToolsetModule } from "./tools/unequip-toolset.js";
import { createGetActiveToolsetModule } from "./tools/get-active-toolset.js";
import { createAddToolAnnotationModule } from "./tools/add-tool-annotation.js";

const logger = createChildLogger({ module: "config-tools" });

/**
 * Manager for configuration tools in HyperTool MCP
 * Implements ToolsProvider interface for polymorphic tool handling
 */
export class ConfigToolsManager implements ToolsProvider {
  private toolModules: Map<string, ConfigToolModule> = new Map();
  private dependencies: ToolDependencies;
  private configurationMode: boolean = false;

  constructor(
    dependencies: ToolDependencies,
    private configDependencies: ConfigToolDependencies = {}
  ) {
    this.dependencies = dependencies;
    
    // Set up mode callbacks if provided
    if (configDependencies.setConfigurationMode) {
      this.setConfigurationMode = this.setConfigurationMode.bind(this);
    }
    if (configDependencies.isConfigurationMode) {
      this.isConfigurationMode = configDependencies.isConfigurationMode.bind(this);
    }
    
    this.registerTools();
  }

  /**
   * Register all configuration tools
   */
  private registerTools(): void {
    logger.debug("Registering configuration tools");

    // Register existing configuration tools
    const toolFactories: ToolModuleFactory[] = [
      createListAvailableToolsModule,
      createBuildToolsetModule,
      createListSavedToolsetsModule,
      createEquipToolsetModule,
      createDeleteToolsetModule,
      createUnequipToolsetModule,
      createGetActiveToolsetModule,
      createAddToolAnnotationModule,
    ];

    // Create and register each tool module
    for (const factory of toolFactories) {
      const module = factory(this.dependencies);
      this.registerToolModule(module, "configuration");
    }

    // Note: Mode switching tools will be added in TASK-002
    // They will be registered here with appropriate availableInMode settings

    logger.info(`Registered ${this.toolModules.size} configuration tools`);
  }

  /**
   * Register a single tool module
   */
  private registerToolModule(
    module: ToolModule,
    availableInMode: "configuration" | "normal" | "both" = "configuration"
  ): void {
    const configModule: ConfigToolModule = {
      ...module,
      availableInMode,
    };
    this.toolModules.set(module.toolName, configModule);
    logger.debug(`Registered tool: ${module.toolName} (available in: ${availableInMode})`);
  }

  /**
   * Set the current configuration mode
   */
  public setConfigurationMode(mode: boolean): void {
    const previousMode = this.configurationMode;
    this.configurationMode = mode;
    
    if (previousMode !== mode) {
      logger.info(`Configuration mode changed: ${previousMode} -> ${mode}`);
    }
  }

  /**
   * Get the current configuration mode
   */
  public isConfigurationMode(): boolean {
    return this.configurationMode;
  }

  /**
   * Get MCP tools based on current mode
   * Implements ToolsProvider interface
   */
  public getMcpTools(): Tool[] {
    const tools: Tool[] = [];
    
    for (const [toolName, module] of this.toolModules) {
      // Filter tools based on current mode
      const shouldInclude = this.shouldIncludeTool(module);
      
      if (shouldInclude) {
        tools.push(module.definition);
        logger.debug(`Including tool in response: ${toolName}`);
      }
    }

    logger.debug(`Returning ${tools.length} tools for mode: ${this.configurationMode ? 'configuration' : 'normal'}`);
    return tools;
  }

  /**
   * Determine if a tool should be included based on current mode
   */
  private shouldIncludeTool(module: ConfigToolModule): boolean {
    const mode = module.availableInMode || "configuration";
    
    if (mode === "both") {
      return true;
    }
    
    if (this.configurationMode && mode === "configuration") {
      return true;
    }
    
    if (!this.configurationMode && mode === "normal") {
      return true;
    }
    
    return false;
  }

  /**
   * Handle tool call - route to appropriate handler
   */
  public async handleToolCall(name: string, args: any): Promise<any> {
    const module = this.toolModules.get(name);
    
    if (!module) {
      throw new Error(`Tool not found: ${name}`);
    }

    // Check if tool is available in current mode
    if (!this.shouldIncludeTool(module)) {
      throw new Error(`Tool not available in current mode: ${name}`);
    }

    logger.debug(`Handling tool call: ${name}`, { args });
    
    try {
      const result = await module.handler(args);
      logger.debug(`Tool call completed: ${name}`);
      return result;
    } catch (error) {
      logger.error(`Tool call failed: ${name}`, error);
      throw error;
    }
  }

  /**
   * Get all registered tool modules (for testing)
   */
  public getToolModules(): Map<string, ConfigToolModule> {
    return this.toolModules;
  }

  /**
   * Register mode switching tools (will be called from TASK-002)
   */
  public registerModeSwitchingTools(
    enterConfigModeModule: ToolModule,
    exitConfigModeModule: ToolModule
  ): void {
    // Enter config mode is available in normal mode
    this.registerToolModule(enterConfigModeModule, "normal");
    
    // Exit config mode is available in configuration mode  
    this.registerToolModule(exitConfigModeModule, "configuration");
    
    logger.info("Registered mode switching tools");
  }
}