/**
 * Toolset management CLI commands
 */

import { Command } from "commander";
import { ToolsetManager } from "../../server/tools/toolset/manager.js";
import { ToolDiscoveryEngine } from "../../discovery/index.js";
import { ConnectionManager } from "../../connection/manager.js";
import { theme, semantic } from "../../utils/theme.js";
import { createChildLogger } from "../../utils/logging.js";
import type {
  DynamicToolReference,
  ToolsetToolNote,
} from "../../server/tools/toolset/types.js";

const logger = createChildLogger({ module: "toolset-cli" });

/**
 * Initialize toolset manager with discovery engine
 */
async function initializeToolsetManager(
  options: { requireConnections?: boolean } = {}
): Promise<{
  toolsetManager: ToolsetManager;
  discoveryEngine?: ToolDiscoveryEngine;
  connectionManager?: ConnectionManager;
}> {
  // Create toolset manager (always needed)
  const toolsetManager = new ToolsetManager();

  // For commands that don't need server connections (like list-saved-toolsets),
  // we can skip the connection setup
  if (!options.requireConnections) {
    return { toolsetManager };
  }

  // Create instances for discovery
  const connectionManager = new ConnectionManager();
  const discoveryEngine = new ToolDiscoveryEngine(connectionManager);

  // Connect toolset manager to discovery engine
  toolsetManager.setDiscoveryEngine(discoveryEngine);

  // Load MCP configuration and discover tools
  const { discoverMcpConfig } = await import("../../config/mcpConfigLoader.js");
  const configResult = await discoverMcpConfig();

  if (!configResult.configPath) {
    throw new Error(
      configResult.errorMessage ||
        "No MCP configuration found. Run 'hypertool-mcp setup' first."
    );
  }

  // Load the MCP server configurations
  const { loadMcpConfig } = await import("../../config/mcpConfigLoader.js");
  const serverConfigs = await loadMcpConfig(configResult.configPath);

  // Initialize connection manager with server configurations
  await connectionManager.initialize(serverConfigs);

  // Initialize discovery engine with basic configuration
  await discoveryEngine.initialize({
    autoDiscovery: true,
    enableMetrics: true,
  });

  // Start the discovery process
  await discoveryEngine.start();

  return { toolsetManager, discoveryEngine, connectionManager };
}

/**
 * Format tool reference for display
 */
function formatToolReference(tool: {
  namespacedName: string;
  refId: string;
  server: string;
  active: boolean;
}): string {
  const status = tool.active ? theme.success("✓") : theme.error("✗");
  const server = theme.muted(`[${tool.server}]`);
  return `${status} ${tool.namespacedName} ${server} (${tool.refId.substring(0, 8)}...)`;
}

/**
 * Create list-available-tools command
 */
export function createListAvailableToolsCommand(): Command {
  return new Command("list-available-tools")
    .description("List all available tools from connected MCP servers")
    .action(async () => {
      try {
        console.log(theme.info("🔍 Discovering available tools..."));
        console.log();

        const { toolsetManager } = await initializeToolsetManager({
          requireConnections: true,
        });
        const result = toolsetManager.formatAvailableTools();

        if (result.summary.totalTools === 0) {
          console.log(theme.warning("⚠️  No tools found"));
          console.log(
            theme.muted("   Make sure MCP servers are configured and running")
          );
          return;
        }

        // Display summary
        console.log(theme.success("📊 Tool Discovery Summary"));
        console.log(
          `   ${theme.label("Total Tools:")} ${result.summary.totalTools}`
        );
        console.log(
          `   ${theme.label("Total Servers:")} ${result.summary.totalServers}`
        );
        console.log();

        // Display tools by server
        for (const serverGroup of result.toolsByServer) {
          console.log(
            theme.info(
              `📦 ${serverGroup.serverName} (${serverGroup.toolCount} tools)`
            )
          );

          for (const tool of serverGroup.tools) {
            const refId = tool.refId.substring(0, 8);
            const namespacedName = theme.success(tool.namespacedName);
            const description = tool.description
              ? ` - ${theme.muted(tool.description.split("\n")[0])}`
              : "";

            console.log(
              `   • ${namespacedName} ${theme.muted(`[${refId}]`)}${description}`
            );
          }
          console.log();
        }

        console.log(
          theme.info(
            "💡 Use these references with 'build-toolset' to create custom toolsets"
          )
        );
      } catch (error) {
        console.error(
          semantic.messageError("❌ Failed to list available tools:")
        );
        console.error(
          theme.error(
            `   ${error instanceof Error ? error.message : String(error)}`
          )
        );
        process.exit(1);
      }
    });
}

/**
 * Create list-saved-toolsets command
 */
export function createListSavedToolsetsCommand(): Command {
  return new Command("list-saved-toolsets")
    .description("List all saved toolset configurations")
    .action(async () => {
      try {
        const { toolsetManager } = await initializeToolsetManager({
          requireConnections: false,
        });
        const result = await toolsetManager.listSavedToolsets();

        if (!result.success) {
          console.error(semantic.messageError("❌ Failed to list toolsets:"));
          console.error(theme.error(`   ${result.error}`));
          process.exit(1);
        }

        if (result.toolsets.length === 0) {
          console.log(theme.warning("📦 No saved toolsets found"));
          console.log();
          console.log(theme.info("💡 Create your first toolset with:"));
          console.log(theme.muted("   hypertool-mcp build-toolset"));
          return;
        }

        console.log(
          theme.success(`📦 Found ${result.toolsets.length} saved toolsets`)
        );
        console.log();

        for (const toolset of result.toolsets) {
          const activeStatus = toolset.active
            ? ` ${theme.success("(ACTIVE)")}`
            : "";

          console.log(theme.info(`${toolset.name}${activeStatus}`));

          if (toolset.description) {
            console.log(`   ${theme.muted(toolset.description)}`);
          }

          console.log(`   ${theme.label("Tools:")} ${toolset.toolCount}`);
          console.log(`   ${theme.label("Servers:")} ${toolset.totalServers}`);
          console.log(
            `   ${theme.label("Created:")} ${theme.muted(toolset.createdAt)}`
          );

          if (toolset.version) {
            console.log(`   ${theme.label("Version:")} ${toolset.version}`);
          }

          console.log();
        }

        console.log(
          theme.info("💡 Use 'equip-toolset <name>' to activate a toolset")
        );
      } catch (error) {
        console.error(
          semantic.messageError("❌ Failed to list saved toolsets:")
        );
        console.error(
          theme.error(
            `   ${error instanceof Error ? error.message : String(error)}`
          )
        );
        process.exit(1);
      }
    });
}

/**
 * Create build-toolset command
 */
export function createBuildToolsetCommand(): Command {
  return new Command("build-toolset")
    .description("Build and save a custom toolset by selecting specific tools")
    .requiredOption(
      "--name <name>",
      "Name for the new toolset (lowercase with hyphens)"
    )
    .option(
      "--description <description>",
      "Optional description of the toolset"
    )
    .option(
      "--auto-equip",
      "Automatically equip this toolset after creation",
      false
    )
    .option(
      "--tools <tools>",
      "Comma-separated list of tool references (namespacedName or refId)"
    )
    .action(async (options) => {
      try {
        const { toolsetManager } = await initializeToolsetManager({
          requireConnections: true,
        });

        // Parse tool references from command line
        let tools: DynamicToolReference[] = [];

        if (options.tools) {
          const toolRefs = options.tools
            .split(",")
            .map((ref: string) => ref.trim());

          for (const ref of toolRefs) {
            // Check if it looks like a refId (hex string) or namespacedName
            if (/^[a-f0-9]{8,}$/i.test(ref)) {
              tools.push({ refId: ref });
            } else {
              tools.push({ namespacedName: ref });
            }
          }
        }

        if (tools.length === 0) {
          console.error(semantic.messageError("❌ No tools specified"));
          console.error(
            theme.warning("   Use --tools to specify tool references")
          );
          console.error(
            theme.info("   Example: --tools git.status,docker.ps,abc12345")
          );
          console.error();
          console.error(
            theme.info("💡 Use 'list-available-tools' to see available tools")
          );
          process.exit(1);
        }

        console.log(theme.info(`🔨 Building toolset "${options.name}"...`));
        console.log();

        const result = await toolsetManager.buildToolset(options.name, tools, {
          description: options.description,
          autoEquip: options.autoEquip,
        });

        if (!result.meta.success) {
          console.error(semantic.messageError("❌ Failed to build toolset:"));
          console.error(theme.error(`   ${result.meta.error}`));
          process.exit(1);
        }

        console.log(
          theme.success(`✅ Successfully created toolset "${options.name}"`)
        );

        if (result.toolset) {
          console.log();
          console.log(theme.info("📊 Toolset Details:"));
          console.log(`   ${theme.label("Name:")} ${result.toolset.name}`);

          if (result.toolset.description) {
            console.log(
              `   ${theme.label("Description:")} ${result.toolset.description}`
            );
          }

          console.log(
            `   ${theme.label("Tools:")} ${result.toolset.toolCount}`
          );
          console.log(
            `   ${theme.label("Servers:")} ${result.toolset.totalServers}`
          );

          if (result.meta.autoEquipped) {
            console.log();
            console.log(
              theme.success(
                "🎯 Toolset automatically equipped and ready to use"
              )
            );
          } else {
            console.log();
            console.log(
              theme.info("💡 Use 'equip-toolset' to activate this toolset")
            );
          }

          // Show tool details if available
          if (result.toolset.tools && result.toolset.tools.length > 0) {
            console.log();
            console.log(theme.info("🔧 Included Tools:"));
            for (const tool of result.toolset.tools) {
              console.log(`   ${formatToolReference(tool)}`);
            }
          }
        }
      } catch (error) {
        console.error(semantic.messageError("❌ Failed to build toolset:"));
        console.error(
          theme.error(
            `   ${error instanceof Error ? error.message : String(error)}`
          )
        );
        process.exit(1);
      }
    });
}

/**
 * Create equip-toolset command
 */
export function createEquipToolsetCommand(): Command {
  return new Command("equip-toolset")
    .description(
      "Equip a saved toolset configuration to filter available tools"
    )
    .argument("<name>", "Name of the toolset to equip")
    .action(async (name: string) => {
      try {
        console.log(theme.info(`🎯 Equipping toolset "${name}"...`));

        const { toolsetManager } = await initializeToolsetManager({
          requireConnections: false,
        });
        const result = await toolsetManager.equipToolset(name);

        if (!result.success) {
          console.error(semantic.messageError("❌ Failed to equip toolset:"));
          console.error(theme.error(`   ${result.error}`));
          process.exit(1);
        }

        console.log(
          theme.success(`✅ Successfully equipped toolset "${name}"`)
        );

        if (result.toolset) {
          console.log();
          console.log(theme.info("📊 Active Toolset:"));
          console.log(`   ${theme.label("Name:")} ${result.toolset.name}`);

          if (result.toolset.description) {
            console.log(
              `   ${theme.label("Description:")} ${result.toolset.description}`
            );
          }

          console.log(
            `   ${theme.label("Tools:")} ${result.toolset.toolCount}`
          );
          console.log(
            `   ${theme.label("Servers:")} ${result.toolset.totalServers}`
          );

          // Show tool details
          if (result.toolset.tools && result.toolset.tools.length > 0) {
            console.log();
            console.log(theme.info("🔧 Active Tools:"));
            for (const tool of result.toolset.tools) {
              console.log(`   ${formatToolReference(tool)}`);
            }
          }
        }

        console.log();
        console.log(
          theme.info("💡 This toolset will be used when the MCP server starts")
        );
      } catch (error) {
        console.error(semantic.messageError("❌ Failed to equip toolset:"));
        console.error(
          theme.error(
            `   ${error instanceof Error ? error.message : String(error)}`
          )
        );
        process.exit(1);
      }
    });
}

/**
 * Create delete-toolset command
 */
export function createDeleteToolsetCommand(): Command {
  return new Command("delete-toolset")
    .description("Delete a saved toolset configuration")
    .argument("<name>", "Name of the toolset to delete")
    .option(
      "--confirm",
      "Confirm deletion (required to actually delete)",
      false
    )
    .action(async (name: string, options) => {
      try {
        const { toolsetManager } = await initializeToolsetManager({
          requireConnections: false,
        });

        if (!options.confirm) {
          console.log(
            theme.warning(`⚠️  This will permanently delete toolset "${name}"`)
          );
          console.log();
          console.log(theme.info("To confirm deletion, run:"));
          console.log(
            theme.muted(`   hypertool-mcp delete-toolset ${name} --confirm`)
          );
          return;
        }

        console.log(theme.info(`🗑️  Deleting toolset "${name}"...`));

        const result = await toolsetManager.deleteToolset(name, {
          confirm: true,
        });

        if (!result.success) {
          console.error(semantic.messageError("❌ Failed to delete toolset:"));
          console.error(theme.error(`   ${result.error}`));
          process.exit(1);
        }

        console.log(theme.success(`✅ ${result.message}`));
      } catch (error) {
        console.error(semantic.messageError("❌ Failed to delete toolset:"));
        console.error(
          theme.error(
            `   ${error instanceof Error ? error.message : String(error)}`
          )
        );
        process.exit(1);
      }
    });
}

/**
 * Create unequip-toolset command
 */
export function createUnequipToolsetCommand(): Command {
  return new Command("unequip-toolset")
    .description(
      "Unequip the currently equipped toolset and show all available tools"
    )
    .action(async () => {
      try {
        console.log(theme.info("🔄 Unequipping current toolset..."));

        const { toolsetManager } = await initializeToolsetManager({
          requireConnections: false,
        });

        // Check if there's an active toolset
        const activeToolset = toolsetManager.getActiveToolsetConfig();
        if (!activeToolset) {
          console.log(theme.warning("⚠️  No toolset is currently equipped"));
          return;
        }

        await toolsetManager.unequipToolset();

        console.log(
          theme.success(
            `✅ Successfully unequipped toolset "${activeToolset.name}"`
          )
        );
        console.log();
        console.log(
          theme.info(
            "💡 All available tools will now be exposed when the MCP server runs"
          )
        );
      } catch (error) {
        console.error(semantic.messageError("❌ Failed to unequip toolset:"));
        console.error(
          theme.error(
            `   ${error instanceof Error ? error.message : String(error)}`
          )
        );
        process.exit(1);
      }
    });
}

/**
 * Create get-active-toolset command
 */
export function createGetActiveToolsetCommand(): Command {
  return new Command("get-active-toolset")
    .description(
      "Get detailed information about the currently equipped toolset"
    )
    .action(async () => {
      try {
        const { toolsetManager } = await initializeToolsetManager({
          requireConnections: false,
        });

        const activeToolset = toolsetManager.getActiveToolsetConfig();
        if (!activeToolset) {
          console.log(theme.warning("⚠️  No toolset is currently equipped"));
          console.log();
          console.log(
            theme.info("💡 Use 'equip-toolset <name>' to activate a toolset")
          );
          console.log(
            theme.info("💡 Use 'list-saved-toolsets' to see available toolsets")
          );
          return;
        }

        // Generate detailed toolset info
        const toolsetInfo =
          await toolsetManager.generateToolsetInfo(activeToolset);

        console.log(theme.success("🎯 Active Toolset Information"));
        console.log();
        console.log(`   ${theme.label("Name:")} ${toolsetInfo.name}`);

        if (toolsetInfo.description) {
          console.log(
            `   ${theme.label("Description:")} ${toolsetInfo.description}`
          );
        }

        console.log(
          `   ${theme.label("Version:")} ${toolsetInfo.version || "1.0.0"}`
        );
        console.log(
          `   ${theme.label("Created:")} ${theme.muted(toolsetInfo.createdAt)}`
        );
        console.log(`   ${theme.label("Tools:")} ${toolsetInfo.toolCount}`);
        console.log(
          `   ${theme.label("Servers:")} ${toolsetInfo.totalServers}`
        );
        console.log(`   ${theme.label("Location:")} ${toolsetInfo.location}`);

        // Show server breakdown
        if (toolsetInfo.servers && toolsetInfo.servers.length > 0) {
          console.log();
          console.log(theme.info("📦 Server Breakdown:"));
          for (const server of toolsetInfo.servers) {
            const status = server.enabled
              ? theme.success("✓")
              : theme.error("✗");
            console.log(
              `   ${status} ${server.name} (${server.toolCount} tools)`
            );
          }
        }

        // Show detailed tool list
        if (toolsetInfo.tools && toolsetInfo.tools.length > 0) {
          console.log();
          console.log(theme.info("🔧 Tools:"));
          for (const tool of toolsetInfo.tools) {
            console.log(`   ${formatToolReference(tool)}`);
          }
        }
      } catch (error) {
        console.error(
          semantic.messageError("❌ Failed to get active toolset:")
        );
        console.error(
          theme.error(
            `   ${error instanceof Error ? error.message : String(error)}`
          )
        );
        process.exit(1);
      }
    });
}

/**
 * Create add-tool-annotation command
 */
export function createAddToolAnnotationCommand(): Command {
  return new Command("add-tool-annotation")
    .description("Add contextual annotations to a tool in the current toolset")
    .option(
      "--tool-name <name>",
      "Tool reference by namespaced name (e.g., git.status)"
    )
    .option("--tool-ref <refId>", "Tool reference by unique hash identifier")
    .option(
      "--note-name <name>",
      "Identifier for the annotation (e.g., usage-tips)"
    )
    .option(
      "--note-content <content>",
      "The annotation content to help guide LLM usage"
    )
    .action(async (options) => {
      try {
        // Validate required options
        if (!options.toolName && !options.toolRef) {
          console.error(semantic.messageError("❌ Tool reference required"));
          console.error(
            theme.warning(
              "   Use either --tool-name or --tool-ref to specify the tool"
            )
          );
          console.error(theme.info("   Example: --tool-name git.status"));
          process.exit(1);
        }

        if (!options.noteName || !options.noteContent) {
          console.error(semantic.messageError("❌ Note details required"));
          console.error(
            theme.warning("   Both --note-name and --note-content are required")
          );
          console.error(
            theme.info(
              '   Example: --note-name usage-tips --note-content "Always confirm with user first"'
            )
          );
          process.exit(1);
        }

        const { toolsetManager } = await initializeToolsetManager({
          requireConnections: false,
        });

        // Check if there's an active toolset
        const activeToolset = toolsetManager.getActiveToolsetConfig();
        if (!activeToolset) {
          console.error(
            semantic.messageError("❌ No toolset is currently equipped")
          );
          console.error(
            theme.info(
              "   Use 'equip-toolset <name>' to activate a toolset first"
            )
          );
          process.exit(1);
        }

        // Build tool reference
        const toolRef: DynamicToolReference = options.toolName
          ? { namespacedName: options.toolName }
          : { refId: options.toolRef };

        // Build annotation
        const notes: ToolsetToolNote[] = [
          {
            name: options.noteName,
            note: options.noteContent,
          },
        ];

        console.log(theme.info(`📝 Adding annotation to tool...`));

        // Update the toolset configuration
        const updatedToolset = { ...activeToolset };

        // Initialize toolNotes array if it doesn't exist
        if (!updatedToolset.toolNotes) {
          updatedToolset.toolNotes = [];
        }

        // Find existing annotation entry for this tool
        const existingEntryIndex = updatedToolset.toolNotes.findIndex(
          (entry) => {
            if (toolRef.namespacedName && entry.toolRef.namespacedName) {
              return entry.toolRef.namespacedName === toolRef.namespacedName;
            }
            if (toolRef.refId && entry.toolRef.refId) {
              return entry.toolRef.refId === toolRef.refId;
            }
            return false;
          }
        );

        if (existingEntryIndex >= 0) {
          // Add to existing entry
          const existingNoteIndex = updatedToolset.toolNotes[
            existingEntryIndex
          ].notes.findIndex((note) => note.name === options.noteName);

          if (existingNoteIndex >= 0) {
            // Update existing note
            updatedToolset.toolNotes[existingEntryIndex].notes[
              existingNoteIndex
            ] = notes[0];
            console.log(
              theme.success(
                `✅ Updated existing annotation "${options.noteName}"`
              )
            );
          } else {
            // Add new note to existing entry
            updatedToolset.toolNotes[existingEntryIndex].notes.push(notes[0]);
            console.log(
              theme.success(`✅ Added new annotation "${options.noteName}"`)
            );
          }
        } else {
          // Create new entry
          updatedToolset.toolNotes.push({
            toolRef,
            notes,
          });
          console.log(
            theme.success(`✅ Created new annotation entry for tool`)
          );
        }

        // Update the toolset
        const validation = toolsetManager.setCurrentToolset(updatedToolset);
        if (!validation.valid) {
          console.error(semantic.messageError("❌ Failed to update toolset:"));
          console.error(theme.error(`   ${validation.errors.join(", ")}`));
          process.exit(1);
        }

        // Save the updated toolset
        const preferences = await import("../../config/preferenceStore.js");
        const { loadStoredToolsets, saveStoredToolsets } = preferences;
        const stored = await loadStoredToolsets();
        stored[updatedToolset.name] = updatedToolset;
        await saveStoredToolsets(stored);

        console.log();
        console.log(theme.info("📊 Annotation Details:"));
        console.log(
          `   ${theme.label("Tool:")} ${options.toolName || options.toolRef}`
        );
        console.log(`   ${theme.label("Note Name:")} ${options.noteName}`);
        console.log(`   ${theme.label("Content:")} ${options.noteContent}`);
        console.log();
        console.log(
          theme.info(
            "💡 This annotation will be displayed with the tool's description"
          )
        );
      } catch (error) {
        console.error(
          semantic.messageError("❌ Failed to add tool annotation:")
        );
        console.error(
          theme.error(
            `   ${error instanceof Error ? error.message : String(error)}`
          )
        );
        process.exit(1);
      }
    });
}

/**
 * Create main toolset command with all subcommands
 */
export function createToolsetCommands(): Command {
  const toolsetCommand = new Command("toolset").description(
    "Toolset management commands"
  );

  // Add all subcommands
  toolsetCommand.addCommand(createListAvailableToolsCommand());
  toolsetCommand.addCommand(createListSavedToolsetsCommand());
  toolsetCommand.addCommand(createBuildToolsetCommand());
  toolsetCommand.addCommand(createEquipToolsetCommand());
  toolsetCommand.addCommand(createDeleteToolsetCommand());
  toolsetCommand.addCommand(createUnequipToolsetCommand());
  toolsetCommand.addCommand(createGetActiveToolsetCommand());
  toolsetCommand.addCommand(createAddToolAnnotationCommand());

  return toolsetCommand;
}
