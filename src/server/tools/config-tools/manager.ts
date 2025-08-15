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
  ToolDependencies
} from "../types.js";
import { createChildLogger } from "../../../utils/logging.js";
import { CONFIG_TOOL_FACTORIES } from "./registry.js";

const logger = createChildLogger({ module: "config-tools" });

/**
 * Manager for configuration tools in HyperTool MCP
 * Implements ToolsProvider interface for polymorphic tool handling
 */
export class ConfigToolsManager implements ToolsProvider {
  private toolModules: Map<string, ToolModule> = new Map();
  private dependencies: ToolDependencies;
  private onModeChangeRequest?: () => void;

  constructor(
    dependencies: ToolDependencies,
    onModeChangeRequest?: () => void
  ) {
    this.dependencies = dependencies;
    this.onModeChangeRequest = onModeChangeRequest;
    
    this.registerTools();
  }

  /**
   * Register all configuration tools
   */
  private registerTools(): void {
    logger.debug("Registering configuration tools");

    // Create and register each configuration tool module from the registry
    for (const factory of CONFIG_TOOL_FACTORIES) {
      const module = factory(this.dependencies, this.onModeChangeRequest);
      this.toolModules.set(module.toolName, module);
    }

    logger.info(`Registered ${this.toolModules.size} configuration tools`);
  }



  /**
   * Get MCP tools for configuration mode
   * Implements ToolsProvider interface
   */
  public getMcpTools(): Tool[] {
    // Return all configuration tools - server decides when to call this
    const tools: Tool[] = [];
    
    for (const [_toolName, module] of this.toolModules) {
      tools.push(module.definition);
    }

    logger.debug(`Returning ${tools.length} configuration tools`);
    return tools;
  }


  /**
   * Handle tool call - route to appropriate handler
   */
  public async handleToolCall(name: string, args: any): Promise<any> {
    const module = this.toolModules.get(name);
    
    if (!module) {
      throw new Error(`Configuration tool not found: ${name}`);
    }

    logger.debug(`Handling configuration tool call: ${name}`, { args });
    
    try {
      const result = await module.handler(args);
      logger.debug(`Configuration tool call completed: ${name}`);
      return result;
    } catch (error) {
      logger.error(`Configuration tool call failed: ${name}`, error);
      throw error;
    }
  }

  /**
   * Get all registered tool modules (for testing)
   */
  public getToolModules(): Map<string, ToolModule> {
    return this.toolModules;
  }
}