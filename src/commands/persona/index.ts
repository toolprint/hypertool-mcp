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
    const toolsetInfo = persona.toolsets.map(ts => {
      const defaultMarker = ts.isDefault ? "*" : "";
      return `${ts.name}${defaultMarker}(${ts.toolCount})`;
    }).join(", ");
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
async function loadEnhancedPersonaInfo(persona: PersonaReference, activePersonaName?: string): Promise<EnhancedPersonaInfo> {
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
        enhanced.toolsets = loadedPersona.config.toolsets.map(toolset => ({
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
        console.log(theme.info("🔍 Discovering available personas..."));
        console.log();

        // Discover personas directly using discovery engine
        const discoveryResult = await discoverPersonas();

        // Filter personas based on includeInvalid parameter
        const filteredPersonas = discoveryResult.personas.filter(
          (persona) => options.includeInvalid || persona.isValid
        );

        if (filteredPersonas.length === 0) {
          console.log(theme.warning("📦 No personas found"));
          console.log();
          if (!options.includeInvalid && discoveryResult.personas.length > 0) {
            const invalidCount =
              discoveryResult.personas.length - filteredPersonas.length;
            console.log(
              theme.info(
                `💡 ${invalidCount} invalid persona(s) found. Use --include-invalid to see them.`
              )
            );
          }

          // Show the configured persona directory
          const personaDir = await getPersonaDirectory();
          const configSource = await getPersonaDirectorySource();

          console.log(theme.info("💡 Place personas in:"));
          console.log(`   • ${theme.muted(personaDir)}`);
          console.log(theme.muted(`   (${configSource})`));

          return;
        }

        // Get current active persona
        let activePersonaName: string | undefined;
        try {
          const manager = await initializePersonaManager();
          const activePersona = manager.getActivePersona();
          if (activePersona) {
            activePersonaName = activePersona.persona.config.name;
          }
        } catch {
          // If we can't get active persona, that's OK - we'll just not show active status
        }

        // Display summary
        const validPersonas = discoveryResult.personas.filter(
          (p) => p.isValid
        ).length;
        const invalidPersonas = discoveryResult.personas.length - validPersonas;

        console.log(theme.success("📊 Persona Discovery Summary"));
        console.log(
          `   ${theme.label("Total Found:")} ${discoveryResult.personas.length}`
        );
        console.log(`   ${theme.label("Valid:")} ${validPersonas}`);
        if (invalidPersonas > 0) {
          console.log(`   ${theme.label("Invalid:")} ${invalidPersonas}`);
        }
        console.log(
          `   ${theme.label("Displayed:")} ${filteredPersonas.length}`
        );
        if (activePersonaName) {
          console.log(`   ${theme.label("Active:")} ${activePersonaName}`);
        }
        console.log();

        // Load enhanced persona information
        console.log(theme.info("📦 Available Personas"));
        console.log(theme.muted("     (* = default toolset, numbers in parentheses = tool count)"));
        console.log();
        
        const enhancedPersonas = await Promise.all(
          filteredPersonas.map(persona => loadEnhancedPersonaInfo(persona, activePersonaName))
        );

        // Display enhanced personas
        for (const persona of enhancedPersonas) {
          console.log(formatEnhancedPersonaReference(persona));

          if (!persona.isValid && persona.issues && persona.issues.length > 0) {
            console.log(theme.error("       Issues:"));
            for (const issue of persona.issues) {
              console.log(`         • ${theme.error(issue)}`);
            }
          }
          console.log(); // Extra spacing between personas
        }

        // Show configured persona directory (only if using additional paths)
        if (discoveryResult.searchPaths.length > 1) {
          console.log(theme.info("🔍 Search Paths"));
          for (const path of discoveryResult.searchPaths) {
            console.log(`   • ${theme.muted(path)}`);
          }
        } else {
          const configSource = await getPersonaDirectorySource();
          console.log(theme.info("📍 Persona Directory"));
          console.log(`   • ${theme.muted(discoveryResult.searchPaths[0])}`);
          console.log(theme.muted(`   (${configSource})`));
        }
        console.log();

        console.log(
          theme.info(
            "💡 Use 'hypertool persona activate <name>' to activate a persona"
          )
        );
        console.log(
          theme.info(
            "💡 Use 'hypertool persona inspect <name>' for detailed persona information"
          )
        );
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
    .description("Show detailed information about a specific persona including its MCP configuration")
    .argument("<name>", "Name of the persona to inspect")
    .action(async (name: string) => {
      try {
        console.log(theme.info(`🔍 Inspecting persona "${name}"...`));
        console.log();

        // Discover personas to find the requested one
        const discoveryResult = await discoverPersonas();
        const persona = discoveryResult.personas.find(p => p.name === name);

        if (!persona) {
          console.error(semantic.messageError(`❌ Persona "${name}" not found`));
          console.log();
          console.log(theme.info("💡 Available personas:"));
          for (const p of discoveryResult.personas.filter(p => p.isValid)) {
            console.log(`   • ${p.name}`);
          }
          process.exit(1);
        }

        // Load the persona to get detailed information
        const loader = new PersonaLoader();
        const loadResult = await loader.loadPersonaFromReference(persona);

        if (!loadResult.success) {
          console.error(semantic.messageError(`❌ Failed to load persona "${name}":`));
          if (loadResult.errors && loadResult.errors.length > 0) {
            for (const error of loadResult.errors) {
              console.error(`   • ${theme.error(error)}`);
            }
          }
          process.exit(1);
        }

        const loadedPersona = loadResult.persona;
        if (!loadedPersona) {
          console.error(semantic.messageError(`❌ No persona data loaded for "${name}"`));
          process.exit(1);
        }

        // Display basic persona information
        console.log(theme.success(`📋 Persona Details: ${name}`));
        console.log();
        console.log(`   ${theme.label("Name:")} ${loadedPersona.config.name}`);
        console.log(`   ${theme.label("Description:")} ${loadedPersona.config.description || theme.muted("No description")}`);
        console.log(`   ${theme.label("Version:")} ${loadedPersona.config.version || theme.muted("Not specified")}`);
        console.log(`   ${theme.label("Path:")} ${loadedPersona.sourcePath}`);
        console.log(`   ${theme.label("Valid:")} ${persona.isValid ? theme.success("✓ Yes") : theme.error("✗ No")}`);

        if (loadedPersona.config.metadata) {
          const metadata = loadedPersona.config.metadata;
          console.log();
          console.log(theme.info("📊 Metadata:"));
          if (metadata.author) console.log(`   ${theme.label("Author:")} ${metadata.author}`);
          if (metadata.created) console.log(`   ${theme.label("Created:")} ${metadata.created}`);
          if (metadata.lastModified) console.log(`   ${theme.label("Last Modified:")} ${metadata.lastModified}`);
          if (metadata.tags && metadata.tags.length > 0) {
            console.log(`   ${theme.label("Tags:")} ${metadata.tags.join(", ")}`);
          }
        }

        // Display toolsets
        if (loadedPersona.config.toolsets && loadedPersona.config.toolsets.length > 0) {
          console.log();
          console.log(theme.info("🔧 Toolsets:"));
          for (const toolset of loadedPersona.config.toolsets) {
            const isDefault = toolset.name === loadedPersona.config.defaultToolset;
            const marker = isDefault ? theme.success(" (default)") : "";
            console.log(`   • ${theme.info(toolset.name)}${marker} - ${toolset.toolIds.length} tools`);
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
            console.log(`   ${theme.label("Servers:")} ${Object.keys(loadedPersona.mcpConfig.mcpServers).length} configured`);
            console.log();
            console.log("   MCP Server Configurations:");
            for (const [serverName, serverConfig] of Object.entries(loadedPersona.mcpConfig.mcpServers)) {
              console.log(`     • ${theme.info(serverName)}`);
              console.log(`       Command: ${theme.muted(JSON.stringify(serverConfig))}`);
            }
          }
          
          console.log();
          console.log(theme.info("📄 Complete MCP Configuration:"));
          console.log(JSON.stringify(loadedPersona.mcpConfig, null, 2));
        } else {
          console.log();
          console.log(theme.warning("⚠️  No MCP configuration found"));
          console.log(`   ${theme.muted("Expected at:")} ${loadedPersona.sourcePath}/mcp.json`);
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
        console.log(theme.info("💡 Use 'hypertool persona activate " + name + "' to activate this persona"));
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
${theme.label("Persona Directory:")}
  ${theme.muted("Personas are stored in:")}
  ${theme.muted("  1. $HYPERTOOL_PERSONA_DIR (environment variable)")}
  ${theme.muted("  2. ~/.toolprint/hypertool-mcp/personas (default)")}
  ${theme.muted("  3. config.json personaDir setting")}

${theme.label("Available Commands:")}
  ${theme.muted("list       List all available personas with details")}
  ${theme.muted("inspect    Show detailed information about a specific persona")}
  ${theme.muted("add        Install persona from folder or .htp archive")}
  ${theme.muted("activate   Activate a persona and optionally a toolset")}
  ${theme.muted("validate   Validate persona structure and configuration")}
  ${theme.muted("status     Show currently active persona information")}
  ${theme.muted("deactivate Deactivate the current persona")}

${theme.label("Examples:")}
  ${theme.muted("hypertool persona list                    # List all available personas")}
  ${theme.muted("hypertool persona list --include-invalid  # Include invalid personas")}
  ${theme.muted("hypertool persona inspect frontend        # Show detailed info about persona")}
  ${theme.muted("hypertool persona add ./my-persona        # Install persona from folder")}
  ${theme.muted("hypertool persona add ./persona.htp       # Install persona from archive")}
  ${theme.muted("hypertool persona activate frontend       # Activate 'frontend' persona")}
  ${theme.muted("hypertool persona activate backend --toolset api  # Activate with specific toolset")}
  ${theme.muted("hypertool persona validate ./my-persona   # Validate persona at path")}
  ${theme.muted("hypertool persona status                  # Show current active persona")}
  ${theme.muted("hypertool persona deactivate              # Deactivate current persona")}`
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
