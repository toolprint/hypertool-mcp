/**
 * Execution step - Perform the actual setup
 */

import { WizardState, WizardStep } from "../setup/types.js";
import { output } from "../../utils/output.js";
import { theme } from "../../utils/theme.js";
import { ConfigurationManager } from "../../config-manager/index.js";
import { join } from "path";
import { getHomeDir } from "../../utils/paths.js";
import { loadExampleConfig } from "./exampleConfigs.js";

export class ExecutionStep implements WizardStep {
  name = "execution";
  private configManager: ConfigurationManager;

  constructor(configManager: ConfigurationManager) {
    this.configManager = configManager;
  }

  async run(state: WizardState): Promise<WizardState> {
    output.displaySpaceBuffer(1);
    output.displayHeader("🚀 Setting up Hypertool MCP...");
    output.displaySpaceBuffer(1);

    const steps = [
      {
        name: "Creating configuration directory",
        action: () => this.createConfigDirectory(state),
      },
      state.importStrategy === "examples"
        ? {
            name: "Installing example configuration",
            action: () => this.installExampleConfig(state),
          }
        : {
            name: "Importing server configurations",
            action: () => this.importServerConfigs(state),
          },
      {
        name: "Setting up per-app configs",
        action: () => this.setupPerAppConfigs(state),
      },
      { name: "Creating toolsets", action: () => this.createToolsets(state) },
      {
        name: "Linking applications",
        action: () => this.linkApplications(state),
      },
    ].filter(Boolean);

    // Execute each step
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const progress = `[${i + 1}/${steps.length}]`;

      output.info(`${progress} ${step.name}...`);

      try {
        if (!state.dryRun) {
          await step.action();
        } else {
          output.info(theme.muted(`  → Would ${step.name.toLowerCase()}`));
        }

        output.success(`${progress} ${step.name}... ${theme.success("✓")}`);
      } catch (error) {
        output.error(`${progress} ${step.name}... ${theme.error("✗")}`);
        throw error;
      }
    }

    output.displaySpaceBuffer(1);

    if (state.dryRun) {
      output.success(
        theme.success("✅ Dry run complete! No changes were made.")
      );
    } else {
      output.success(theme.success("✅ Setup complete!"));
    }

    return state;
  }

  private async createConfigDirectory(state: WizardState): Promise<void> {
    if (state.dryRun) return;

    await this.configManager.initialize();
  }

  private async importServerConfigs(state: WizardState): Promise<void> {
    if (state.dryRun) return;

    // This will be handled by setupPerAppConfigs
  }

  private async installExampleConfig(state: WizardState): Promise<void> {
    if (state.dryRun) return;

    if (!state.selectedExample) {
      throw new Error("No example configuration selected");
    }

    const fs = (await import("fs")).promises;

    // Load the example configuration
    const exampleConfig = await loadExampleConfig(state.selectedExample.id);

    // Save it as the global default at ~/.toolprint/hypertool-mcp/mcp.json
    const globalConfigPath = join(
      getHomeDir(),
      ".toolprint",
      "hypertool-mcp",
      "mcp.json"
    );

    await fs.writeFile(
      globalConfigPath,
      JSON.stringify(exampleConfig, null, 2),
      "utf-8"
    );

    // Update main config to note the source
    const mainConfigPath = join(
      getHomeDir(),
      ".toolprint",
      "hypertool-mcp",
      "config.json"
    );

    let mainConfig: any = {};
    try {
      const content = await fs.readFile(mainConfigPath, "utf-8");
      mainConfig = JSON.parse(content);
    } catch {
      mainConfig = { version: "1.0.0" };
    }

    mainConfig.globalDefault = {
      source: "example",
      exampleId: state.selectedExample.id,
      installedAt: new Date().toISOString(),
    };

    await fs.writeFile(
      mainConfigPath,
      JSON.stringify(mainConfig, null, 2),
      "utf-8"
    );

    output.info(
      theme.muted(
        `  → Installed ${state.selectedExample.name} as global default`
      )
    );
  }

  private async setupPerAppConfigs(state: WizardState): Promise<void> {
    if (state.dryRun) return;

    // Skip if using example config as global default
    if (state.importStrategy === "examples") {
      return;
    }

    // Create per-app configs from perAppSelections
    for (const [appId, servers] of Object.entries(state.perAppSelections)) {
      const selectedServers = servers.filter((server) => server.selected);

      if (selectedServers.length === 0) {
        continue; // Skip apps with no selected servers
      }

      const mcpServers: Record<string, any> = {};

      for (const server of selectedServers) {
        // Use original server name (no conflict resolution needed for per-app configs)
        const finalName = server.name;

        // Read the original server config
        const app = state.detectedApps.find((a) => a.id === appId);
        if (app && app.hasExistingConfig) {
          try {
            const fs = (await import("fs")).promises;
            const content = await fs.readFile(app.configPath, "utf-8");
            const config = JSON.parse(content);

            if (config.mcpServers && config.mcpServers[server.name]) {
              mcpServers[finalName] = config.mcpServers[server.name];
            }
          } catch {
            // Ignore errors, server config might not exist
          }
        }
      }

      // Save app config using the file system directly
      if (Object.keys(mcpServers).length > 0) {
        await this.savePerAppConfig(appId, { mcpServers });
      }
    }
  }

  private async createToolsets(state: WizardState): Promise<void> {
    if (state.dryRun) return;

    const fs = (await import("fs")).promises;
    const configPath = join(
      getHomeDir(),
      ".toolprint",
      "hypertool-mcp",
      "config.json"
    );

    // Load existing config
    let config: any = {};
    try {
      const content = await fs.readFile(configPath, "utf-8");
      config = JSON.parse(content);
    } catch {
      config = { version: "1.0.0" };
    }

    // Initialize toolsets if not exists
    if (!config.toolsets) {
      config.toolsets = {};
    }

    // Add new toolsets
    for (const toolsetDef of state.toolsets) {
      config.toolsets[toolsetDef.name] = {
        name: toolsetDef.displayName,
        description: toolsetDef.description,
        tools: toolsetDef.tools.map((tool) => ({ name: tool })),
        metadata: {
          createdAt: new Date().toISOString(),
          createdBy: "vibe-setup",
        },
      };
    }

    // Save updated config
    await fs.writeFile(configPath, JSON.stringify(config, null, 2));
  }

  private async linkApplications(state: WizardState): Promise<void> {
    if (state.dryRun || state.installationType !== "standard") return;

    // Link Hypertool to each selected application
    await this.configManager.linkApplications(state.selectedApps);
  }

  private async savePerAppConfig(appId: string, config: any): Promise<void> {
    const fs = (await import("fs")).promises;
    const path = await import("path");

    // Get base path from environment or default location
    const basePath =
      process.env.HYPERTOOL_CONFIG_PATH ||
      path.join(getHomeDir(), ".toolprint", "hypertool-mcp");

    const configPath = path.join(basePath, "mcp", `${appId}.json`);
    await fs.mkdir(path.join(basePath, "mcp"), { recursive: true });

    const appConfig = {
      ...config,
      _metadata: {
        app: appId,
        importedAt: new Date().toISOString(),
        lastModified: new Date().toISOString(),
      },
    };

    await fs.writeFile(configPath, JSON.stringify(appConfig, null, 2));

    // Update main config
    const mainConfigPath = path.join(basePath, "config.json");
    let mainConfig: any = {};

    try {
      const content = await fs.readFile(mainConfigPath, "utf-8");
      mainConfig = JSON.parse(content);
    } catch {
      mainConfig = { version: "1.0.0", applications: {} };
    }

    if (!mainConfig.applications) {
      mainConfig.applications = {};
    }

    mainConfig.applications[appId] = {
      ...mainConfig.applications[appId],
      mcpConfig: `mcp/${appId}.json`,
      lastSync: new Date().toISOString(),
    };

    await fs.writeFile(mainConfigPath, JSON.stringify(mainConfig, null, 2));
  }
}
