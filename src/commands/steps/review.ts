/**
 * Review step - Show summary and confirm before execution
 */

import inquirer from "inquirer";
import { WizardState, WizardStep } from "../setup/types.js";
import { output } from "../../utils/output.js";
import { theme } from "../../utils/theme.js";

export class ReviewStep implements WizardStep {
  name = "review";
  canSkip = true; // Skip in non-interactive mode

  async run(state: WizardState): Promise<WizardState> {
    // Skip review in non-interactive mode
    if (state.nonInteractive) {
      return state;
    }

    output.displaySpaceBuffer(1);
    output.displayHeader("📋 Setup Summary");
    output.displaySeparator();

    // Example configuration
    if (state.importStrategy === "examples" && state.selectedExample) {
      output.info(theme.label("Configuration template:"));
      output.info(
        `  ${state.selectedExample.name} (${state.selectedExample.serverCount} servers)`
      );
      if (state.selectedExample.requiresSecrets) {
        output.info(
          `  ${theme.warning("⚠️  Requires API keys for full functionality")}`
        );
      }
      output.displaySpaceBuffer(1);
    }

    // Applications
    if (state.selectedApps.length > 0) {
      output.info(theme.label("Applications to configure:"));
      for (const appId of state.selectedApps) {
        const app = state.detectedApps.find((a) => a.id === appId);
        const appSelections = state.perAppSelections[appId] || [];
        const serverCount = appSelections.filter((s) => s.selected).length;
        output.info(`  • ${app?.displayName} (${serverCount} servers)`);
      }
      output.displaySpaceBuffer(1);
    }

    // Servers (only show for per-app strategy)
    if (state.importStrategy === "per-app") {
      const finalServers = this.getFinalServerList(state);
      if (finalServers.length > 0) {
        output.info(theme.label("Servers to be managed:"));
        for (const server of finalServers) {
          const app = state.detectedApps.find((a) => a.id === server.fromApp);
          const appInfo = theme.muted(` (from ${app?.displayName})`);
          output.info(`  • ${server.finalName}${appInfo}`);
        }
        output.displaySpaceBuffer(1);
      }
    }

    // Toolsets
    if (state.toolsets.length > 0) {
      output.info(theme.label("Toolsets to create:"));
      for (const toolset of state.toolsets) {
        output.info(
          `  • ${toolset.displayName}: ${toolset.tools.length} tools`
        );
        if (state.verbose) {
          output.info(`    ${theme.muted(toolset.tools.join(", "))}`);
        }
      }
      output.displaySpaceBuffer(1);
    }

    // Installation type
    output.info(
      `${theme.label("Installation type:")} ${this.getInstallationTypeDisplay(state.installationType)}`
    );

    output.displaySeparator();

    // Warning for dry run
    if (state.dryRun) {
      output.displaySpaceBuffer(1);
      output.info(theme.warning("🔍 DRY RUN MODE - No changes will be made"));
    }

    output.displaySpaceBuffer(1);

    // Confirm
    const { shouldProceed } = await inquirer.prompt([
      {
        type: "confirm",
        name: "shouldProceed",
        message: state.dryRun
          ? "Preview setup actions?"
          : "Proceed with setup?",
        default: true,
      },
    ]);

    if (!shouldProceed) {
      return { ...state, cancelled: true };
    }

    return state;
  }

  private getFinalServerList(state: WizardState): Array<{
    name: string;
    finalName: string;
    fromApp: string;
  }> {
    const servers = [];

    // Go through each app's selections
    for (const [, appServers] of Object.entries(state.perAppSelections)) {
      for (const server of appServers) {
        if (!server.selected) continue;

        const key = `${server.fromApp}:${server.name}`;
        const finalName = state.serverNameMapping[key] || server.name;

        if (finalName) {
          // Skip if empty (marked for skipping)
          servers.push({
            name: server.name,
            finalName,
            fromApp: server.fromApp,
          });
        }
      }
    }

    return servers;
  }

  private getInstallationTypeDisplay(type: string): string {
    switch (type) {
      case "standard":
        return "Standard (proxy mode)";
      case "development":
        return "Development (side-by-side)";
      case "custom":
        return "Custom configuration";
      default:
        return type;
    }
  }
}
