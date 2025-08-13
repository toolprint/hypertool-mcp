/**
 * Disable Extension Command
 */

import { Command } from "commander";
import { ExtensionManager } from "../../extensions/index.js";

export function extensionsDisable(): Command {
  return new Command("disable")
    .description("Disable an extension")
    .argument("<extension>", "Extension name")
    .option("--config <path>", "Path to configuration file")
    .option("--extensions-dir <path>", "Path to extensions directory")
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

        if (!ext.enabled) {
          console.log(`Extension '${extensionName}' is already disabled.`);
          return;
        }

        await extensionManager.disableExtension(extensionName);
        console.log(`✓ Extension '${extensionName}' disabled`);
      } catch (error) {
        console.error(
          `Failed to disable extension: ${(error as Error).message}`
        );
        process.exit(1);
      }
    });
}
