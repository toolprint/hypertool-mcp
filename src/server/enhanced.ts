/**
 * Enhanced Hypertool MCP server with request routing capabilities
 */

import { MetaMCPServer } from "./base.js";
import { MetaMCPServerConfig, ServerInitOptions } from "./types.js";
import { RuntimeOptions } from "../types/runtime.js";
import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { IRequestRouter, RequestRouter } from "../router/index.js";
import {
  IToolDiscoveryEngine,
  ToolDiscoveryEngine,
} from "../discovery/index.js";
import { IConnectionManager, ConnectionManager } from "../connection/index.js";
import { MCPConfigParser, APP_NAME, ServerConfig } from "../config/index.js";
import ora from "ora";
import { createChildLogger } from "../utils/logging.js";

const logger = createChildLogger({ module: "server/enhanced" });
// Note: All mcp-tools functionality now handled by ToolsetManager
import { ToolsetManager, ToolsetChangeEvent } from "../toolset/manager.js";
import { DiscoveredToolsChangedEvent } from "../discovery/types.js";
import {
  ToolDependencies,
  ToolModule,
  TOOL_MODULE_FACTORIES,
} from "./tools/index.js";
import chalk from "chalk";
import { output } from "../utils/output.js";
/**
 * Enhanced Hypertool MCP server with routing capabilities
 */
export class EnhancedMetaMCPServer extends MetaMCPServer {
  private requestRouter?: IRequestRouter;
  private discoveryEngine?: IToolDiscoveryEngine;
  private connectionManager?: IConnectionManager;
  private configParser?: MCPConfigParser;
  private toolsetManager: ToolsetManager;
  private runtimeOptions?: RuntimeOptions;
  private toolModules: ToolModule[] = [];
  private toolModuleMap: Map<string, ToolModule> = new Map();

  constructor(config: MetaMCPServerConfig) {
    super(config);
    this.toolsetManager = new ToolsetManager();
  }

  /**
   * Enhanced start method with routing initialization
   */
  async start(
    options: ServerInitOptions,
    runtimeOptions?: RuntimeOptions
  ): Promise<void> {
    this.runtimeOptions = runtimeOptions;

    await this.initializeRouting(options);
    await super.start(options);
  }

  private async loadMcpConfigOrExit(
    options: ServerInitOptions
  ): Promise<Record<string, ServerConfig>> {
    // Initialize config parser
    const mainSpinner = ora("Loading MCP configuration...").start();
    this.configParser = new MCPConfigParser();

    // Load configuration if path provided
    let serverConfigs: Record<string, ServerConfig> = {};
    if (options.configPath) {
      const parseResult = await this.configParser.parseFile(options.configPath);

      if (parseResult.success && parseResult.config) {
        serverConfigs = parseResult.config.mcpServers || {};
        const serverCount = Object.keys(serverConfigs).length;
        mainSpinner.succeed(
          `Loaded ${serverCount} MCP server${serverCount !== 1 ? "s" : ""} from config. | Path: ${chalk.yellow(options.configPath)}`
        );
      } else {
        mainSpinner.fail("Failed to load MCP configuration");
        logger.error(`\n❌ FATAL ERROR: Failed to load MCP configuration`);
        if (parseResult.error) {
          logger.error(`   Error: ${parseResult.error}`);
        }
        if (parseResult.validationErrors) {
          logger.error(`   Validation errors:`);
          parseResult.validationErrors.forEach((err: string) => {
            logger.error(`     • ${err}`);
          });
        }
        logger.error(
          `\n💡 Resolution: Fix the configuration file and restart the server.`
        );
        logger.error(`   Configuration file: ${options.configPath}`);
        logger.error(
          `\n🚫 ${APP_NAME} server cannot start with invalid configuration.`
        );
        process.exit(1);
      }
    } else {
      mainSpinner.succeed(
        "No configuration file specified - running without external servers"
      );
    }

    return serverConfigs;
  }

  private async connectToDownstreamServers(
    serverConfigs: Record<string, ServerConfig>
  ): Promise<void> {
    this.connectionManager = new ConnectionManager();
    let mainSpinner = ora("🔗 Setting up Connection Manager...").start();
    await this.connectionManager.initialize(serverConfigs);
    mainSpinner.succeed("🔗 Connection manager initialized");

    // Connect to each server individually with progress
    const serverEntries = Object.entries(serverConfigs);
    if (serverEntries.length > 0) {
      for (const [serverName, config] of serverEntries) {
        const serverSpinner = ora(
          `Connecting to [${serverName}] MCP <-> [${config.type}]...`
        ).start();

        try {
          await this.connectionManager.connect(serverName);
          serverSpinner.succeed(
            `Connected to [${serverName}] MCP <-> [${config.type}]`
          );
        } catch (error) {
          serverSpinner.fail(
            `Failed to connect to ${serverName}: ${(error as Error).message}`
          );
          // Don't fail the entire startup for individual server connection failures
        }
      }
    }
  }

  /**
   * Initialize routing components
   */
  private async initializeRouting(options: ServerInitOptions): Promise<void> {
    output.displaySubHeader("Initializing Routing and Discovery");
    output.displaySpaceBuffer();

    try {
      // Load server configs from MCP config.
      const serverConfigs: Record<string, ServerConfig> =
        await this.loadMcpConfigOrExit(options);

      // Initialize connection manager
      await this.connectToDownstreamServers(serverConfigs);

      // Initialize discovery engine with progress
      let mainSpinner = ora("Initializing tool discovery engine...").start();
      this.discoveryEngine = new ToolDiscoveryEngine(this.connectionManager!);
      await this.discoveryEngine.initialize({
        autoDiscovery: true,
        enableMetrics: true,
      });

      // Set discovery engine reference in toolset manager
      this.toolsetManager.setDiscoveryEngine(this.discoveryEngine);

      // Listen for toolset changes and notify clients
      this.toolsetManager.on(
        "toolsetChanged",
        async (event: ToolsetChangeEvent) => {
          if (options.debug) {
            logger.info(
              `Toolset ${event.changeType}: ${event.newToolset?.name || "none"}`
            );
          }
          await this.notifyToolsChanged();
        }
      );

      mainSpinner.succeed("Tool discovery engine initialized");

      // Start discovery and show tool count
      mainSpinner = ora("Discovering tools from connected servers...").start();
      await this.discoveryEngine.start();

      const discoveredTools = this.discoveryEngine.getAvailableTools(true);
      const toolCount = discoveredTools.length;
      const connectedServers = this.connectionManager!.getConnectedServers();

      if (toolCount > 0) {
        mainSpinner.succeed(
          `Discovered ${toolCount} tool${toolCount !== 1 ? "s" : ""} from ${connectedServers.length} connected server${connectedServers.length !== 1 ? "s" : ""}`
        );
        await this.discoveryEngine.outputToolServerStatus();
      } else {
        mainSpinner.warn("No tools discovered from connected servers");
      }

      // Initialize request router
      mainSpinner = ora("Initializing request router...").start();
      this.requestRouter = new RequestRouter(
        this.discoveryEngine,
        this.connectionManager!
      );
      await this.requestRouter.initialize({
        enableLogging: options.debug || false,
        enableMetrics: true,
      });
      mainSpinner.succeed("Request router initialized");

      // Listen for tool discovery changes and notify clients
      (this.discoveryEngine as any).on?.(
        "toolsChanged",
        async (event: DiscoveredToolsChangedEvent) => {
          // If we have an active toolset, it might need re-validation
          const activeToolsetInfo = this.toolsetManager.getActiveToolsetInfo();
          if (activeToolsetInfo) {
            if (options.debug) {
              logger.info(
                `Tools changed while toolset "${activeToolsetInfo.name}" is equipped. ` +
                `Server: ${event.serverName}, Changes: +${event.summary.added} ~${event.summary.updated} -${event.summary.removed}`
              );
            }
          }

          // Note: ToolsetManager will automatically handle toolset validation
          // and emit toolsetChanged events if active tools are affected
          // Always notify clients about tool changes
          await this.notifyToolsChanged();
        }
      );

      // Initialize tool modules after all dependencies are set up
      this.initializeToolModules();

      // Check for toolset configuration
      if (this.runtimeOptions?.equipToolset) {
        // User explicitly specified a toolset to equip
        logger.info(`Equipping toolset: ${this.runtimeOptions!.equipToolset!}`);
        const result = await this.toolsetManager.equipToolset(
          this.runtimeOptions!.equipToolset!
        );
        if (!result.success) {
          logger.error(`Failed to equip toolset: ${result.error}`);
        }
      } else {
        // No explicit toolset specified, try to restore the last equipped one
        const restored = await this.toolsetManager.restoreLastEquippedToolset();
        if (!restored) {
          logger.debug("No previously equipped toolset to restore");
        }
      }

      await this.checkToolsetStatus(options.debug);
    } catch (error) {
      logger.error("Failed to initialize routing:", error);
      throw error;
    }
  }

  /**
   * Initialize tool modules with dependency injection
   */
  private initializeToolModules(): void {
    const dependencies: ToolDependencies = {
      toolsetManager: this.toolsetManager,
      discoveryEngine: this.discoveryEngine,
      runtimeOptions: this.runtimeOptions,
    };

    // Create tool modules using factory functions
    this.toolModules = TOOL_MODULE_FACTORIES.map((tf) => tf(dependencies));

    // Create fast lookup map
    this.toolModuleMap.clear();
    for (const module of this.toolModules) {
      this.toolModuleMap.set(module.toolName, module);
    }
  }

  /**
   * Check toolset status and warn if no toolset is equipped
   */
  private async checkToolsetStatus(debug?: boolean): Promise<void> {
    try {
      const listResult = await this.toolsetManager.listSavedToolsets();
      const storedToolsets = listResult.success
        ? listResult.toolsets.reduce(
          (acc: any, t: any) => ({ ...acc, [t.name]: t }),
          {}
        )
        : {};
      const hasToolsets = Object.keys(storedToolsets).length > 0;
      const activeToolsetInfo = this.toolsetManager.getActiveToolsetInfo();

      if (!activeToolsetInfo && !hasToolsets) {
        logger.warn(`
⚠️  WARNING: No toolsets configured
   
   Meta-MCP is running but no toolsets have been created yet.
   This means no underlying MCP server tools will be exposed.
   
   💡 Next steps:
   1. Use 'list-available-tools' to see what tools are available
   2. Use 'build-toolset' to create a toolset with specific tools
   3. Use the '--equip-toolset' flag or 'equip-toolset' tool to activate a toolset
   
   Example: Create a dev toolset with git and docker tools
   `);
      } else if (!activeToolsetInfo && hasToolsets) {
        const toolsetNames = listResult.success
          ? listResult.toolsets.map((t: any) => t.name)
          : [];
        logger.warn(`
⚠️  WARNING: No toolset equipped
   
   You have ${toolsetNames.length} saved toolset(s) but none are currently equipped.
   Available toolsets: ${toolsetNames.join(", ")}
   
   💡 Use the '--equip-toolset' flag or 'equip-toolset' tool to activate a toolset and expose its tools.
   `);
      } else if (debug && activeToolsetInfo) {
        logger.info(
          `✅ Toolset "${activeToolsetInfo.name}" is equipped and active`
        );
      }
    } catch (error) {
      if (debug) {
        logger.warn("Could not check toolset status:", error);
      }
    }
  }

  /**
   * Get available tools from discovery engine and built-in toolset management tools
   */
  protected async getAvailableTools(): Promise<Tool[]> {
    const tools: Tool[] = [];

    // Add built-in toolset management tools from modules
    tools.push(...this.toolModules.map((module) => module.definition));

    // Add tools from toolset manager (handles filtering and formatting)
    try {
      const mcpTools = this.toolsetManager.getMcpTools();
      tools.push(...mcpTools);
    } catch (error) {
      logger.error("Failed to get available tools:", error);
    }

    return tools;
  }

  /**
   * Handle tool call requests via request router
   */
  protected async handleToolCall(name: string, args?: any): Promise<any> {
    // Handle built-in toolset management tools first
    try {
      // Check if this is a built-in toolset management tool (O(1) lookup)
      const toolModule = this.toolModuleMap.get(name);
      if (toolModule) {
        return await toolModule.handler(args);
      }

      // Check if this is a flattened tool name from active toolset
      const originalToolName = this.toolsetManager.getOriginalToolName(name);
      const toolNameForRouter = originalToolName || name;

      // Handle non-toolset tools via request router
      if (!this.requestRouter) {
        throw new Error(
          "Request router is not available. Server may not be fully initialized."
        );
      }

      const response = await this.requestRouter.routeToolCall({
        name: toolNameForRouter,
        arguments: args,
      });

      return response;
    } catch (error) {
      logger.error("Tool call failed:", error);
      throw error;
    }
  }

  /**
   * Enhanced stop method
   */
  async stop(): Promise<void> {
    try {
      // Stop routing services
      if (this.discoveryEngine) {
        // Remove event listeners
        (this.discoveryEngine as any).removeAllListeners?.("toolsChanged");
        await this.discoveryEngine.stop();
      }

      if (this.connectionManager) {
        await this.connectionManager.stop();
      }

      // Stop the base server
      await super.stop();
    } catch (error) {
      logger.error("Error stopping enhanced server:", error);
      throw error;
    }
  }

  /**
   * Get routing statistics (if enabled)
   */
  getRoutingStats() {
    if (!this.requestRouter) {
      return null;
    }

    return {
      router: this.requestRouter.getStats(),
      discovery: this.discoveryEngine?.getStats(),
      connections: this.connectionManager?.status,
    };
  }
}
