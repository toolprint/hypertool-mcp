/**
 * Claude Desktop integration setup script
 * Usage: npx -y @toolprint/hypertool-mcp --install claude-desktop
 */

import { promises as fs } from "fs";
import { join } from "path";
import { homedir } from "os";
import chalk from "chalk";
import inquirer from "inquirer";
import ora from "ora";
import { output } from "../../logging/output.js";
import {
  MCPConfig,
  SetupContext,
  validateMcpConfiguration,
  createConfigBackup,
  migrateToHyperToolConfig,
  updateMcpConfigWithHyperTool,
  readJsonFile,
} from "../shared/mcpSetupUtils.js";

export class ClaudeDesktopSetup {
  private readonly context: SetupContext;
  private dryRun: boolean = false;

  constructor() {
    // macOS paths
    const claudeConfigPath = join(
      homedir(),
      "Library/Application Support/Claude/claude_desktop_config.json"
    );
    const backupPath = join(
      homedir(),
      "Library/Application Support/Claude/claude_desktop_config.backup.json"
    );
    const hyperToolConfigPath = join(
      homedir(),
      "Library/Application Support/Claude/mcp.hypertool.json"
    );

    this.context = {
      originalConfigPath: claudeConfigPath,
      backupPath,
      hyperToolConfigPath,
      dryRun: false,
    };
  }

  async run(dryRun: boolean = false): Promise<void> {
    this.dryRun = dryRun;
    this.context.dryRun = dryRun;

    try {
      if (this.dryRun) {
        output.info(chalk.cyan("🔍 [DRY RUN MODE] - No changes will be made"));
        output.displaySpaceBuffer(1);
      }

      // Step 1: Validate configuration exists
      await validateMcpConfiguration(this.context.originalConfigPath);

      // Step 2: Read and analyze configuration
      const originalConfig: MCPConfig = await readJsonFile(
        this.context.originalConfigPath
      );
      const existingServers = Object.keys(
        originalConfig.mcpServers || {}
      ).filter((name) => name !== "hypertool");

      if (existingServers.length === 0) {
        output.warn("⚠️  No MCP servers found");
        output.info(
          "💡 Hypertool will be configured for future server additions"
        );
        output.displaySpaceBuffer(1);
      } else {
        // Show existing servers
        output.info(
          `📍 Claude Desktop has ${existingServers.length} MCP servers: ${existingServers.join(", ")}`
        );
        output.displaySpaceBuffer(1);
      }

      // Step 3: Get user confirmation
      const { shouldProceed } = await inquirer.prompt([
        {
          type: "confirm",
          name: "shouldProceed",
          message: chalk.yellow("Continue?"),
          default: true,
        },
      ]);

      if (!shouldProceed) {
        output.info("Skipped.");
        return;
      }

      output.displaySpaceBuffer(1);

      // Step 4: Create backup
      if (!this.dryRun) {
        output.info("📦 Configuring Hypertool...");
      }
      await createConfigBackup(this.context);

      // Step 5: Migrate servers
      await migrateToHyperToolConfig(this.context);

      // Step 6: Update configuration
      await updateMcpConfigWithHyperTool(
        this.context,
        originalConfig,
        true,
        this.context.hyperToolConfigPath
      );

      // Success!
      output.displaySpaceBuffer(1);

      if (this.dryRun) {
        console.log(
          chalk.yellow("🔍 [DRY RUN] Installation simulation complete")
        );
        output.displaySpaceBuffer(1);
        output.info("No actual changes were made to your system.");
      } else {
        console.log(chalk.green("✨ Claude Desktop configuration complete!"));
        output.displaySpaceBuffer(1);

        // Next steps
        output.info("🎯 Restart Claude Desktop and ask:");
        output.displayInstruction(
          '   "Use the list-all-tools tool to show all MCP tools"'
        );
        output.displaySpaceBuffer(1);
      }
    } catch (error) {
      output.error("❌ Setup failed:");
      output.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  }
}

// Run the setup if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const setup = new ClaudeDesktopSetup();
  setup.run().catch(console.error);
}
