/**
 * Main Extensions Command
 * Orchestrates all extension management subcommands
 */

import { Command } from "commander";
import { extensionsList } from "./list.js";
import { extensionsConfig } from "./config.js";
import { extensionsInstall } from "./install.js";
import { extensionsRefresh } from "./refresh.js";
import { extensionsEnable } from "./enable.js";
import { extensionsDisable } from "./disable.js";
import { extensionsRemove } from "./remove.js";
import { isDxtEnabledViaService } from "../../config/featureFlagService.js";

export function createExtensionsCommand(): Command {
  const extensionsCommand = new Command("extensions")
    .description("Extension management commands")
    .addHelpText(
      "after",
      `
  Examples:
    hypertool-mcp extensions list              # List all extensions
    hypertool-mcp extensions install test.dxt  # Install DXT extension
    hypertool-mcp extensions config test       # Configure extension
    hypertool-mcp extensions enable test       # Enable extension
    hypertool-mcp extensions disable test      # Disable extension
    hypertool-mcp extensions refresh           # Refresh all extensions
    hypertool-mcp extensions remove test       # Remove extension`
    )
    .hook("preAction", async () => {
      // Check if DXT is enabled before executing any extension command
      if (!(await isDxtEnabledViaService())) {
        console.error("❌ DXT extension features are disabled.");
        console.error(
          "   Set HYPERTOOL_DXT_ENABLED=true or update config.json to enable."
        );
        process.exit(1);
      }
    });

  // Add all subcommands
  extensionsCommand.addCommand(extensionsList());
  extensionsCommand.addCommand(extensionsConfig());
  extensionsCommand.addCommand(extensionsInstall());
  extensionsCommand.addCommand(extensionsRefresh());
  extensionsCommand.addCommand(extensionsEnable());
  extensionsCommand.addCommand(extensionsDisable());
  extensionsCommand.addCommand(extensionsRemove());

  return extensionsCommand;
}
