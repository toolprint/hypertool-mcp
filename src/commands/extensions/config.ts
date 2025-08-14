/**
 * Extension Configuration Command
 */

import { Command } from "commander";
import { ExtensionManager } from "../../extensions/index.js";

export function extensionsConfig(): Command {
  return new Command("config")
    .description("Show or update extension configuration")
    .argument("<extension>", "Extension name")
    .option("--config <path>", "Path to configuration file")
    .option("--extensions-dir <path>", "Path to extensions directory")
    .option("--set <key=value...>", "Set configuration values")
    .option("--report", "Show detailed validation report")
    .option(
      "--suggest",
      "Show configuration suggestions for invalid extensions"
    )
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

        // Set configuration if provided
        if (options.set) {
          const updates: Record<string, any> = {};

          for (const pair of options.set) {
            const [key, ...valueParts] = pair.split("=");
            const value = valueParts.join("=");

            if (!key || !value) {
              console.error(`Invalid key=value pair: ${pair}`);
              process.exit(1);
            }

            // Try to parse as JSON, fallback to string
            try {
              updates[key] = JSON.parse(value);
            } catch {
              updates[key] = value;
            }
          }

          console.log(`Updating configuration for '${extensionName}'...`);
          const validationResult =
            await extensionManager.updateExtensionUserConfig(
              extensionName,
              updates
            );

          if (validationResult.isValid) {
            console.log("Configuration updated successfully.");
          } else {
            console.error("Configuration validation failed:");
            validationResult.errors.forEach((error) =>
              console.error(`  - ${error}`)
            );
            process.exit(1);
          }
        }

        // Show configuration report
        if (options.report) {
          const report = extensionManager.getValidationReport(extensionName);
          if (report) {
            console.log(report);
          }
        } else {
          // Show basic configuration info
          console.log(`Configuration for ${extensionName}:`);
          console.log(`  Version: ${ext.manifest.version}`);
          console.log(`  Enabled: ${ext.enabled}`);
          console.log(`  Valid: ${ext.validationResult.isValid}`);

          if (ext.manifest.description) {
            console.log(`  Description: ${ext.manifest.description}`);
          }

          if (ext.manifest.user_config) {
            console.log();
            console.log("Available Parameters:");

            Object.entries(ext.manifest.user_config).forEach(([key, param]) => {
              const required = param.required ? " (required)" : "";
              const multiple = param.multiple ? " (multiple)" : "";
              const range =
                param.type === "number" && (param.min || param.max)
                  ? ` (${param.min || "min"}-${param.max || "max"})`
                  : "";

              console.log(
                `  ${key}: ${param.type}${required}${multiple}${range}`
              );
              if (param.description) {
                console.log(`    ${param.description}`);
              }
              if (param.default !== undefined) {
                console.log(`    Default: ${JSON.stringify(param.default)}`);
              }
            });
          }

          if (!ext.validationResult.isValid) {
            console.log();
            console.log("Validation Errors:");
            ext.validationResult.errors.forEach((error) =>
              console.log(`  - ${error}`)
            );
          }

          if (ext.validationResult.warnings.length > 0) {
            console.log();
            console.log("Warnings:");
            ext.validationResult.warnings.forEach((warning) =>
              console.log(`  - ${warning}`)
            );
          }
        }

        // Show suggestions for invalid extensions
        if (options.suggest && !ext.validationResult.isValid) {
          console.log();
          console.log("Configuration Suggestions:");
          const suggestions =
            extensionManager.getConfigSuggestions(extensionName);
          suggestions.forEach((suggestion) => console.log(suggestion));
        }
      } catch (error) {
        console.error(
          `Failed to manage extension configuration: ${(error as Error).message}`
        );
        process.exit(1);
      }
    });
}
