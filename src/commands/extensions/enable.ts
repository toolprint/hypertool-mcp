/**
 * Enable Extension Command
 */

import { Command } from "commander";
import { ExtensionManager } from "../../extensions/index.js";

export function extensionsEnable(): Command {
  return new Command("enable")
    .description("Enable an extension")
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

        if (ext.enabled) {
          console.log(`Extension '${extensionName}' is already enabled.`);
          return;
        }

        await extensionManager.enableExtension(extensionName);
        console.log(`✓ Extension '${extensionName}' enabled`);

        // Check validation status
        const updatedExt = extensionManager.getExtensionConfig(extensionName);
        if (updatedExt && !updatedExt.validationResult.isValid) {
          console.log();
          console.warn(
            `⚠ Extension has configuration issues and will not run:`
          );
          updatedExt.validationResult.errors.forEach((error) =>
            console.warn(`  - ${error}`)
          );
          console.log();
          console.log(
            `Run 'hypertool extensions config ${extensionName} --suggest' for help.`
          );
        }
      } catch (error) {
        console.error(
          `Failed to enable extension: ${(error as Error).message}`
        );
        process.exit(1);
      }
    });
}
