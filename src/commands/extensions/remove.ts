/**
 * Remove Extension Command
 */

import { Command } from "commander";
import { ExtensionManager } from "../../extensions/index.js";

export function extensionsRemove(): Command {
  return new Command("remove")
    .description(
      "Remove an extension configuration (does not delete the .dxt file)"
    )
    .argument("<extension>", "Extension name")
    .option("--config <path>", "Path to configuration file")
    .option("--extensions-dir <path>", "Path to extensions directory")
    .option("--force", "Skip confirmation prompt")
    .action(async (extensionName: string, options) => {
      try {
        const extensionManager = new ExtensionManager(
          options.config,
          options.extensionsDir
        );

        await extensionManager.initialize();

        const ext = extensionManager.getExtensionConfig(extensionName);
        if (!ext) {
          console.error(`Extension '${extensionName}' not found.`);
          process.exit(1);
        }

        // Confirmation prompt unless --force
        if (!options.force) {
          console.log(
            `This will remove the configuration for extension '${extensionName}'.`
          );
          console.log("The .dxt file and installed files will remain.");
          console.log("The extension will be rediscovered on next startup.");

          // Simple confirmation (in a real implementation, you'd use a proper prompt library)
          const readline = await import("readline");
          const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
          });

          const answer = await new Promise<string>((resolve) => {
            rl.question("Continue? (y/N): ", resolve);
          });

          rl.close();

          if (answer.toLowerCase() !== "y" && answer.toLowerCase() !== "yes") {
            console.log("Cancelled.");
            return;
          }
        }

        await extensionManager.removeExtension(extensionName);
        console.log(`✓ Extension '${extensionName}' configuration removed`);
      } catch (error) {
        console.error(
          `Failed to remove extension: ${(error as Error).message}`
        );
        process.exit(1);
      }
    });
}
