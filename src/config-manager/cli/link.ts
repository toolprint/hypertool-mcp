/**
 * CLI command for linking applications to HyperTool
 */

import { Command } from "commander";
import inquirer from "inquirer";
import { theme } from "../../utils/theme.js";
import { ConfigurationManager } from "../index.js";
import { output } from "../../utils/output.js";

export function createLinkCommand(): Command {
  const link = new Command("link");

  link
    .description(
      "Link applications to HyperTool by installing it in their configuration"
    )
    .option("--all", "Link all supported applications (default)")
    .option("--app <appId>", "Link specific application only")
    .option("--dry-run", "Show what would be linked without making changes")
    .action(async (options) => {
      try {
        const configManager = new ConfigurationManager();
        await configManager.initialize();

        // Get available applications
        const registry = (configManager as any).registry;
        const apps = await registry.getEnabledApplications();
        const appIds = Object.keys(apps);

        // Determine which apps to link
        let selectedApps: string[] = [];

        if (options.app) {
          // Specific app requested
          if (!appIds.includes(options.app)) {
            output.error(
              `❌ Application '${options.app}' not found or not supported.`
            );
            output.info(`Available applications: ${appIds.join(", ")}`);
            process.exit(1);
          }
          selectedApps = [options.app];
        } else if (options.all || (!options.all && appIds.length > 0)) {
          // Default to all if --all specified or no specific app requested
          selectedApps = appIds;
        }

        // If no --all flag and no specific app, show interactive selection
        if (!options.all && !options.app && appIds.length > 1) {
          const { selected } = await inquirer.prompt([
            {
              type: "checkbox",
              name: "selected",
              message: "Select applications to link to HyperTool:",
              choices: appIds.map((id) => ({
                name: `${apps[id].name} (${id})`,
                value: id,
                checked: true,
              })),
              validate: (answer) => {
                if (answer.length < 1) {
                  return "You must select at least one application.";
                }
                return true;
              },
            },
          ]);
          selectedApps = selected;
        }

        if (options.dryRun) {
          output.info(theme.info("🔍 [DRY RUN MODE] - Showing linking plan"));
          output.displaySpaceBuffer(1);

          output.displaySubHeader("Would link HyperTool to:");
          for (const appId of selectedApps) {
            const appDef = apps[appId] as any;
            const installed = await registry.isApplicationInstalled(appDef);
            if (installed) {
              const platformConfig = registry.getPlatformConfig(appDef);
              if (platformConfig) {
                const configPath = registry.resolvePath(
                  platformConfig.configPath
                );
                output.displayInstruction(`• ${appDef.name}: ${configPath}`);
              }
            }
          }

          output.displaySpaceBuffer(1);
          output.info("No actual changes made in dry-run mode.");
          return;
        }

        // Confirm linking
        const appNames = selectedApps.map((id) => apps[id].name).join(", ");
        const { confirm } = await inquirer.prompt([
          {
            type: "confirm",
            name: "confirm",
            message: theme.warning(`Link HyperTool to ${appNames}?`),
            default: true,
          },
        ]);

        if (!confirm) {
          output.info("Linking cancelled.");
          return;
        }

        output.info("🔗 Linking applications to HyperTool...");

        const result = await configManager.linkApplications(selectedApps);

        output.displaySpaceBuffer(1);
        output.success("✅ Linking complete!");
        output.displaySpaceBuffer(1);

        output.displaySubHeader("📊 Link Summary:");
        if (result.linked.length > 0) {
          output.success(`✅ Linked: ${result.linked.join(", ")}`);
        }
        if (result.failed.length > 0) {
          output.warn(`❌ Failed: ${result.failed.join(", ")}`);
        }

        output.displaySpaceBuffer(1);
        output.displaySubHeader("🔄 Next steps:");
        output.displayInstruction("1. Restart affected applications");
        output.displayInstruction(
          "2. Your MCP tools are now proxied through HyperTool"
        );
      } catch (error) {
        output.error("❌ Linking failed:");
        output.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });

  return link;
}
