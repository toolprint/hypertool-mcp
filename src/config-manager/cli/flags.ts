/**
 * Simple CLI commands for managing feature flags
 */

import { Command } from "commander";
import {
  getFeatureFlags,
  setFeatureFlag,
} from "../../config/preferenceStore.js";
import { getFeatureFlagService } from "../../config/featureFlagService.js";

// Hardcoded flag definitions for simplicity
const KNOWN_FLAGS = {
  nedbEnabled: {
    name: "nedbEnabled",
    description:
      "Use NeDB database storage instead of file-based configuration",
  },
  mcpLoggerEnabled: {
    name: "mcpLoggerEnabled",
    description: "Use experimental mcp-logger instead of default Pino logging",
  },
  setupWizardEnabled: {
    name: "setupWizardEnabled",
    description: "Enable interactive setup wizard on first run (default: disabled)",
  },
} as const;

type FlagName = keyof typeof KNOWN_FLAGS;

/**
 * Validate that a flag name is known
 */
function validateFlagName(flagName: string): flagName is FlagName {
  return flagName in KNOWN_FLAGS;
}

/**
 * List all feature flags with their current status
 */
async function listFlags(): Promise<void> {
  try {
    // Use the full feature flag service for complete resolution
    const featureFlagService = getFeatureFlagService();
    await featureFlagService.initialize();
    const resolvedFlags = featureFlagService.getAllFlags();

    console.log("\nFeature Flags:");
    console.log("─".repeat(70));
    console.log("Flag".padEnd(20) + "Status".padEnd(10) + "Description");
    console.log("─".repeat(70));

    for (const [flagName, flagInfo] of Object.entries(KNOWN_FLAGS)) {
      const isEnabled = resolvedFlags[flagName as keyof typeof resolvedFlags] === true;
      const status = isEnabled ? "✓ ON" : "✗ OFF";
      console.log(
        flagName.padEnd(20) + status.padEnd(10) + flagInfo.description
      );
    }

    console.log("─".repeat(70));
    console.log(`\nTotal flags: ${Object.keys(KNOWN_FLAGS).length}`);
  } catch (error) {
    console.error(
      "Error reading feature flags:",
      error instanceof Error ? error.message : error
    );
    process.exit(1);
  }
}

/**
 * Enable a specific feature flag
 */
async function enableFlag(flagName: string): Promise<void> {
  if (!validateFlagName(flagName)) {
    console.error(`Error: Unknown flag '${flagName}'`);
    console.error(`Available flags: ${Object.keys(KNOWN_FLAGS).join(", ")}`);
    process.exit(1);
  }

  try {
    await setFeatureFlag(flagName, true);
    console.log(`✓ Flag '${flagName}' enabled successfully`);
  } catch (error) {
    console.error(
      `Error enabling flag '${flagName}':`,
      error instanceof Error ? error.message : error
    );
    process.exit(1);
  }
}

/**
 * Disable a specific feature flag
 */
async function disableFlag(flagName: string): Promise<void> {
  if (!validateFlagName(flagName)) {
    console.error(`Error: Unknown flag '${flagName}'`);
    console.error(`Available flags: ${Object.keys(KNOWN_FLAGS).join(", ")}`);
    process.exit(1);
  }

  try {
    await setFeatureFlag(flagName, false);
    console.log(`✓ Flag '${flagName}' disabled successfully`);
  } catch (error) {
    console.error(
      `Error disabling flag '${flagName}':`,
      error instanceof Error ? error.message : error
    );
    process.exit(1);
  }
}

/**
 * Create the flags command
 */
export function createFlagsCommand(): Command {
  const flags = new Command("flags");

  flags.description("Manage experimental feature flags").action(listFlags); // Default action is to list flags

  // List subcommand (explicit)
  flags
    .command("list")
    .alias("ls")
    .description("Show all feature flags and their status")
    .action(listFlags);

  // Enable subcommand
  flags
    .command("enable")
    .alias("on")
    .description("Enable a specific feature flag")
    .argument("<flag>", "Name of the flag to enable")
    .action(enableFlag);

  // Disable subcommand
  flags
    .command("disable")
    .alias("off")
    .description("Disable a specific feature flag")
    .argument("<flag>", "Name of the flag to disable")
    .action(disableFlag);

  return flags;
}
