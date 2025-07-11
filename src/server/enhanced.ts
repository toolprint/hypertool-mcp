/**
 * Enhanced Meta-MCP server with request routing capabilities
 */

import { MetaMCPServer } from "./base";
import { MetaMCPServerConfig, ServerInitOptions } from "./types";
import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { IRequestRouter, RequestRouter } from "../router";
import { IToolDiscoveryEngine, ToolDiscoveryEngine } from "../discovery";
import { IConnectionManager, ConnectionManager } from "../connection";
import { MCPConfigParser } from "../config";
import {
  buildToolset,
  listSavedToolsets,
  selectToolset,
  deleteToolset,
  loadStoredToolsets,
  formatAvailableTools,
} from "../toolset/mcp-tools";
import { ToolsetManager, ToolsetConfig } from "../toolset";

/**
 * Enhanced Meta-MCP server with routing capabilities
 */
export class EnhancedMetaMCPServer extends MetaMCPServer {
  private requestRouter?: IRequestRouter;
  private discoveryEngine?: IToolDiscoveryEngine;
  private connectionManager?: IConnectionManager;
  private configParser?: MCPConfigParser;
  private enableCallTool: boolean = false;
  private activeToolset?: ToolsetConfig;
  private toolsetManager: ToolsetManager;

  constructor(config: MetaMCPServerConfig) {
    super(config);
    this.toolsetManager = new ToolsetManager();
  }

  /**
   * Enhanced start method with routing initialization
   */
  async start(options: ServerInitOptions): Promise<void> {
    this.enableCallTool = options.enableCallTool || false;

    if (this.enableCallTool) {
      await this.initializeRouting(options);
    }

    await super.start(options);
  }

  /**
   * Initialize routing components
   */
  private async initializeRouting(options: ServerInitOptions): Promise<void> {
    try {
      // Initialize config parser
      this.configParser = new MCPConfigParser();

      // Load configuration if path provided
      let serverConfigs = {};
      if (options.configPath) {
        const parseResult = await this.configParser.parseFile(
          options.configPath
        );
        if (parseResult.success && parseResult.config) {
          serverConfigs = parseResult.config.mcpServers || {};
        } else {
          console.error(`\n❌ FATAL ERROR: Failed to load MCP configuration`);
          if (parseResult.error) {
            console.error(`   Error: ${parseResult.error}`);
          }
          if (parseResult.validationErrors) {
            console.error(`   Validation errors:`);
            parseResult.validationErrors.forEach(err => {
              console.error(`     • ${err}`);
            });
          }
          console.error(`\n💡 Resolution: Fix the configuration file and restart the server.`);
          console.error(`   Configuration file: ${options.configPath}`);
          console.error(`\n🚫 Meta-MCP server cannot start with invalid configuration.`);
          process.exit(1);
        }
      }

      // Initialize connection manager
      this.connectionManager = new ConnectionManager();
      await this.connectionManager.initialize(serverConfigs);

      // Initialize discovery engine
      this.discoveryEngine = new ToolDiscoveryEngine(this.connectionManager);
      await this.discoveryEngine.initialize({
        autoDiscovery: true,
        enableMetrics: true,
      });

      // Initialize request router
      this.requestRouter = new RequestRouter(
        this.discoveryEngine,
        this.connectionManager
      );
      await this.requestRouter.initialize({
        enableLogging: options.debug || false,
        enableMetrics: true,
      });

      // Start all services
      await this.connectionManager.start();
      await this.discoveryEngine.start();

      // Listen for tool discovery changes and notify clients
      (this.discoveryEngine as any).on?.("toolsChanged", async (event: any) => {
        // If we have an active toolset, it might need re-validation
        if (this.activeToolset) {
          if (options.debug) {
            console.log(
              `Tools changed while toolset "${this.activeToolset.name}" is equipped. ` +
              `Change from server: ${event?.serverName || 'unknown'}`
            );
          }
          // The toolset filtering will automatically happen on next getAvailableTools() call
          // as it always uses fresh discovered tools
        }
        
        // Always notify clients about tool changes
        await this.notifyToolsChanged();
      });

      if (options.debug) {
        console.log("Request routing initialized successfully");
      }

      // Check for toolset configuration and warn if none equipped
      await this.checkToolsetStatus(options.debug);
    } catch (error) {
      console.error("Failed to initialize routing:", error);
      throw error;
    }
  }

  /**
   * Check toolset status and warn if no toolset is equipped
   */
  private async checkToolsetStatus(debug?: boolean): Promise<void> {
    try {
      const storedToolsets = await loadStoredToolsets();
      const hasToolsets = Object.keys(storedToolsets).length > 0;
      
      if (!this.activeToolset && !hasToolsets) {
        console.warn(`
⚠️  WARNING: No toolsets configured
   
   Meta-MCP is running but no toolsets have been created yet.
   This means no underlying MCP server tools will be exposed.
   
   💡 Next steps:
   1. Use 'list-available-tools' to see what tools are available
   2. Use 'build-toolset' to create a toolset with specific tools
   3. Use 'equip-toolset' to activate a toolset
   
   Example: Create a dev toolset with git and docker tools
   `);
      } else if (!this.activeToolset && hasToolsets) {
        const toolsetNames = Object.keys(storedToolsets);
        console.warn(`
⚠️  WARNING: No toolset equipped
   
   You have ${toolsetNames.length} saved toolset(s) but none are currently equipped.
   Available toolsets: ${toolsetNames.join(', ')}
   
   💡 Use 'equip-toolset' to activate a toolset and expose its tools.
   `);
      } else if (debug && this.activeToolset) {
        console.log(`✅ Toolset "${this.activeToolset.name}" is equipped and active`);
      }
    } catch (error) {
      if (debug) {
        console.warn("Could not check toolset status:", error);
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

    // Add discovered tools if call tool is enabled
    if (this.enableCallTool && this.discoveryEngine) {
      try {
        const discoveredTools = this.discoveryEngine.getAvailableTools(true);
        
        // Filter tools based on active toolset if one is loaded
        let toolsToExpose = discoveredTools;
        if (this.activeToolset) {
          this.toolsetManager.setConfig(this.activeToolset);
          const resolution = await this.toolsetManager.applyConfig(discoveredTools, this.discoveryEngine);
          toolsToExpose = resolution.tools.map(resolvedTool => {
            // Find the original discovered tool
            return discoveredTools.find(dt => 
              dt.serverName === resolvedTool.serverName && 
              dt.name === resolvedTool.originalName
            )!;
          }).filter(Boolean);
        }

        // Convert filtered tools to MCP Tool format
        const mcpTools = toolsToExpose.map((tool) => ({
          name: tool.namespacedName,
          description: tool.description || `Tool from ${tool.serverName} server`,
          inputSchema: {
            ...tool.schema,
            type: "object" as const,
          },
        }));

        tools.push(...mcpTools);
      } catch (error) {
        console.error("Failed to get available tools:", error);
      }
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
            const discoveredTools = this.discoveryEngine.getAvailableTools(true);
            // Also return structured content
            const structured = formatAvailableTools(discoveredTools);
            
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
                  text: "❌ **Tool discovery not enabled**\n\nTool calling must be enabled to discover tools from servers.",
                },
              ],
              isError: true
            };
          }

        case "build-toolset":
          if (this.discoveryEngine) {
            const discoveredTools = this.discoveryEngine.getAvailableTools(true);
            const result = await buildToolset(args || {}, discoveredTools);
            
            // Handle autoEquip if requested and build was successful
            if (result.content?.[0]?.text && args?.autoEquip) {
              try {
                const buildResult = JSON.parse(result.content[0].text);
                if (buildResult.success) {
                  // Load the newly created toolset and make it active
                  const stored = await loadStoredToolsets();
                  const toolsetName = buildResult.toolsetName;
                  if (toolsetName && stored[toolsetName]) {
                    this.activeToolset = stored[toolsetName];
                    
                    // Notify clients that tools have changed
                    await this.notifyToolsChanged();
                    
                    // Update result to indicate auto-equipping was successful
                    buildResult.autoEquipped = true;
                    result.content[0].text = JSON.stringify(buildResult);
                  }
                }
              } catch (error) {
                console.error("Failed to auto-equip toolset:", error);
                // Don't fail the entire operation if auto-equip fails
              }
            }
            
            return result;
          } else {
            return {
              content: [
                {
                  type: "text",
                  text: "❌ **Tool discovery not enabled**\n\nTool calling must be enabled to build toolsets.",
                },
              ],
            };
          }

        case "list-saved-toolsets":
          return await listSavedToolsets();

        case "equip-toolset":
          if (this.discoveryEngine) {
            // Refresh discovery cache before applying toolset to ensure latest tools
            await this.discoveryEngine.refreshCache();
            const discoveredTools = this.discoveryEngine.getAvailableTools(true);
            const result = await selectToolset(args || {}, discoveredTools);
            
            // If toolset was successfully selected, make it active
            if (result.content && result.content[0] && result.content[0].text.includes("✅")) {
              try {
                // Load the toolset configuration and set it as active
                const stored = await loadStoredToolsets();
                const toolsetName = args?.name;
                if (toolsetName && stored[toolsetName]) {
                  this.activeToolset = stored[toolsetName];
                  
                  // Notify clients that tools have changed
                  await this.notifyToolsChanged();
                  
                  // Add notification that toolset is now equipped
                  result.content[0].text += "\n\n🔄 **Toolset Equipped**: The server's tool list has been updated to reflect this toolset.";
                }
              } catch (error) {
                console.error("Failed to apply toolset:", error);
              }
            }
            
            return result;
          } else {
            return {
              content: [
                {
                  type: "text",
                  text: "❌ **Tool discovery not enabled**\n\nTool calling must be enabled to select toolsets.",
                },
              ],
            };
          }

        case "delete-toolset":
          return await deleteToolset(args || {});

        case "unequip-toolset":
          this.activeToolset = undefined;
          
          // Notify clients that tools have changed
          await this.notifyToolsChanged();
          
          return {
            content: [
              {
                type: "text",
                text: "✅ **Toolset Unequipped**\n\nAll discovered tools are now available. The server's tool list has been reset to show all tools from connected servers.",
              },
            ],
          };

        case "get-active-toolset":
          if (this.activeToolset) {
            const discoveredTools = this.discoveryEngine?.getAvailableTools(true) || [];
            
            // Apply toolset to get detailed status
            this.toolsetManager.setConfig(this.activeToolset);
            const resolution = await this.toolsetManager.applyConfig(discoveredTools);
            
            // Count servers by status
            const availableServers = new Set(discoveredTools.map(t => t.serverName));
            const configuredServers = this.activeToolset.servers;
            const enabledServers = configuredServers.filter(s => s.enabled !== false);
            const unavailableServers = enabledServers.filter(s => !availableServers.has(s.serverName));
            const disabledServers = configuredServers.filter(s => s.enabled === false);
            
            // Get tool details
            const totalConfiguredTools = resolution.tools.length;
            const toolsByServer: Record<string, string[]> = {};
            for (const tool of resolution.tools) {
              if (!toolsByServer[tool.serverName]) {
                toolsByServer[tool.serverName] = [];
              }
              toolsByServer[tool.serverName].push(tool.resolvedName);
            }
            
            let output = `🎯 **Equipped Toolset: "${this.activeToolset.name}"**\n\n`;
            output += `${this.activeToolset.description || 'No description'}\n\n`;
            
            // Toolset metadata
            output += `## Toolset Information\n`;
            output += `- **Created:** ${this.activeToolset.createdAt ? new Date(this.activeToolset.createdAt).toLocaleDateString() : 'Unknown'}\n`;
            output += `- **Version:** ${this.activeToolset.version || '1.0.0'}\n`;
            output += `- **Conflict Resolution:** ${this.activeToolset.options?.conflictResolution || 'namespace'}\n\n`;
            
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
            
            // Show warnings if any
            if (resolution.warnings && resolution.warnings.length > 0) {
              output += `## ⚠️ Warnings\n\n`;
              for (const warning of resolution.warnings) {
                output += `- ${warning}\n`;
              }
              output += `\n`;
            }
            
            output += `Use \`unequip-toolset\` to remove this filter and show all tools.`;
            
            // Create structured response
            const structuredResponse = {
              equipped: true,
              toolset: {
                name: this.activeToolset.name,
                description: this.activeToolset.description || '',
                version: this.activeToolset.version || '1.0.0',
                createdAt: this.activeToolset.createdAt ? new Date(this.activeToolset.createdAt).toISOString() : '',
                conflictResolution: this.activeToolset.options?.conflictResolution || 'namespace'
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
              warnings: resolution.warnings || []
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
          if (!this.enableCallTool || !this.requestRouter) {
            throw new Error(
              "Tool calling is not enabled. Use --enable-call-tool flag to enable."
            );
          }

          const response = await this.requestRouter.routeToolCall({
            name,
            arguments: args,
          });

          return response;
      }
    } catch (error) {
      console.error("Tool call failed:", error);
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
      console.error("Error stopping enhanced server:", error);
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
