/**
 * Persona Tools Manager
 *
 * Manages all persona-related tools for HyperTool MCP.
 * This component is responsible for exposing persona management tools
 * that allow discovery, validation, and activation of persona content packs.
 */

import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { ToolsProvider } from "../../types.js";
import { ToolModule, ToolDependencies } from "../types.js";
import { createChildLogger } from "../../../utils/logging.js";
import { PERSONA_TOOL_FACTORIES } from "./registry.js";

const logger = createChildLogger({ module: "persona-tools" });

/**rev
 * Manager for persona tools in HyperTool MCP
 * Implements ToolsProvider interface for polymorphic tool handling
 */
export class PersonaToolsManager implements ToolsProvider {
  private toolModules: Map<string, ToolModule> = new Map();
  private dependencies: ToolDependencies;

  constructor(dependencies: ToolDependencies) {
    this.dependencies = dependencies;
    this.registerTools();
  }

  /**
   * Register all persona tools
   */
  private registerTools(): void {
    logger.debug("Registering persona tools");

    // Create and register each persona tool module from the registry
    for (const factory of PERSONA_TOOL_FACTORIES) {
      const module = factory(this.dependencies);
      this.toolModules.set(module.toolName, module);
    }

    logger.info(`Registered ${this.toolModules.size} persona tools`);
  }

  /**
   * Get MCP tool definitions
   * @returns Array of tool definitions for MCP protocol
   */
  getMcpTools(): Tool[] {
    return Array.from(this.toolModules.values()).map(
      (module) => module.definition
    );
  }

  /**
   * Get tool module by name
   * @param toolName Name of the tool to retrieve
   * @returns Tool module if found, undefined otherwise
   */
  getToolModule(toolName: string): ToolModule | undefined {
    return this.toolModules.get(toolName);
  }

  /**
   * Check if a tool is handled by this manager
   * @param toolName Name of the tool to check
   * @returns True if the tool is handled by this manager
   */
  hasTool(toolName: string): boolean {
    return this.toolModules.has(toolName);
  }

  /**
   * Execute a tool handler
   * @param toolName Name of the tool to execute
   * @param args Arguments to pass to the tool handler
   * @returns Promise resolving to the tool execution result
   */
  async handleTool(toolName: string, args: any): Promise<any> {
    const module = this.toolModules.get(toolName);
    if (!module) {
      throw new Error(`Persona tool "${toolName}" not found`);
    }

    logger.debug(`Executing persona tool: ${toolName}`);
    return await module.handler(args);
  }

  /**
   * Get list of available tool names
   * @returns Array of tool names managed by this manager
   */
  getToolNames(): string[] {
    return Array.from(this.toolModules.keys());
  }
}
