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
import {
  MCPConfigParser,
  APP_NAME,
  APP_TECHNICAL_NAME,
  ServerConfig,
} from "../config/index.js";
import ora from "ora";

// Helper to create conditional spinners
function createSpinner(text: string, isStdio: boolean) {
  if (isStdio) {
    // Return a mock spinner that does nothing in stdio mode
    return {
      start: () => ({ succeed: () => {}, fail: () => {}, warn: () => {} }),
      succeed: () => {},
      fail: () => {},
      warn: () => {},
    };
  }
  return ora(text).start();
}
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
import {
  detectExternalMCPs,
  formatExternalMCPsMessage,
} from "../scripts/shared/externalMcpDetector.js";
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
    const isStdio = options.transport.type === "stdio";
    const mainSpinner = createSpinner("Loading MCP configuration...", isStdio);
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

  /**
   * Filter out server configurations that would cause HyperTool to connect to itself
   */
  private filterSelfReferencingServers(
    serverConfigs: Record<string, ServerConfig>
  ): Record<string, ServerConfig> {
    const filteredConfigs: Record<string, ServerConfig> = {};
    const removedServers: string[] = [];

    for (const [serverName, config] of Object.entries(serverConfigs)) {
      if (this.isSelfReferencingServer(config)) {
        removedServers.push(serverName);
        logger.warn(
          `⚠️  Skipped server "${serverName}" - detected HyperTool self-reference (would cause recursion)`
        );
      } else {
        filteredConfigs[serverName] = config;
      }
    }

    if (removedServers.length > 0) {
      logger.warn(`
⚠️  WARNING: Self-referencing servers removed from configuration
   
   Removed servers: ${removedServers.join(", ")}
   
   These servers appear to be HyperTool MCP itself, which would cause
   infinite recursion. HyperTool cannot connect to itself as a downstream server.
   
   If you intended to connect to a different MCP server, please check your
   configuration and ensure the command/URL points to the correct server.
   `);
    }

    return filteredConfigs;
  }

  /**
   * Check if a server configuration references HyperTool itself
   */
  private isSelfReferencingServer(config: ServerConfig): boolean {
    if (config.type === "stdio" && config.command) {
      // Check for common patterns that indicate HyperTool MCP
      const command = config.command.toLowerCase();
      const args = config.args || [];

      // Direct command references
      if (command === "hypertool-mcp" || command.endsWith("/hypertool-mcp")) {
        return true;
      }

      // NPX references to our package
      if ((command === "npx" || command.endsWith("/npx")) && args.length > 0) {
        for (const arg of args) {
          const argLower = arg.toLowerCase();
          if (
            argLower === "@toolprint/hypertool-mcp" ||
            argLower === "hypertool-mcp" ||
            argLower.includes("@toolprint/hypertool-mcp")
          ) {
            return true;
          }
        }
      }

      // Node references to our package
      if (
        (command === "node" || command.endsWith("/node")) &&
        args.length > 0
      ) {
        for (const arg of args) {
          if (
            arg.includes("hypertool-mcp") ||
            arg.includes("@toolprint/hypertool-mcp")
          ) {
            return true;
          }
        }
      }
    }

    // For HTTP/SSE servers, we could check if they're pointing to our own HTTP server
    // but that would require knowing our own running port/URL which is complex
    // For now, we focus on stdio self-references which are the most common case

    return false;
  }

  private async connectToDownstreamServers(
    serverConfigs: Record<string, ServerConfig>,
    options: ServerInitOptions
  ): Promise<void> {
    this.connectionManager = new ConnectionManager();
    const isStdio = options.transport.type === "stdio";
    let mainSpinner = createSpinner(
      "🔗 Setting up Connection Manager...",
      isStdio
    );

    // Filter out any configurations that would cause HyperTool to connect to itself
    const filteredConfigs = this.filterSelfReferencingServers(serverConfigs);

    await this.connectionManager.initialize(filteredConfigs);
    mainSpinner.succeed("🔗 Connection manager initialized");

    // Connect to each server individually with progress
    const serverEntries = Object.entries(filteredConfigs);
    if (serverEntries.length > 0) {
      for (const [serverName, config] of serverEntries) {
        const serverSpinner = createSpinner(
          `Connecting to [${serverName}] MCP <-> [${config.type}]...`,
          isStdio
        );

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
    } else {
      // No servers configured - show helpful message
      const infoSpinner = createSpinner(
        "No MCP servers configured yet",
        isStdio
      );
      infoSpinner.succeed(
        `No MCP servers configured. Use '${APP_TECHNICAL_NAME} mcp add' to add servers.`
      );
    }
  }

  /**
   * Initialize routing components
   */
  private async initializeRouting(options: ServerInitOptions): Promise<void> {
    // Only show output for non-stdio transports
    const isStdio = options.transport.type === "stdio";
    if (!isStdio) {
      output.displaySubHeader("Initializing Routing and Discovery");
      output.displaySpaceBuffer();
    }

    try {
      // Load server configs from MCP config.
      const serverConfigs: Record<string, ServerConfig> =
        await this.loadMcpConfigOrExit(options);

      // Detect external MCPs
      const externalMCPs = await detectExternalMCPs();
      if (externalMCPs.length > 0) {
        output.displaySpaceBuffer();
        const message = formatExternalMCPsMessage(externalMCPs);
        console.log(chalk.yellow(message));
        output.displaySpaceBuffer();
      }

      // Initialize connection manager
      await this.connectToDownstreamServers(serverConfigs, options);

      // Initialize discovery engine with progress
      const isStdio = options.transport.type === "stdio";
      let mainSpinner = createSpinner(
        "Initializing tool discovery engine...",
        isStdio
      );
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
      mainSpinner = createSpinner(
        "Discovering tools from connected servers...",
        isStdio
      );
      await this.discoveryEngine.start();

      const discoveredTools = this.discoveryEngine.getAvailableTools(true);
      const toolCount = discoveredTools.length;
      const connectedServers = this.connectionManager!.getConnectedServers();

      if (toolCount > 0) {
        mainSpinner.succeed(
          `Discovered ${toolCount} tool${toolCount !== 1 ? "s" : ""} from ${connectedServers.length} connected server${connectedServers.length !== 1 ? "s" : ""}`
        );
        // Only output tool server status in non-stdio mode to avoid interfering with MCP protocol
        if (!isStdio) {
          await this.discoveryEngine.outputToolServerStatus();
        }
      } else {
        mainSpinner.warn("No tools discovered from connected servers");
      }

      // Initialize request router
      mainSpinner = createSpinner("Initializing request router...", isStdio);
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
