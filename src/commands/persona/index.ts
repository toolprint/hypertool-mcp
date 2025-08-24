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
  PersonaManager,
  type PersonaManagerConfig,
} from "../../persona/manager.js";
import { discoverPersonas } from "../../persona/discovery.js";
import { PersonaLoader } from "../../persona/loader.js";
import { validatePersona } from "../../persona/validator.js";
import type { PersonaReference, LoadedPersona } from "../../persona/types.js";
import { isPersonaError } from "../../persona/errors.js";

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
 * Format persona reference for display
 */
function formatPersonaReference(persona: {
  name: string;
  description?: string;
  path: string;
  isValid: boolean;
  isArchive: boolean;
  toolsetCount?: number;
}): string {
  const status = persona.isValid ? theme.success("✓") : theme.error("✗");
  const type = persona.isArchive
    ? theme.muted("[archive]")
    : theme.muted("[folder]");
  const description = persona.description
    ? ` - ${theme.muted(persona.description)}`
    : "";
  const toolsets = persona.toolsetCount
    ? ` (${persona.toolsetCount} toolsets)`
    : "";

  return `${status} ${theme.info(persona.name)} ${type}${toolsets}${description}`;
}

/**
 * Create list subcommand
 */
export function createListCommand(): Command {
  return new Command("list")
    .description(
      "List available personas with their validation status and metadata"
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
          console.log(theme.info("💡 Place personas in these search paths:"));
          for (const path of discoveryResult.searchPaths) {
            console.log(`   • ${theme.muted(path)}`);
          }
          return;
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
        console.log();

        // Display personas
        console.log(theme.info("📦 Available Personas"));
        for (const persona of filteredPersonas) {
          console.log(`   ${formatPersonaReference(persona)}`);

          if (!persona.isValid && persona.issues && persona.issues.length > 0) {
            console.log(theme.error("     Issues:"));
            for (const issue of persona.issues) {
              console.log(`       • ${theme.error(issue)}`);
            }
          }
        }
        console.log();

        // Show search paths
        console.log(theme.info("🔍 Search Paths"));
        for (const path of discoveryResult.searchPaths) {
          console.log(`   • ${theme.muted(path)}`);
        }
        console.log();

        console.log(
          theme.info(
            "💡 Use 'hypertool persona activate <name>' to activate a persona"
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
          console.log(theme.muted(`   Discovered ${stats.discoveredCount} personas`));
        } else {
          console.log(theme.warning(`   ⚠️  No personas discovered - this may cause activation to fail`));
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
${theme.label("Examples:")}
  ${theme.muted("hypertool persona list                    # List all available personas")}
  ${theme.muted("hypertool persona list --include-invalid  # Include invalid personas")}
  ${theme.muted("hypertool persona activate frontend       # Activate 'frontend' persona")}
  ${theme.muted("hypertool persona activate backend --toolset api  # Activate with specific toolset")}
  ${theme.muted("hypertool persona validate ./my-persona   # Validate persona at path")}
  ${theme.muted("hypertool persona status                  # Show current active persona")}
  ${theme.muted("hypertool persona deactivate              # Deactivate current persona")}`
    );

  // Add all subcommands
  personaCommand.addCommand(createListCommand());
  personaCommand.addCommand(createActivateCommand());
  personaCommand.addCommand(createValidateCommand());
  personaCommand.addCommand(createStatusCommand());
  personaCommand.addCommand(createDeactivateCommand());

  return personaCommand;
}
