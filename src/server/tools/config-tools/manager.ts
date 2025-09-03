/**
 * Configuration Tools Manager
 *
 * Manages all configuration-related tools for HyperTool MCP.
 * This component is responsible for exposing tools in configuration mode
 * separate from the operational tools managed by ToolsetManager.
 */

import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { ToolsProvider } from "../../types.js";
import { ToolModule, ToolDependencies } from "../types.js";
import { createChildLogger } from "../../../utils/logging.js";
import { CONFIG_TOOL_FACTORIES } from "./registry.js";
import { IToolsetDelegate } from "../interfaces/toolset-delegate.js";

const logger = createChildLogger({ module: "config-tools" });

/**
 * Manager for configuration tools in HyperTool MCP
 * Implements ToolsProvider interface for polymorphic tool handling
 */
export class ConfigToolsManager implements ToolsProvider {
  private toolModules: Map<string, ToolModule> = new Map();
  private dependencies: ToolDependencies;
  private onModeChangeRequest?: () => void;
  private dynamicConfigMenuEnabled: boolean;

  constructor(
    dependencies: ToolDependencies,
    onModeChangeRequest?: () => void
  ) {
    this.dependencies = dependencies;
    this.onModeChangeRequest = onModeChangeRequest;
    // Dynamic config menu is enabled when onModeChangeRequest is provided
    this.dynamicConfigMenuEnabled = !!onModeChangeRequest;

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

    for (const [toolName, module] of this.toolModules) {
      // When dynamic config menu is disabled, skip mode-switching tools
      if (!this.dynamicConfigMenuEnabled && toolName === 'exit-configuration-mode') {
        logger.debug('Skipping exit-configuration-mode tool when dynamic menu disabled');
        continue;
      }
      tools.push(module.definition);
    }

    logger.debug(`Returning ${tools.length} configuration tools`);
    return tools;
  }

  /**
   * Determine which toolset delegate to use based on persona activation state
   */
  private getActiveToolsetDelegate(): IToolsetDelegate {
    const activePersona = this.dependencies.personaManager?.getActivePersona();
    
    if (activePersona) {
      // PersonaManager will need to implement IToolsetDelegate interface
      return this.dependencies.personaManager as IToolsetDelegate;
    } else {
      // ToolsetManager will need to implement IToolsetDelegate interface
      return this.dependencies.toolsetManager as IToolsetDelegate;
    }
  }

  /**
   * Handle tool call - route to appropriate handler or delegate
   */
  public async handleToolCall(name: string, args: any): Promise<any> {
    // Check if this is a toolset operation that needs routing
    const toolsetOperations = ['list-saved-toolsets', 'equip-toolset', 'get-active-toolset'];
    const restrictedOperations = ['delete-toolset', 'build-toolset'];
    
    if (toolsetOperations.includes(name)) {
      // Route to appropriate delegate based on persona activation state
      const delegate = this.getActiveToolsetDelegate();
      const delegateType = delegate.getDelegateType();
      
      logger.debug(`Routing ${name} to ${delegateType} delegate`);
      
      switch (name) {
        case 'list-saved-toolsets':
          return delegate.listSavedToolsets();
        case 'equip-toolset':
          return delegate.equipToolset(args?.name);
        case 'get-active-toolset':
          return delegate.getActiveToolset();
        default:
          throw new Error(`Unhandled toolset operation: ${name}`);
      }
    }
    
    if (restrictedOperations.includes(name)) {
      // Check if we're in persona mode
      const activePersona = this.dependencies.personaManager?.getActivePersona();
      
      if (activePersona) {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              success: false,
              error: `Tool "${name}" is not available when a persona is active. Persona toolsets are managed automatically by the persona system.`,
            }),
          }],
          structuredContent: {
            success: false,
            error: `Tool "${name}" is not available when a persona is active.`,
          },
        };
      }
      
      // Fall through to normal handling for regular mode
    }

    // Handle regular configuration tools
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
