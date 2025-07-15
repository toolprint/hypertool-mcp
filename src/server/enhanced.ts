/**
 * Enhanced Hypertool MCP server with request routing capabilities
 */

import { MetaMCPServer } from "./base.js";
import { MetaMCPServerConfig, ServerInitOptions } from "./types.js";
import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { IRequestRouter, RequestRouter } from "../router/index.js";
import { IToolDiscoveryEngine, ToolDiscoveryEngine } from "../discovery/index.js";
import { IConnectionManager, ConnectionManager } from "../connection/index.js";
import { MCPConfigParser, APP_NAME } from "../config/index.js";
import ora from "ora";
import { createLogger } from "../logging/index.js";

const logger = createLogger({ module: 'server/enhanced' });
// Note: All mcp-tools functionality now handled by ToolsetManager
import { ToolsetManager, ToolsetConfig, ToolsetChangeEvent } from "../toolset/index.js";
import { DiscoveredToolsChangedEvent } from "../discovery/types.js";

/**
 * Enhanced Hypertool MCP server with routing capabilities
 */
export class EnhancedMetaMCPServer extends MetaMCPServer {
  private requestRouter?: IRequestRouter;
  private discoveryEngine?: IToolDiscoveryEngine;
  private connectionManager?: IConnectionManager;
  private configParser?: MCPConfigParser;
  private enableCallTool: boolean = false;
  private toolsetManager: ToolsetManager;

  constructor(config: MetaMCPServerConfig) {
    super(config);
    this.toolsetManager = new ToolsetManager();
  }

  /**
   * Enhanced start method with routing initialization
   */
  async start(options: ServerInitOptions): Promise<void> {
    this.enableCallTool = true; // Always enable tool calling

    await this.initializeRouting(options);
    await super.start(options);
  }

  /**
   * Initialize routing components
   */
  private async initializeRouting(options: ServerInitOptions): Promise<void> {
    try {
      // Initialize config parser
      let mainSpinner = ora('Loading MCP configuration...').start();
      this.configParser = new MCPConfigParser();

      // Load configuration if path provided
      let serverConfigs = {};
      if (options.configPath) {
        const parseResult = await this.configParser.parseFile(
          options.configPath
        );
        if (parseResult.success && parseResult.config) {
          serverConfigs = parseResult.config.mcpServers || {};
          const serverCount = Object.keys(serverConfigs).length;
          mainSpinner.succeed(`Loaded configuration with ${serverCount} MCP server${serverCount !== 1 ? 's' : ''}`);
        } else {
          mainSpinner.fail('Failed to load MCP configuration');
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
          logger.error(`\n💡 Resolution: Fix the configuration file and restart the server.`);
          logger.error(`   Configuration file: ${options.configPath}`);
          logger.error(`\n🚫 ${APP_NAME} server cannot start with invalid configuration.`);
          process.exit(1);
        }
      } else {
        mainSpinner.succeed('No configuration file specified - running without external servers');
      }

      // Initialize connection manager
      mainSpinner = ora('Initializing connection manager...').start();
      this.connectionManager = new ConnectionManager();
      await this.connectionManager.initialize(serverConfigs);
      mainSpinner.succeed('Connection manager initialized');

      // Connect to each server individually with progress
      const serverEntries = Object.entries(serverConfigs);
      if (serverEntries.length > 0) {
        logger.info('\n🔗 Connecting to MCP servers:');

        for (const [serverName, config] of serverEntries) {
          const serverSpinner = ora(`Connecting to ${serverName}...`).start();

          try {
            await this.connectionManager.connect(serverName);
            serverSpinner.succeed(`Connected to ${serverName} (${(config as any).type})`);
          } catch (error) {
            serverSpinner.fail(`Failed to connect to ${serverName}: ${(error as Error).message}`);
            // Don't fail the entire startup for individual server connection failures
          }
        }
      }

      // Initialize discovery engine with progress
      mainSpinner = ora('Initializing tool discovery engine...').start();
      this.discoveryEngine = new ToolDiscoveryEngine(this.connectionManager);
      await this.discoveryEngine.initialize({
        autoDiscovery: true,
        enableMetrics: true,
      });

      // Set discovery engine reference in toolset manager
      this.toolsetManager.setDiscoveryEngine(this.discoveryEngine);

      // Listen for toolset changes and notify clients
      this.toolsetManager.on('toolsetChanged', async (event: ToolsetChangeEvent) => {
        if (options.debug) {
          logger.info(`Toolset ${event.changeType}: ${event.newToolset?.name || 'none'}`);
        }
        await this.notifyToolsChanged();
      });

      mainSpinner.succeed('Tool discovery engine initialized');

      // Start discovery and show tool count
      mainSpinner = ora('Discovering tools from connected servers...').start();
      await this.discoveryEngine.start();

      const discoveredTools = this.discoveryEngine.getAvailableTools(true);
      const toolCount = discoveredTools.length;
      const connectedServers = this.connectionManager.getConnectedServers();

      if (toolCount > 0) {
        mainSpinner.succeed(`Discovered ${toolCount} tool${toolCount !== 1 ? 's' : ''} from ${connectedServers.length} connected server${connectedServers.length !== 1 ? 's' : ''}`);

        // Show tools by server in debug mode
        if (options.debug && toolCount > 0) {
          const toolsByServerStr: Array<string> = []
          const toolsByServer: Record<string, number> = {};
          discoveredTools.forEach((tool: any) => {
            toolsByServer[tool.serverName] = (toolsByServer[tool.serverName] || 0) + 1;
          });

          Object.entries(toolsByServer).forEach(([serverName, count]) => {
            toolsByServerStr.push(`   • ${serverName}: ${count} tool${count !== 1 ? 's' : ''}`);
          });

          logger.info(`\n📋 Tools discovered by server:\n${toolsByServerStr.join('\n')}`);
        }
      } else {
        mainSpinner.warn('No tools discovered from connected servers');
      }

      // Initialize request router
      mainSpinner = ora('Initializing request router...').start();
      this.requestRouter = new RequestRouter(
        this.discoveryEngine,
        this.connectionManager
      );
      await this.requestRouter.initialize({
        enableLogging: options.debug || false,
        enableMetrics: true,
      });
      mainSpinner.succeed('Request router initialized');

      // Listen for tool discovery changes and notify clients
      (this.discoveryEngine as any).on?.("toolsChanged", async (event: DiscoveredToolsChangedEvent) => {
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
      });

      // Check for toolset configuration and warn if none equipped
      await this.checkToolsetStatus(options.debug);

      logger.info(''); // Add spacing before final startup messages
    } catch (error) {
      logger.error("Failed to initialize routing:", error);
      throw error;
    }
  }

  /**
   * Check toolset status and warn if no toolset is equipped
   */
  private async checkToolsetStatus(debug?: boolean): Promise<void> {
    try {
      const listResult = await this.toolsetManager.listSavedToolsets();
      const storedToolsets = listResult.success ? listResult.toolsets.reduce((acc: any, t: any) => ({ ...acc, [t.name]: t }), {}) : {};
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
   3. Use 'equip-toolset' to activate a toolset
   
   Example: Create a dev toolset with git and docker tools
   `);
      } else if (!activeToolsetInfo && hasToolsets) {
        const toolsetNames = listResult.success ? listResult.toolsets.map((t: any) => t.name) : [];
        logger.warn(`
⚠️  WARNING: No toolset equipped
   
   You have ${toolsetNames.length} saved toolset(s) but none are currently equipped.
   Available toolsets: ${toolsetNames.join(', ')}
   
   💡 Use 'equip-toolset' to activate a toolset and expose its tools.
   `);
      } else if (debug && activeToolsetInfo) {
        logger.info(`✅ Toolset "${activeToolsetInfo.name}" is equipped and active`);
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

    // Add built-in toolset management tools
    tools.push(
      {
        name: "list-available-tools",
        description: "Discover all tools available from connected MCP servers. Returns structured data showing tools grouped by server for toolset creation. Tools can be referenced by 'namespacedName' (e.g., 'git.status') or 'refId' (unique hash). Example: Call with no parameters to see all tools organized by server with detailed metadata for each tool.",
        inputSchema: {
          type: "object" as const,
          properties: {},
          additionalProperties: false,
        },
        outputSchema: {
          type: "object" as const,
          properties: {
            summary: {
              type: "object",
              description: "High-level statistics about available tools",
              properties: {
                totalTools: {
                  type: "number",
                  description: "Total number of tools across all servers"
                },
                totalServers: {
                  type: "number",
                  description: "Number of connected MCP servers"
                }
              },
              required: ["totalTools", "totalServers"]
            },
            toolsByServer: {
              type: "array",
              description: "Tools organized by their source server",
              items: {
                type: "object",
                properties: {
                  serverName: {
                    type: "string",
                    description: "Name of the MCP server"
                  },
                  toolCount: {
                    type: "number",
                    description: "Number of tools from this server"
                  },
                  tools: {
                    type: "array",
                    description: "List of tools from this server",
                    items: {
                      type: "object",
                      properties: {
                        name: {
                          type: "string",
                          description: "Original tool name"
                        },
                        description: {
                          type: "string",
                          description: "Tool description (optional)"
                        },
                        namespacedName: {
                          type: "string",
                          description: "Namespaced name for unambiguous reference (serverName.toolName)"
                        },
                        serverName: {
                          type: "string",
                          description: "Source server name"
                        },
                        refId: {
                          type: "string",
                          description: "Unique hash identifier for this tool"
                        }
                      },
                      required: ["name", "namespacedName", "serverName", "refId"]
                    }
                  }
                },
                required: ["serverName", "toolCount", "tools"]
              }
            }
          },
          required: ["summary", "toolsByServer"]
        },
        annotations: {
          title: "List Available Tools",
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false
        },
      },
      {
        name: "build-toolset",
        description: "Build and save a custom toolset by selecting specific tools. Like assembling tools from a workshop - pick the exact tools you need for a specific task or workflow. You must specify which tools to include. Each tool must specify either namespacedName or refId for identification. Example: {name: 'dev-essentials', tools: [{namespacedName: 'git.status'}, {namespacedName: 'docker.ps'}], autoEquip: true} creates and immediately equips a development toolset.",
        inputSchema: {
          type: "object" as const,
          properties: {
            name: {
              type: "string",
              description: "Name for the new toolset. Use lowercase with hyphens (e.g., 'dev-essentials', 'git-workflow', 'debug-kit')",
              pattern: "^[a-z0-9-]+$",
              minLength: 2,
              maxLength: 50
            },
            tools: {
              type: "array",
              description: "Array of tools to include in the toolset. Each tool must specify either namespacedName or refId for identification. Use list-available-tools to see available options.",
              minItems: 1,
              maxItems: 100,
              items: {
                type: "object",
                properties: {
                  namespacedName: {
                    type: "string",
                    description: "Tool reference by namespaced name (e.g., 'git.status', 'docker.ps')"
                  },
                  refId: {
                    type: "string",
                    description: "Tool reference by unique hash identifier (e.g., 'abc123def456...')"
                  }
                },
                oneOf: [
                  { required: ["namespacedName"] },
                  { required: ["refId"] }
                ],
                additionalProperties: false
              }
            },
            description: {
              type: "string",
              description: "Optional description of what this toolset is for (e.g., 'Essential tools for web development')",
              maxLength: 200
            },
            autoEquip: {
              type: "boolean",
              description: "Automatically equip this toolset after creation (default: false)"
            }
          },
          required: ["name", "tools"],
          additionalProperties: false,
        },
        outputSchema: {
          type: "object" as const,
          properties: {
            success: {
              type: "boolean",
              description: "Whether the toolset was successfully created"
            },
            toolsetName: {
              type: "string",
              description: "Name of the created toolset"
            },
            location: {
              type: "string",
              description: "File path where the toolset configuration is stored"
            },
            configuration: {
              type: "object",
              description: "Summary of the toolset configuration",
              properties: {
                totalServers: {
                  type: "number",
                  description: "Total number of servers included in the toolset"
                },
                enabledServers: {
                  type: "number",
                  description: "Number of enabled servers in the toolset"
                },
                totalTools: {
                  type: "number",
                  description: "Total number of tools included in the toolset"
                },
                servers: {
                  type: "array",
                  description: "Server configurations in the toolset",
                  items: {
                    type: "object",
                    properties: {
                      name: {
                        type: "string",
                        description: "Server name"
                      },
                      enabled: {
                        type: "boolean",
                        description: "Whether the server is enabled"
                      },
                      toolCount: {
                        type: "number",
                        description: "Number of tools from this server"
                      }
                    },
                    required: ["name", "enabled", "toolCount"]
                  }
                }
              },
              required: ["totalServers", "enabledServers", "totalTools", "servers"]
            },
            createdAt: {
              type: "string",
              description: "ISO timestamp when the toolset was created"
            },
            autoEquipped: {
              type: "boolean",
              description: "Whether the toolset was automatically equipped after creation"
            }
          },
          required: ["success", "toolsetName", "location", "configuration", "createdAt", "autoEquipped"]
        },
      },
      {
        name: "list-saved-toolsets",
        description: "List all saved toolset configurations",
        inputSchema: {
          type: "object" as const,
          properties: {},
          additionalProperties: false,
        },
      },
      {
        name: "equip-toolset",
        description: "Equip a saved toolset configuration to filter available tools",
        inputSchema: {
          type: "object" as const,
          properties: {
            name: {
              type: "string",
              description: "Name of the toolset to equip"
            },
          },
          required: ["name"],
          additionalProperties: false,
        },
      },
      {
        name: "delete-toolset",
        description: "Delete a saved toolset configuration",
        inputSchema: {
          type: "object" as const,
          properties: {
            name: {
              type: "string",
              description: "Name of the toolset to delete"
            },
            confirm: {
              type: "boolean",
              description: "Confirm deletion (required to actually delete)"
            },
          },
          required: ["name"],
          additionalProperties: false,
        },
      },
      {
        name: "unequip-toolset",
        description: "Unequip the currently equipped toolset and show all available tools",
        inputSchema: {
          type: "object" as const,
          properties: {},
          additionalProperties: false,
        },
      },
      {
        name: "get-active-toolset",
        description: "Get detailed information about the currently equipped toolset including availability status",
        inputSchema: {
          type: "object" as const,
          properties: {},
          additionalProperties: false,
        },
        outputSchema: {
          type: "object" as const,
          properties: {
            equipped: { type: "boolean" },
            toolset: {
              type: "object",
              properties: {
                name: { type: "string" },
                description: { type: "string" },
                version: { type: "string" },
                createdAt: { type: "string" },
                conflictResolution: { type: "string" }
              }
            },
            serverStatus: {
              type: "object",
              properties: {
                totalConfigured: { type: "number" },
                enabled: { type: "number" },
                available: { type: "number" },
                unavailable: { type: "number" },
                disabled: { type: "number" }
              }
            },
            toolSummary: {
              type: "object",
              properties: {
                currentlyExposed: { type: "number" },
                totalDiscovered: { type: "number" },
                filteredOut: { type: "number" }
              }
            },
            exposedTools: { type: "object" },
            unavailableServers: { type: "array", items: { type: "string" } },
            warnings: { type: "array", items: { type: "string" } }
          }
        }
      }
    );

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
      switch (name) {
        case "list-available-tools":
          if (this.discoveryEngine) {
            const structured = this.toolsetManager.formatAvailableTools();

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(structured)
                }
              ],
              structuredContent: structured
            };
          } else {
            return {
              content: [
                {
                  type: "text",
                  text: "❌ **Tool discovery not available**\n\nDiscovery engine is not initialized. Server may not be fully started.",
                },
              ],
              isError: true
            };
          }

        case "build-toolset":
          if (this.discoveryEngine) {
            const result = await this.toolsetManager.buildToolset(
              args?.name || '',
              args?.tools || [],
              {
                description: args?.description,
                autoEquip: args?.autoEquip
              }
            );

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(result)
                }
              ],
              structuredContent: result
            };
          } else {
            return {
              content: [
                {
                  type: "text",
                  text: "❌ **Tool discovery not available**\n\nDiscovery engine is not initialized. Server may not be fully started.",
                },
              ],
            };
          }

        case "list-saved-toolsets":
          const listResult = await this.toolsetManager.listSavedToolsets();
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(listResult)
              }
            ],
            structuredContent: listResult
          };

        case "equip-toolset":
          if (this.discoveryEngine) {
            // Refresh discovery cache before applying toolset to ensure latest tools
            await this.discoveryEngine.refreshCache();

            const equipResult = await this.toolsetManager.equipToolset(args?.name);
            if (equipResult.success) {
              return {
                content: [
                  {
                    type: "text",
                    text: JSON.stringify({
                      success: true,
                      message: `✅ Toolset "${args?.name}" equipped successfully. The server's tool list has been updated.`
                    })
                  }
                ],
                structuredContent: {
                  success: true,
                  toolsetName: args?.name,
                  message: "Toolset equipped successfully"
                }
              };
            } else {
              return {
                content: [
                  {
                    type: "text",
                    text: JSON.stringify({
                      success: false,
                      error: equipResult.error
                    })
                  }
                ],
                structuredContent: {
                  success: false,
                  error: equipResult.error
                }
              };
            }
          } else {
            return {
              content: [
                {
                  type: "text",
                  text: "❌ **Tool discovery not available**\n\nDiscovery engine is not initialized. Server may not be fully started.",
                },
              ],
            };
          }

        case "delete-toolset":
          const deleteResult = await this.toolsetManager.deleteToolset(args?.name, { confirm: args?.confirm });
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(deleteResult)
              }
            ],
            structuredContent: deleteResult
          };

        case "unequip-toolset":
          this.toolsetManager.unequipToolset();
          // ToolsetManager will emit 'toolsetChanged' event which triggers notifyToolsChanged()

          return {
            content: [
              {
                type: "text",
                text: "✅ **Toolset Unequipped**\n\nAll discovered tools are now available. The server's tool list has been reset to show all tools from connected servers.",
              },
            ],
          };

        case "get-active-toolset":
          const activeToolsetInfo = this.toolsetManager.getActiveToolsetInfo();
          if (activeToolsetInfo) {
            const discoveredTools = this.discoveryEngine?.getAvailableTools(true) || [];
            const activeToolset = this.toolsetManager.getActiveToolset()!;

            // Count servers by status using discovery engine to resolve server information
            const availableServers = new Set(discoveredTools.map((t: any) => t.serverName));
            const toolsetServers = new Set<string>();

            // Use discovery engine to resolve each tool reference and get server names
            for (const toolRef of activeToolset.tools) {
              const resolution = this.discoveryEngine?.resolveToolReference(toolRef, { allowStaleRefs: false });
              if (resolution?.exists && resolution.serverName) {
                toolsetServers.add(resolution.serverName);
              }
            }

            const configuredServers = Array.from(toolsetServers).map(name => ({ serverName: name, enabled: true }));
            const enabledServers = configuredServers; // All servers are enabled in simplified structure
            const unavailableServers = enabledServers.filter(s => !availableServers.has(s.serverName));
            const disabledServers: any[] = []; // No disabled servers in simplified structure

            // Get tool details from active discovered tools
            const activeDiscoveredTools = this.toolsetManager.getActiveDiscoveredTools();
            const totalConfiguredTools = activeDiscoveredTools.length;
            const toolsByServer: Record<string, string[]> = {};
            for (const tool of activeDiscoveredTools) {
              if (!toolsByServer[tool.serverName]) {
                toolsByServer[tool.serverName] = [];
              }
              toolsByServer[tool.serverName].push(tool.name);
            }

            let output = `🎯 **Equipped Toolset: "${activeToolsetInfo.name}"**\n\n`;
            output += `${activeToolsetInfo.description || 'No description'}\n\n`;

            // Toolset metadata
            output += `## Toolset Information\n`;
            output += `- **Created:** ${activeToolset.createdAt ? new Date(activeToolset.createdAt).toLocaleDateString() : 'Unknown'}\n`;
            output += `- **Version:** ${activeToolset.version || '1.0.0'}\n`;
            output += `- **Tool Count:** ${activeToolsetInfo.toolCount}\n\n`;

            // Server status
            output += `## Server Status\n`;
            output += `- **Total Configured:** ${configuredServers.length}\n`;
            output += `- **Enabled:** ${enabledServers.length}\n`;
            output += `- **Available:** ${enabledServers.length - unavailableServers.length}\n`;
            output += `- **Unavailable:** ${unavailableServers.length}\n`;
            output += `- **Disabled:** ${disabledServers.length}\n\n`;

            // Tool count summary
            output += `## Tool Summary\n`;
            output += `- **Currently Exposed:** ${totalConfiguredTools}\n`;
            output += `- **Total Discovered:** ${discoveredTools.length}\n`;
            output += `- **Filtered Out:** ${discoveredTools.length - totalConfiguredTools}\n\n`;

            // Active tools by server
            if (Object.keys(toolsByServer).length > 0) {
              output += `## Currently Exposed Tools\n\n`;
              for (const [serverName, tools] of Object.entries(toolsByServer)) {
                output += `### ${serverName} (${tools.length} tools)\n`;
                for (const tool of tools.sort()) {
                  output += `- \`${tool}\`\n`;
                }
                output += `\n`;
              }
            }

            // Show unavailable servers if any
            if (unavailableServers.length > 0) {
              output += `## ⚠️ Unavailable Servers\n\n`;
              for (const server of unavailableServers) {
                output += `- **${server.serverName}** (server not connected)\n`;
              }
              output += `\nThese servers are configured in the toolset but not currently available.\n\n`;
            }

            // Show disabled servers if any
            if (disabledServers.length > 0) {
              output += `## ℹ️ Disabled Servers\n\n`;
              for (const server of disabledServers) {
                output += `- **${server.serverName}** (explicitly disabled in toolset)\n`;
              }
              output += `\n`;
            }

            // Note: Warnings handling simplified since we removed ResolvedTool system

            output += `Use \`unequip-toolset\` to remove this filter and show all tools.`;

            // Create structured response
            const structuredResponse = {
              equipped: true,
              toolset: {
                name: activeToolsetInfo.name,
                description: activeToolsetInfo.description || '',
                version: activeToolsetInfo.version || '1.0.0',
                createdAt: activeToolsetInfo.createdAt ? new Date(activeToolsetInfo.createdAt).toISOString() : '',
                toolCount: activeToolsetInfo.toolCount
              },
              serverStatus: {
                totalConfigured: configuredServers.length,
                enabled: enabledServers.length,
                available: enabledServers.length - unavailableServers.length,
                unavailable: unavailableServers.length,
                disabled: disabledServers.length
              },
              toolSummary: {
                currentlyExposed: totalConfiguredTools,
                totalDiscovered: discoveredTools.length,
                filteredOut: discoveredTools.length - totalConfiguredTools
              },
              exposedTools: toolsByServer,
              unavailableServers: unavailableServers.map(s => s.serverName),
              warnings: [] // Simplified: no warnings in current system
            };

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(structuredResponse)
                },
              ],
              structuredContent: structuredResponse
            };
          } else {
            const noToolsetResponse = {
              equipped: false,
              toolset: null,
              serverStatus: null,
              toolSummary: null,
              exposedTools: {},
              unavailableServers: [],
              warnings: []
            };

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(noToolsetResponse)
                },
              ],
              structuredContent: noToolsetResponse
            };
          }

        default:
          // Handle other tools via request router
          if (!this.requestRouter) {
            throw new Error(
              "Request router is not available. Server may not be fully initialized."
            );
          }

          const response = await this.requestRouter.routeToolCall({
            name,
            arguments: args,
          });

          return response;
      }
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
