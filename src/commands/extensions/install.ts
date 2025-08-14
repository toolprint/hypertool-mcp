/**
 * Install Extension Command
 */

import { Command } from "commander";
import { ExtensionManager } from "../../extensions/index.js";
import { existsSync } from "fs";
import { resolve } from "path";

export function extensionsInstall(): Command {
  return new Command("install")
    .description("Install an extension from a .dxt file")
    .argument("<dxt-file>", "Path to .dxt file")
    .option("--config <path>", "Path to configuration file")
    .option("--extensions-dir <path>", "Path to extensions directory")
    .option("--enable", "Enable the extension after installation", true)
    .action(async (dxtFile: string, options) => {
      try {
        // Validate DXT file exists
        const dxtPath = resolve(dxtFile);
        if (!existsSync(dxtPath)) {
          console.error(`DXT file not found: ${dxtFile}`);
          process.exit(1);
        }

        if (!dxtPath.endsWith(".dxt")) {
          console.error(`File must have .dxt extension: ${dxtFile}`);
          process.exit(1);
        }

        const extensionManager = new ExtensionManager(
          options.config,
          options.extensionsDir
        );

        await extensionManager.initialize();

        console.log(`Installing extension from ${dxtFile}...`);
        const result = await extensionManager.installExtension(dxtPath);

        if (result.success) {
          console.log(`✓ ${result.message}`);

          // Enable the extension if requested
          if (options.enable && result.name) {
            console.log(`Enabling extension '${result.name}'...`);
            await extensionManager.enableExtension(result.name);
            console.log(`✓ Extension '${result.name}' enabled`);

            // Show validation status
            const ext = extensionManager.getExtensionConfig(result.name);
            if (ext && !ext.validationResult.isValid) {
              console.log();
              console.warn(`⚠ Extension has configuration issues:`);
              ext.validationResult.errors.forEach((error) =>
                console.warn(`  - ${error}`)
              );
              console.log();
              console.log(
                `Run 'hypertool extensions config ${result.name} --suggest' for help.`
              );
            }
          }
        } else {
          console.error(`✗ ${result.message}`);
          process.exit(1);
        }
      } catch (error) {
        console.error(
          `Failed to install extension: ${(error as Error).message}`
        );
        process.exit(1);
      }
    });
}
