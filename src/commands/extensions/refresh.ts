/**
 * Refresh Extensions Command
 */

import { Command } from "commander";
import { ExtensionManager } from "../../extensions/index.js";

export function extensionsRefresh(): Command {
  return new Command("refresh")
    .description("Refresh all extensions (re-unpack if source files are newer)")
    .option("--config <path>", "Path to configuration file")
    .option("--extensions-dir <path>", "Path to extensions directory")
    .action(async (options) => {
      try {
        const extensionManager = new ExtensionManager(
          options.config,
          options.extensionsDir
        );

        await extensionManager.initialize();

        console.log("Refreshing extensions...");
        await extensionManager.refreshExtensions();

        const extensions = extensionManager.listExtensions();

        console.log(`✓ Refreshed ${extensions.length} extensions`);

        // Show any validation issues
        const invalid = extensions.filter((e) => e.enabled && !e.valid);
        if (invalid.length > 0) {
          console.log();
          console.warn(
            `⚠ ${invalid.length} extension(s) have configuration issues:`
          );
          invalid.forEach((ext) => {
            console.warn(`  - ${ext.name}: ${ext.errors.join(", ")}`);
          });
        }

        const enabled = extensions.filter((e) => e.enabled && e.valid).length;
        const disabled = extensions.filter((e) => !e.enabled).length;

        console.log();
        console.log(
          `Summary: ${enabled} enabled, ${disabled} disabled, ${invalid.length} invalid`
        );
      } catch (error) {
        console.error(
          `Failed to refresh extensions: ${(error as Error).message}`
        );
        process.exit(1);
      }
    });
}
