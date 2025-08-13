/**
 * List Extensions Command
 */

import { Command } from "commander";
import { ExtensionManager } from "../../extensions/index.js";

export function extensionsList(): Command {
  return new Command("list")
    .description("List all available extensions with their status")
    .option("--config <path>", "Path to configuration file")
    .option("--extensions-dir <path>", "Path to extensions directory")
    .option("--verbose", "Show detailed information")
    .action(async (options) => {
      try {
        const extensionManager = new ExtensionManager(
          options.config,
          options.extensionsDir
        );

        await extensionManager.initialize();
        const extensions = extensionManager.listExtensions();

        if (extensions.length === 0) {
          console.log("No extensions found.");
          return;
        }

        console.log("Extensions:");
        console.log();

        for (const ext of extensions) {
          const status = ext.enabled ? (ext.valid ? "✓" : "✗") : "○";
          const statusText = ext.enabled
            ? ext.valid
              ? "[enabled]"
              : "[disabled - invalid]"
            : "[disabled]";

          console.log(`${status} ${ext.name} ${statusText} - v${ext.version}`);

          if (ext.description) {
            console.log(`   ${ext.description}`);
          }

          if (options.verbose || !ext.valid) {
            if (ext.errors.length > 0) {
              console.log(`   Errors: ${ext.errors.join(", ")}`);
            }
            if (ext.warnings.length > 0) {
              console.log(`   Warnings: ${ext.warnings.join(", ")}`);
            }
          }

          console.log();
        }

        // Summary
        const enabled = extensions.filter((e) => e.enabled && e.valid).length;
        const disabled = extensions.filter((e) => !e.enabled).length;
        const invalid = extensions.filter((e) => e.enabled && !e.valid).length;

        console.log(
          `Summary: ${enabled} enabled, ${disabled} disabled, ${invalid} invalid`
        );
      } catch (error) {
        console.error(`Failed to list extensions: ${(error as Error).message}`);
        process.exit(1);
      }
    });
}
