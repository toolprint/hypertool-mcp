/**
 * Persona management CLI commands
 *
 * Provides CLI interface for the persona content pack system, allowing users
 * to list, activate, validate, and manage personas from the command line.
 */

import { Command } from "commander";
import { theme, semantic } from "../../utils/theme.js";
import { createChildLogger } from "../../utils/logging.js";
import {
  getPersonaDirectory,
  getPersonaDirectorySource,
} from "../../config/personaConfig.js";
import {
  PersonaManager,
  type PersonaManagerConfig,
} from "../../persona/manager.js";
import { discoverPersonas } from "../../persona/discovery.js";
import { PersonaLoader } from "../../persona/loader.js";
import { validatePersona } from "../../persona/validator.js";
import type { PersonaReference, LoadedPersona } from "../../persona/types.js";
import { isPersonaError } from "../../persona/errors.js";
import { createAddCommand } from "./add.js";

const logger = createChildLogger({ module: "persona-cli" });

/**
 * Initialize persona manager for CLI operations
 * For CLI operations, we typically don't need full toolset integration
 * but do need basic validation and discovery capabilities
 */
async function initializePersonaManager(): Promise<PersonaManager> {
  const config: PersonaManagerConfig = {
    autoDiscover: true, // Enable auto-discovery for CLI commands to work properly
    validateOnActivation: true,
    persistState: true,
    stateKey: "hypertool-persona-cli-state",
  };

  const manager = new PersonaManager(config);
  await manager.initialize();
  return manager;
}

/**
 * Enhanced persona information for display
 */
interface EnhancedPersonaInfo {
  name: string;
  description?: string;
  path: string;
  isValid: boolean;
  isArchive: boolean;
  isActive: boolean;
  toolsets: Array<{
    name: string;
    toolCount: number;
    isDefault: boolean;
  }>;
  mcpServers: string[];
  issues?: string[];
}

/**
 * Format enhanced persona reference for display
 */
function formatEnhancedPersonaReference(persona: EnhancedPersonaInfo): string {
  const status = persona.isValid ? theme.success("✓") : theme.error("✗");
  const activeMarker = persona.isActive ? theme.success(" [ACTIVE]") : "";
  const type = persona.isArchive
    ? theme.muted("[archive]")
    : theme.muted("[folder]");

  let line1 = `${status} ${theme.info(persona.name)}${activeMarker} ${type}`;

  if (persona.description) {
    line1 += ` - ${theme.muted(persona.description)}`;
  }

  const details = [];

  if (persona.toolsets.length > 0) {
    const toolsetInfo = persona.toolsets
      .map((ts) => {
        const defaultMarker = ts.isDefault ? "*" : "";
        return `${ts.name}${defaultMarker}(${ts.toolCount})`;
      })
      .join(", ");
    details.push(`Toolsets: ${toolsetInfo}`);
  }

  if (persona.mcpServers.length > 0) {
    details.push(`MCP Servers: ${persona.mcpServers.join(", ")}`);
  }

  let result = `   ${line1}`;
  if (details.length > 0) {
    result += `\n     ${theme.muted(details.join(" | "))}`;
  }

  return result;
}

/**
 * Load detailed persona information
 */
async function loadEnhancedPersonaInfo(
  persona: PersonaReference,
  activePersonaName?: string
): Promise<EnhancedPersonaInfo> {
  const enhanced: EnhancedPersonaInfo = {
    name: persona.name,
    description: persona.description,
    path: persona.path,
    isValid: persona.isValid,
    isArchive: persona.isArchive,
    isActive: activePersonaName === persona.name,
    toolsets: [],
    mcpServers: [],
    issues: persona.issues,
  };

  // If persona is not valid, return basic info
  if (!persona.isValid) {
    return enhanced;
  }

  try {
    // Load full persona details
    const loader = new PersonaLoader();
    const loadResult = await loader.loadPersonaFromReference(persona);

    if (loadResult.success && loadResult.persona) {
      const loadedPersona = loadResult.persona;

      // Extract toolset information
      if (loadedPersona.config.toolsets) {
        enhanced.toolsets = loadedPersona.config.toolsets.map((toolset) => ({
          name: toolset.name,
          toolCount: toolset.toolIds.length,
          isDefault: toolset.name === loadedPersona.config.defaultToolset,
        }));
      }

      // Extract MCP server information
      if (loadedPersona.mcpConfig && loadedPersona.mcpConfig.mcpServers) {
        enhanced.mcpServers = Object.keys(loadedPersona.mcpConfig.mcpServers);
      }

      // Use the loaded description if available
      if (loadedPersona.config.description) {
        enhanced.description = loadedPersona.config.description;
      }
    }
  } catch (error) {
    // If loading fails, we still show basic info
    // This ensures the list command doesn't fail completely
  }

  return enhanced;
}

/**
 * Create list subcommand
 */
export function createListCommand(): Command {
  return new Command("list")
    .description(
      "List available personas with toolsets, MCP servers, and equipped status"
    )
    .option(
      "--include-invalid",
      "Include invalid personas in the results",
      false
    )
    .action(async (options) => {
      try {
        // Discover personas directly using discovery engine
        const discoveryResult = await discoverPersonas();

        // Filter personas based on includeInvalid parameter
        const filteredPersonas = discoveryResult.personas.filter(
          (persona) => options.includeInvalid || persona.isValid
        );

        if (filteredPersonas.length === 0) {
          console.log(theme.success("🎭 Persona Content Packs"));
          console.log();
          console.log(theme.warning("No personas found"));
          console.log();
          console.log(theme.info("💡 To get started:"));
          console.log(
            `   ${theme.info("hypertool persona add <path>")}        ${theme.muted("# Install from folder or .htp file")}`
          );
          console.log(
            `   ${theme.info("hypertool persona --help")}            ${theme.muted("# See complete setup guide")}`
          );
          return;
        }

        // Get current active persona with timeout to avoid hanging
        let activePersonaName: string | undefined;
        try {
          // Use a promise with timeout to avoid hanging
          const activePersonaPromise = Promise.race([
            (async () => {
              const manager = await initializePersonaManager();
              const activePersona = manager.getActivePersona();
              return activePersona?.persona.config.name;
            })(),
            new Promise<undefined>((_, reject) =>
              setTimeout(() => reject(new Error("Timeout")), 2000)
            ),
          ]);
          activePersonaName = await activePersonaPromise;
        } catch {
          // If we can't get active persona quickly, skip it
        }

        // Display header
        console.log(theme.success("🎭 Persona Content Packs"));
        console.log();

        // Load enhanced persona information for detailed display
        const enhancedPersonas = await Promise.all(
          filteredPersonas.map((persona) =>
            loadEnhancedPersonaInfo(persona, activePersonaName)
          )
        );

        // Display personas in multi-line format
        for (const persona of enhancedPersonas) {
          const mcpConfigPath = `${persona.path}/mcp.json`;

          console.log(theme.info(persona.name));
          console.log(
            `  - ${theme.label("activation state:")} ${persona.isActive ? theme.success("true") : theme.muted("false")}`
          );
          console.log(
            `  - ${theme.label("mcp config:")} ${theme.muted(mcpConfigPath)}`
          );
          console.log();
        }

        // Display footer with instructions
        console.log(theme.label("💡 Commands:"));
        console.log(
          `  ${theme.info("hypertool persona add <path>")}           ${theme.muted("# Install new persona")}`
        );
        console.log(
          `  ${theme.info("hypertool persona activate <name>")}      ${theme.muted("# Activate a persona")}`
        );
        console.log(
          `  ${theme.info("hypertool-mcp --persona <name>")}         ${theme.muted("# Run with persona")}`
        );
        console.log(
          `  ${theme.info("hypertool persona --help")}              ${theme.muted("# Complete setup guide")}`
        );
        console.log();
      } catch (error) {
        console.error(semantic.messageError("❌ Failed to list personas:"));
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
 * Create activate subcommand
 */
export function createActivateCommand(): Command {
  return new Command("activate")
    .description("Activate a specific persona with optional toolset selection")
    .argument("<name>", "Name of the persona to activate")
    .option(
      "--toolset <toolset>",
      "Optional toolset name to activate within the persona"
    )
    .action(async (name: string, options) => {
      try {
        console.log(theme.info(`🎯 Activating persona "${name}"...`));

        const manager = await initializePersonaManager();

        // Debug: Show discovered personas count for troubleshooting
        const stats = manager.getStats();
        if (stats.discoveredCount > 0) {
          console.log(
            theme.muted(`   Discovered ${stats.discoveredCount} personas`)
          );
        } else {
          console.log(
            theme.warning(
              `   ⚠️  No personas discovered - this may cause activation to fail`
            )
          );
        }

        // Activate the persona
        const result = await manager.activatePersona(name, {
          toolsetName: options.toolset,
        });

        if (!result.success) {
          console.error(
            semantic.messageError("❌ Failed to activate persona:")
          );
          console.error(
            theme.error(
              `   ${result.errors ? result.errors.join(", ") : "Unknown activation error"}`
            )
          );

          if (result.warnings && result.warnings.length > 0) {
            console.error(theme.warning("   Warnings:"));
            for (const warning of result.warnings) {
              console.error(`     • ${theme.warning(warning)}`);
            }
          }

          process.exit(1);
        }

        console.log(
          theme.success(`✅ Successfully activated persona "${name}"`)
        );
        console.log();

        // Display activation details
        console.log(theme.info("📊 Activation Details:"));
        console.log(`   ${theme.label("Persona:")} ${result.personaName}`);

        if (result.activatedToolset) {
          console.log(
            `   ${theme.label("Active Toolset:")} ${result.activatedToolset}`
          );
        }

        if (result.warnings && result.warnings.length > 0) {
          console.log();
          console.log(theme.warning("   Warnings:"));
          for (const warning of result.warnings) {
            console.log(`     • ${theme.warning(warning)}`);
          }
        }

        console.log();
        console.log(
          theme.info(
            "💡 Persona is now active and will affect future MCP server startups"
          )
        );
      } catch (error) {
        console.error(semantic.messageError("❌ Failed to activate persona:"));
        if (isPersonaError(error)) {
          console.error(theme.error(`   ${error.message}`));
          if (error.details) {
            console.error(theme.error(`   Details: ${error.details}`));
          }
        } else {
          console.error(
            theme.error(
              `   ${error instanceof Error ? error.message : String(error)}`
            )
          );
        }
        process.exit(1);
      }
    });
}

/**
 * Create validate subcommand
 */
export function createValidateCommand(): Command {
  return new Command("validate")
    .description("Validate a persona at the specified path")
    .argument("<path>", "Path to persona folder or archive file")
    .action(async (path: string) => {
      try {
        console.log(theme.info(`🔍 Validating persona at "${path}"...`));
        console.log();

        // Validate the persona
        const result = await validatePersona(path);

        if (result.isValid) {
          console.log(theme.success("✅ Persona is valid"));
        } else {
          console.log(semantic.messageError("❌ Persona validation failed"));
          console.log();

          if (result.errors && result.errors.length > 0) {
            console.log(theme.error("Errors:"));
            for (const error of result.errors) {
              console.log(`   • ${theme.error(error.message)}`);
            }
          }
        }

        if (result.warnings && result.warnings.length > 0) {
          console.log();
          console.log(theme.warning("Warnings:"));
          for (const warning of result.warnings) {
            console.log(`   • ${theme.warning(warning.message)}`);
          }
        }
      } catch (error) {
        console.error(semantic.messageError("❌ Failed to validate persona:"));
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
 * Create status subcommand
 */
export function createStatusCommand(): Command {
  return new Command("status")
    .description("Show current active persona status")
    .action(async () => {
      try {
        const manager = await initializePersonaManager();

        const activePersona = manager.getActivePersona();

        if (!activePersona) {
          console.log(theme.warning("📦 No persona is currently active"));
          console.log();
          console.log(
            theme.info(
              "💡 Use 'hypertool persona activate <name>' to activate a persona"
            )
          );
          console.log(
            theme.info(
              "💡 Use 'hypertool persona list' to see available personas"
            )
          );
          return;
        }

        console.log(theme.success("🎯 Active Persona Status"));
        console.log();
        console.log(
          `   ${theme.label("Name:")} ${activePersona.persona.config.name}`
        );

        if (activePersona.persona.config.description) {
          console.log(
            `   ${theme.label("Description:")} ${activePersona.persona.config.description}`
          );
        }

        if (activePersona.activeToolset) {
          console.log(
            `   ${theme.label("Active Toolset:")} ${activePersona.activeToolset}`
          );
        }

        if (activePersona.activatedAt) {
          console.log(
            `   ${theme.label("Activated:")} ${theme.muted(activePersona.activatedAt.toISOString())}`
          );
        }

        if (activePersona.persona.sourcePath) {
          console.log(
            `   ${theme.label("Path:")} ${theme.muted(activePersona.persona.sourcePath)}`
          );
        }

        // Show toolset information if available
        if (
          activePersona.persona.config.toolsets &&
          activePersona.persona.config.toolsets.length > 0
        ) {
          console.log();
          console.log(theme.info("🔧 Available Toolsets:"));
          for (const toolset of activePersona.persona.config.toolsets) {
            const isActive = toolset.name === activePersona.activeToolset;
            const marker = isActive ? theme.success("→") : "  ";
            console.log(
              `   ${marker} ${toolset.name} (${toolset.toolIds.length} tools)`
            );
          }
        }
      } catch (error) {
        console.error(
          semantic.messageError("❌ Failed to get persona status:")
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
 * Create inspect subcommand
 */
export function createInspectCommand(): Command {
  return new Command("inspect")
    .description(
      "Show detailed information about a specific persona including its MCP configuration"
    )
    .argument("<name>", "Name of the persona to inspect")
    .action(async (name: string) => {
      try {
        console.log(theme.info(`🔍 Inspecting persona "${name}"...`));
        console.log();

        // Discover personas to find the requested one
        const discoveryResult = await discoverPersonas();
        const persona = discoveryResult.personas.find((p) => p.name === name);

        if (!persona) {
          console.error(
            semantic.messageError(`❌ Persona "${name}" not found`)
          );
          console.log();
          console.log(theme.info("💡 Available personas:"));
          for (const p of discoveryResult.personas.filter((p) => p.isValid)) {
            console.log(`   • ${p.name}`);
          }
          process.exit(1);
        }

        // Load the persona to get detailed information
        const loader = new PersonaLoader();
        const loadResult = await loader.loadPersonaFromReference(persona);

        if (!loadResult.success) {
          console.error(
            semantic.messageError(`❌ Failed to load persona "${name}":`)
          );
          if (loadResult.errors && loadResult.errors.length > 0) {
            for (const error of loadResult.errors) {
              console.error(`   • ${theme.error(error)}`);
            }
          }
          process.exit(1);
        }

        const loadedPersona = loadResult.persona;
        if (!loadedPersona) {
          console.error(
            semantic.messageError(`❌ No persona data loaded for "${name}"`)
          );
          process.exit(1);
        }

        // Display basic persona information
        console.log(theme.success(`📋 Persona Details: ${name}`));
        console.log();
        console.log(`   ${theme.label("Name:")} ${loadedPersona.config.name}`);
        console.log(
          `   ${theme.label("Description:")} ${loadedPersona.config.description || theme.muted("No description")}`
        );
        console.log(
          `   ${theme.label("Version:")} ${loadedPersona.config.version || theme.muted("Not specified")}`
        );
        console.log(`   ${theme.label("Path:")} ${loadedPersona.sourcePath}`);
        console.log(
          `   ${theme.label("Valid:")} ${persona.isValid ? theme.success("✓ Yes") : theme.error("✗ No")}`
        );

        if (loadedPersona.config.metadata) {
          const metadata = loadedPersona.config.metadata;
          console.log();
          console.log(theme.info("📊 Metadata:"));
          if (metadata.author)
            console.log(`   ${theme.label("Author:")} ${metadata.author}`);
          if (metadata.created)
            console.log(`   ${theme.label("Created:")} ${metadata.created}`);
          if (metadata.lastModified)
            console.log(
              `   ${theme.label("Last Modified:")} ${metadata.lastModified}`
            );
          if (metadata.tags && metadata.tags.length > 0) {
            console.log(
              `   ${theme.label("Tags:")} ${metadata.tags.join(", ")}`
            );
          }
        }

        // Display toolsets
        if (
          loadedPersona.config.toolsets &&
          loadedPersona.config.toolsets.length > 0
        ) {
          console.log();
          console.log(theme.info("🔧 Toolsets:"));
          for (const toolset of loadedPersona.config.toolsets) {
            const isDefault =
              toolset.name === loadedPersona.config.defaultToolset;
            const marker = isDefault ? theme.success(" (default)") : "";
            console.log(
              `   • ${theme.info(toolset.name)}${marker} - ${toolset.toolIds.length} tools`
            );
            for (const toolId of toolset.toolIds) {
              console.log(`     - ${theme.muted(toolId)}`);
            }
          }
        } else {
          console.log();
          console.log(theme.warning("⚠️  No toolsets defined"));
        }

        // Display MCP configuration if present
        if (loadedPersona.mcpConfig) {
          console.log();
          console.log(theme.info("🔌 MCP Configuration:"));

          // Show location of mcp.json
          const mcpConfigPath = `${loadedPersona.sourcePath}/mcp.json`;
          console.log(`   ${theme.label("Config File:")} ${mcpConfigPath}`);

          if (loadedPersona.mcpConfig.mcpServers) {
            console.log(
              `   ${theme.label("Servers:")} ${Object.keys(loadedPersona.mcpConfig.mcpServers).length} configured`
            );
            console.log();
            console.log("   MCP Server Configurations:");
            for (const [serverName, serverConfig] of Object.entries(
              loadedPersona.mcpConfig.mcpServers
            )) {
              console.log(`     • ${theme.info(serverName)}`);
              console.log(
                `       Command: ${theme.muted(JSON.stringify(serverConfig))}`
              );
            }
          }

          console.log();
          console.log(theme.info("📄 Complete MCP Configuration:"));
          console.log(JSON.stringify(loadedPersona.mcpConfig, null, 2));
        } else {
          console.log();
          console.log(theme.warning("⚠️  No MCP configuration found"));
          console.log(
            `   ${theme.muted("Expected at:")} ${loadedPersona.sourcePath}/mcp.json`
          );
        }

        // Show validation issues if any
        if (!persona.isValid && persona.issues && persona.issues.length > 0) {
          console.log();
          console.log(theme.error("❌ Validation Issues:"));
          for (const issue of persona.issues) {
            console.log(`   • ${theme.error(issue)}`);
          }
        }

        console.log();
        console.log(
          theme.info(
            "💡 Use 'hypertool persona activate " +
              name +
              "' to activate this persona"
          )
        );
      } catch (error) {
        console.error(semantic.messageError("❌ Failed to inspect persona:"));
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
 * Create deactivate subcommand
 */
export function createDeactivateCommand(): Command {
  return new Command("deactivate")
    .description("Deactivate the current active persona")
    .action(async () => {
      try {
        const manager = await initializePersonaManager();

        const activePersona = manager.getActivePersona();
        if (!activePersona) {
          console.log(theme.warning("📦 No persona is currently active"));
          return;
        }

        console.log(
          theme.info(
            `🔄 Deactivating persona "${activePersona.persona.config.name}"...`
          )
        );

        const result = await manager.deactivatePersona();

        if (!result.success) {
          console.error(
            semantic.messageError("❌ Failed to deactivate persona:")
          );
          console.error(
            theme.error(
              `   ${result.errors ? result.errors.join(", ") : "Unknown deactivation error"}`
            )
          );
          process.exit(1);
        }

        console.log(
          theme.success(
            `✅ Successfully deactivated persona "${activePersona.persona.config.name}"`
          )
        );
        console.log();
        console.log(theme.info("💡 No persona is now active"));
      } catch (error) {
        console.error(
          semantic.messageError("❌ Failed to deactivate persona:")
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
 * Create main persona command with all subcommands
 */
export function createPersonaCommand(): Command {
  const personaCommand = new Command("persona")
    .description("Persona content pack management")
    .addHelpText(
      "after",
      `
${theme.success("🎭 PERSONAS - Pre-configured MCP Server Bundles")}

${theme.info("What are personas?")}
  ${theme.muted("Personas are ready-to-use collections of MCP servers and tools that you can")}
  ${theme.muted("install and activate instantly. Think of them as app bundles for AI development.")}

${theme.success("⚡ First Time Setup (3 steps):")}
  ${theme.info("1.")} ${theme.muted("Clone the persona collection:")}
     ${theme.warning("git clone https://github.com/toolprint/awesome-mcp-personas")}

  ${theme.info("2.")} ${theme.muted("Add a persona (replace <persona-name> with actual name):")}
     ${theme.warning("hypertool persona add awesome-mcp-personas/personas/<persona-name>")}

  ${theme.info("3.")} ${theme.muted("Activate it and start using:")}
     ${theme.warning("hypertool persona activate <persona-name>")}

${theme.success("📋 Common Commands:")}
  ${theme.info("list")}       ${theme.muted("See all available personas")}
  ${theme.info("add")}        ${theme.muted("Install a persona from a folder")}
  ${theme.info("activate")}   ${theme.muted("Switch to a persona")}
  ${theme.info("inspect")}    ${theme.muted("View detailed persona info and MCP config")}
  ${theme.info("status")}     ${theme.muted("See which persona is currently active")}
  ${theme.info("deactivate")} ${theme.muted("Turn off current persona")}

${theme.success("💡 Quick Examples:")}
  ${theme.warning("hypertool persona list")}                     ${theme.muted("# Browse available personas")}
  ${theme.warning("hypertool persona add ./my-persona-folder")}  ${theme.muted("# Install from local folder")}
  ${theme.warning("hypertool persona activate web-dev")}         ${theme.muted("# Switch to web-dev persona")}
  ${theme.warning("hypertool persona inspect web-dev")}          ${theme.muted("# View persona details & config")}

${theme.info("📍 Personas are stored at:")} ${theme.muted("~/.toolprint/hypertool-mcp/personas")}`
    );

  // Add all subcommands
  personaCommand.addCommand(createListCommand());
  personaCommand.addCommand(createInspectCommand());
  personaCommand.addCommand(createAddCommand());
  personaCommand.addCommand(createActivateCommand());
  personaCommand.addCommand(createValidateCommand());
  personaCommand.addCommand(createStatusCommand());
  personaCommand.addCommand(createDeactivateCommand());

  return personaCommand;
}
