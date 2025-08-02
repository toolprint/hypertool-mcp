/**
 * App detection step - Scans for installed MCP-compatible applications
 */

import inquirer from "inquirer";
import { promises as fs } from "fs";
import { join } from "path";
import { homedir } from "os";
import { WizardState, WizardStep, DetectedApp } from "../setup/types.js";
import { output } from "../../utils/output.js";
import { theme } from "../../utils/theme.js";

export class AppDetectionStep implements WizardStep {
  name = "appDetection";

  async run(state: WizardState): Promise<WizardState> {
    output.displaySpaceBuffer(1);
    output.info(theme.info("🔍 Scanning for MCP-compatible applications..."));
    output.displaySpaceBuffer(1);

    // Detect installed applications
    const detectedApps = await this.detectApplications();

    if (detectedApps.length === 0) {
      output.warn("⚠️  No supported applications detected");
      output.info("");
      output.info("Supported applications:");
      output.info("  • Claude Desktop (macOS)");
      output.info("  • Cursor");
      output.info("  • Claude Code");
      output.displaySpaceBuffer(1);

      // Ask if they want to continue anyway
      if (!state.nonInteractive) {
        const { shouldContinue } = await inquirer.prompt([
          {
            type: "confirm",
            name: "shouldContinue",
            message: "Continue with manual setup?",
            default: false,
          },
        ]);

        if (!shouldContinue) {
          return { ...state, cancelled: true };
        }
      }

      return { ...state, detectedApps: [] };
    }

    // Display detected apps
    output.success("Found the following applications:");
    for (const app of detectedApps) {
      const icon = app.hasExistingConfig ? "✓" : "○";
      const configInfo = app.hasExistingConfig
        ? theme.success(` (${app.serverCount} servers)`)
        : theme.muted(" (no config)");
      output.info(`  ${icon} ${app.displayName}${configInfo}`);
    }
    output.displaySpaceBuffer(1);

    // In non-interactive mode, select apps based on options
    if (state.nonInteractive) {
      let selectedApps: string[];

      // Check if specific apps were requested via CLI
      const requestedApps = (state as any).apps;
      if (requestedApps && requestedApps.length > 0) {
        // Filter to only requested apps that were detected
        selectedApps = detectedApps
          .filter((app) => requestedApps.includes(app.id))
          .map((app) => app.id);

        if (selectedApps.length === 0) {
          output.error("None of the requested applications were detected");
          return { ...state, cancelled: true };
        }
      } else {
        // Default to all detected apps
        selectedApps = detectedApps.map((app) => app.id);
      }

      return {
        ...state,
        detectedApps,
        selectedApps,
      };
    }

    // Ask which apps to configure
    const { selectedApps } = await inquirer.prompt([
      {
        type: "checkbox",
        name: "selectedApps",
        message: "Which applications would you like to configure?",
        choices: detectedApps.map((app) => ({
          name: app.displayName,
          value: app.id,
          checked: false, // Start with all unchecked (opt-in)
        })),
        // No validation - allow empty selection
      },
    ]);

    return {
      ...state,
      detectedApps,
      selectedApps,
    };
  }

  private async detectApplications(): Promise<DetectedApp[]> {
    const apps: DetectedApp[] = [];

    // Check Claude Desktop (macOS)
    const claudeDesktopPath = join(
      homedir(),
      "Library/Application Support/Claude"
    );
    const claudeConfigPath = join(
      claudeDesktopPath,
      "claude_desktop_config.json"
    );

    if (await this.pathExists(claudeDesktopPath)) {
      const hasConfig = await this.pathExists(claudeConfigPath);
      let serverCount = 0;

      if (hasConfig) {
        try {
          const content = await fs.readFile(claudeConfigPath, "utf-8");
          const config = JSON.parse(content);
          serverCount = Object.keys(config.mcpServers || {}).length;
        } catch {
          // Ignore parse errors
        }
      }

      apps.push({
        id: "claude-desktop",
        displayName: "🖥️  Claude Desktop",
        configPath: claudeConfigPath,
        detected: true,
        hasExistingConfig: hasConfig,
        serverCount,
      });
    }

    // Check Cursor
    const cursorPath = join(homedir(), ".cursor");
    const cursorConfigPath = join(cursorPath, "mcp.json");

    if (await this.pathExists(cursorPath)) {
      const hasConfig = await this.pathExists(cursorConfigPath);
      let serverCount = 0;

      if (hasConfig) {
        try {
          const content = await fs.readFile(cursorConfigPath, "utf-8");
          const config = JSON.parse(content);
          serverCount = Object.keys(config.mcpServers || {}).length;
        } catch {
          // Ignore parse errors
        }
      }

      apps.push({
        id: "cursor",
        displayName: "✏️  Cursor",
        configPath: cursorConfigPath,
        detected: true,
        hasExistingConfig: hasConfig,
        serverCount,
      });
    }

    // Check Claude Code (global)
    const claudeCodePath = join(homedir(), ".claude.json");

    if (await this.pathExists(claudeCodePath)) {
      let serverCount = 0;

      try {
        const content = await fs.readFile(claudeCodePath, "utf-8");
        const config = JSON.parse(content);
        serverCount = Object.keys(config.mcpServers || {}).length;
      } catch {
        // Ignore parse errors
        // .claude.json exists but may not have mcpServers yet
      }

      apps.push({
        id: "claude-code",
        displayName: "🤖 Claude Code",
        configPath: claudeCodePath,
        detected: true,
        hasExistingConfig: true, // File exists, so we consider it configured
        serverCount,
      });
    }

    return apps;
  }

  private async pathExists(path: string): Promise<boolean> {
    try {
      await fs.access(path);
      return true;
    } catch {
      return false;
    }
  }
}
