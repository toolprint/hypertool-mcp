/**
 * CLI command for linking applications to HyperTool
 */

import { Command } from "commander";
import inquirer from "inquirer";
import { theme } from "../../utils/theme.js";
import { ConfigurationManager } from "../index.js";
import { output } from "../../utils/output.js";

interface AppLinkConfig {
  appId: string;
  appName: string;
  configType: 'global' | 'per-app';
  perAppInit?: 'empty' | 'copy' | 'import';
}

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

        // Configure each selected app
        const appConfigs: AppLinkConfig[] = [];
        
        // If using flags (non-interactive), use default config type
        if (options.all || options.app) {
          for (const appId of selectedApps) {
            appConfigs.push({
              appId,
              appName: apps[appId].name,
              configType: 'global', // Default to global for non-interactive
            });
          }
        } else {
          // Interactive mode
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

          // Interactive configuration for each selected app
          for (const appId of selectedApps) {
          const appName = apps[appId].name;
          
          output.displaySpaceBuffer(1);
          output.info(theme.label(`Configuring ${appName}:`));
          
          // Ask about config type
          const { configType } = await inquirer.prompt([{
            type: 'list',
            name: 'configType',
            message: `How should ${appName} connect to HyperTool?`,
            choices: [
              {
                name: 'Use global config (shared with all apps)',
                value: 'global'
              },
              {
                name: 'Use per-app config (separate servers for this app)',
                value: 'per-app'
              }
            ],
            default: 'global'
          }]);
          
          let perAppInit: 'empty' | 'copy' | 'import' | undefined;
          
          if (configType === 'per-app') {
            // Check if per-app config already exists
            const { promises: fs } = await import('fs');
            const { join } = await import('path');
            const { homedir } = await import('os');
            
            const perAppConfigPath = join(
              homedir(),
              '.toolprint/hypertool-mcp/mcp',
              `${appId}.json`
            );
            
            let configExists = false;
            try {
              await fs.access(perAppConfigPath);
              configExists = true;
            } catch {
              configExists = false;
            }
            
            if (!configExists) {
              const { initMethod } = await inquirer.prompt([{
                type: 'list',
                name: 'initMethod',
                message: `No per-app config exists for ${appName}. How would you like to proceed?`,
                choices: [
                  {
                    name: 'Start with empty config',
                    value: 'empty'
                  },
                  {
                    name: 'Copy current global config',
                    value: 'copy'
                  },
                  {
                    name: `Import from ${appName}'s existing config`,
                    value: 'import'
                  }
                ]
              }]);
              perAppInit = initMethod;
            }
          }
          
          appConfigs.push({
            appId,
            appName,
            configType,
            perAppInit
          });
          }
        }

        if (options.dryRun) {
          output.info(theme.info("🔍 [DRY RUN MODE] - Showing linking plan"));
          output.displaySpaceBuffer(1);

          output.displaySubHeader("Would link HyperTool to:");
          for (const config of appConfigs) {
            const configTypeLabel = config.configType === 'global' ? 'Global config' : 'Per-app config';
            let details = `• ${config.appName} → ${configTypeLabel}`;
            
            if (config.perAppInit) {
              details += ` (${config.perAppInit})`;
            }
            
            output.displayInstruction(details);
          }

          output.displaySpaceBuffer(1);
          output.info("No actual changes made in dry-run mode.");
          return;
        }

        // Confirm linking
        output.displaySpaceBuffer(1);
        output.displaySubHeader("Link Summary:");
        for (const config of appConfigs) {
          const configTypeLabel = config.configType === 'global' ? 'Global config' : 'Per-app config';
          let details = `• ${config.appName} → ${configTypeLabel}`;
          
          if (config.perAppInit) {
            details += ` (${config.perAppInit})`;
          }
          
          output.displayInstruction(details);
        }
        
        output.displaySpaceBuffer(1);
        const { confirm } = await inquirer.prompt([
          {
            type: "confirm",
            name: "confirm",
            message: theme.warning(`Proceed with linking?`),
            default: true,
          },
        ]);

        if (!confirm) {
          output.info("Linking cancelled.");
          return;
        }

        output.info("🔗 Linking applications to HyperTool...");

        const result = await configManager.linkApplications(appConfigs);

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
