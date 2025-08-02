/**
 * CLI command for unlinking applications from HyperTool
 */

import { Command } from "commander";
import inquirer from "inquirer";
import { semantic } from "../../utils/theme.js";
import { ConfigurationManager } from "../index.js";
import { output } from "../../utils/output.js";
import { isNedbEnabled } from "../../config/environment.js";

/**
 * Get human-readable time ago string
 */
function getTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMinutes < 1) {
    return "just now";
  } else if (diffMinutes < 60) {
    return `${diffMinutes} minute${diffMinutes === 1 ? "" : "s"} ago`;
  } else if (diffHours < 24) {
    return `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;
  } else if (diffDays < 7) {
    return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
  } else {
    const diffWeeks = Math.floor(diffDays / 7);
    return `${diffWeeks} week${diffWeeks === 1 ? "" : "s"} ago`;
  }
}

export function createUnlinkCommand(): Command {
  const unlink = new Command("unlink");

  unlink
    .description(
      "Unlink applications from HyperTool and optionally restore previous configurations"
    )
    .option("--all", "Unlink all applications")
    .option("--app <appId>", "Unlink specific application only")
    .option("--force", "Skip confirmation prompts")
    .option("--no-restore", "Remove HyperTool without restoring from backup")
    .action(async (options) => {
      try {
        const configManager = new ConfigurationManager();
        await configManager.initialize();

        // Get available applications
        const registry = (configManager as any).registry;
        const apps = await registry.getEnabledApplications();
        const appIds = Object.keys(apps);

        // Determine which apps to unlink
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
        } else if (options.all) {
          // Unlink all apps
          selectedApps = appIds;
        } else {
          // Interactive selection
          const { selected } = await inquirer.prompt([
            {
              type: "checkbox",
              name: "selected",
              message: "Select applications to unlink from HyperTool:",
              choices: appIds.map((id) => ({
                name: `${apps[id].name} (${id})`,
                value: id,
                checked: false,
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

        // Check for available backups if restore is enabled
        let useBackup = false;
        let selectedBackup: any = null;

        if (!options.noRestore) {
          const backups = await configManager.listBackups();
          if (backups.length > 0) {
            // Show latest backup info
            const latestBackup = backups[0];
            const backupDate = new Date(latestBackup.timestamp);
            const timeAgo = getTimeAgo(backupDate);
            const appCount = Object.keys(
              latestBackup.metadata.applications
            ).length;

            output.displaySubHeader("📋 Available backup for restoration:");
            output.displayInstruction(
              `• Backup from: ${backupDate.toLocaleString()}`
            );
            output.displayInstruction(
              `• Contains: ${latestBackup.metadata.total_servers} servers from ${appCount} applications`
            );
            output.displayInstruction(`• Created: ${timeAgo}`);
            output.displaySpaceBuffer(1);

            if (!options.force) {
              const { confirmRestore } = await inquirer.prompt([
                {
                  type: "confirm",
                  name: "confirmRestore",
                  message:
                    "Would you like to restore configurations from this backup?",
                  default: true,
                },
              ]);
              useBackup = confirmRestore;
              if (useBackup) {
                selectedBackup = latestBackup;
              }
            } else {
              // In force mode, default to using backup
              useBackup = true;
              selectedBackup = latestBackup;
            }
          } else {
            output.warn(
              "⚠️  No backups available. HyperTool will be removed without restoration."
            );
          }
        }

        // Show what will be done
        output.displaySubHeader("This will:");
        output.displayInstruction(
          `1. Remove HyperTool proxy from: ${selectedApps.map((id) => apps[id].name).join(", ")}`
        );
        if (useBackup) {
          output.displayInstruction(
            "2. Restore previous MCP configurations from backup"
          );
          output.displayInstruction(
            "3. If restored config contains HyperTool, remove only HyperTool entry"
          );
        } else {
          output.displayInstruction(
            "2. Leave MCP configuration empty (no restoration)"
          );
        }
        output.displayInstruction(
          `${useBackup ? "4" : "3"}. Keep your backup files for future reference`
        );
        output.displaySpaceBuffer(1);

        // Confirm unless forced
        if (!options.force) {
          const appNames = selectedApps.map((id) => apps[id].name).join(", ");
          const { confirm } = await inquirer.prompt([
            {
              type: "confirm",
              name: "confirm",
              message: semantic.messageError(
                `⚠️  Are you sure you want to unlink ${appNames} from HyperTool?`
              ),
              default: false,
            },
          ]);

          if (!confirm) {
            output.info("Unlink cancelled.");
            return;
          }
        }

        output.info("🔄 Unlinking applications from HyperTool...");

        // Perform the unlink operation
        const result = await configManager.unlinkApplications(selectedApps, {
          restore: useBackup,
          backupId: selectedBackup?.id,
        });

        output.displaySpaceBuffer(1);
        output.success("✅ Applications unlinked successfully!");

        if (
          result.restoredWithHypertool &&
          result.restoredWithHypertool.length > 0
        ) {
          output.displaySpaceBuffer(1);
          output.warn(
            "⚠️  The following applications had HyperTool in their backup:"
          );
          for (const appId of result.restoredWithHypertool) {
            output.displayInstruction(
              `• ${apps[appId].name}: HyperTool entry removed, other servers preserved`
            );
          }
        }

        output.displaySpaceBuffer(1);
        output.displaySubHeader("📋 Post-unlink notes:");
        output.displayInstruction(
          "• Restart affected applications to apply changes"
        );
        output.displayInstruction(
          "• Your backup files remain in ~/.toolprint/hypertool-mcp/backups/"
        );
        if (useBackup) {
          const backups = await configManager.listBackups();
          if (backups.length > 1) {
            output.displayInstruction(
              '• Use "hypertool-mcp config restore" to restore older backups if needed'
            );
          }
        }
        output.displayInstruction(
          '• You can re-link applications at any time with "hypertool-mcp config link"'
        );

        // Show database mode information if enabled
        if (isNedbEnabled()) {
          output.displaySpaceBuffer(1);
          output.info("📊 Database Mode: ENABLED");
          output.displayInstruction(
            "   Server configurations remain in the database after unlinking"
          );
          output.displayInstruction(
            "   Use 'hypertool-mcp config show servers' to manage database entries"
          );
        }
      } catch (error) {
        output.error("❌ Unlink failed:");
        output.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });

  return unlink;
}
