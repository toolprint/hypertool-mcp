/**
 * Setup command - Modern setup and configuration experience
 */

import { Command } from "commander";
import { SetupWizard, SetupCancelledException } from "./setup.js";
import { theme } from "../../utils/theme.js";

export function createSetupCommand(): Command {
  const setupCommand = new Command("setup")
    .description("Interactive setup wizard for Hypertool MCP")
    .option("-y, --yes", "Accept all defaults (non-interactive mode)")
    .option("--dry-run", "Preview changes without making them")
    .option(
      "--apps <apps>",
      "Comma-separated list of apps to configure (claude-desktop,cursor,claude-code)"
    )
    .option(
      "--import-all",
      "Import all existing configurations (default in non-interactive)"
    )
    .option("--import-none", "Start fresh without importing existing configs")
    .option("--standard", "Use standard installation type (default)")
    .option("--development", "Use development installation type")
    .option("--skip-toolsets", "Skip toolset creation")
    .option("--verbose", "Show detailed output")
    .option(
      "--example <name>",
      "Use specific example configuration (everything, development, etc.)"
    )
    .option("--list-examples", "List available example configurations")
    .option("--experimental", "Enable all experimental features")
    .action(async (options) => {
      // Handle --list-examples first
      if (options.listExamples) {
        const { EXAMPLE_CONFIGS } = await import("../steps/exampleConfigs.js");
        const { output } = await import("../../utils/output.js");

        output.displaySpaceBuffer(1);
        output.displayHeader("Available Example Configurations");
        output.displaySpaceBuffer(1);

        for (const example of EXAMPLE_CONFIGS) {
          console.log(theme.label(example.name));
          console.log(`  ID: ${theme.value(example.id)}`);
          console.log(`  ${example.description}`);
          console.log(
            `  Servers: ${theme.value(example.serverCount.toString())}`
          );
          if (example.requiresSecrets) {
            console.log(`  ${theme.warning("⚠️  Requires API keys")}`);
          }
          console.log();
        }

        process.exit(0);
      }

      try {
        const setupOptions = {
          yes: options.yes,
          dryRun: options.dryRun,
          apps: options.apps?.split(",").map((app: string) => app.trim()),
          importAll: options.importNone ? false : (options.importAll ?? true),
          standard: options.development ? false : (options.standard ?? true),
          development: options.development,
          skipToolsets: options.skipToolsets,
          verbose: options.verbose,
          example: options.example,
          listExamples: options.listExamples,
          experimental: options.experimental,
        };

        const wizard = new SetupWizard(setupOptions);
        await wizard.run();

        // Setup completed successfully - exit cleanly only if not in test
        if (!process.env.NODE_ENV?.includes("test")) {
          process.exit(0);
        }
      } catch (error) {
        if (error instanceof SetupCancelledException) {
          // User cancelled - exit cleanly only if not in test
          if (!process.env.NODE_ENV?.includes("test")) {
            process.exit(0);
          }
          return;
        }

        console.error(theme.error("Setup failed:"), error);
        if (!process.env.NODE_ENV?.includes("test")) {
          process.exit(1);
        }
        throw error; // Re-throw for tests
      }
    });

  return setupCommand;
}

// Keep the old function for backward compatibility but mark as deprecated
export function createVibeCommand(): Command {
  const vibeCommand = new Command("vibe").description(
    "[DEPRECATED] Use top-level commands directly"
  );

  // Add a deprecation notice
  vibeCommand.action(() => {
    console.log(
      theme.warning('⚠️  The "vibe" command namespace is deprecated.')
    );
    console.log(theme.info("   Use commands directly: hypertool-mcp setup"));
  });

  return vibeCommand;
}
