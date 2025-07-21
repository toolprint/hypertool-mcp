/**
 * Cursor IDE integration setup script
 * Usage: npx -y @toolprint/hypertool-mcp --install cursor
 */

import { join } from "path";
import { homedir } from "os";
import chalk from "chalk";
import inquirer from "inquirer";
import { output } from "../../logging/output.js";
import {
  MCPConfig,
  SetupContext,
  validateMcpConfiguration,
  createConfigBackup,
  migrateToHyperToolConfig,
  updateMcpConfigWithHyperTool,
  readJsonFile,
  fileExists,
} from "../shared/mcpSetupUtils.js";

export class CursorSetup {
  private readonly context: SetupContext;
  private dryRun: boolean = false;

  constructor() {
    // Cursor paths
    const cursorConfigPath = join(homedir(), ".cursor/mcp.json");
    const backupPath = join(homedir(), ".cursor/mcp.backup.json");
    const hyperToolConfigPath = join(homedir(), ".cursor/mcp.hypertool.json");

    this.context = {
      originalConfigPath: cursorConfigPath,
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
      ).filter((name) => !name.toLowerCase().includes("hypertool"));

      // Check if hypertool is already fully configured
      const hasHypertool = Object.keys(originalConfig.mcpServers || {}).some(
        (key) => key.toLowerCase().includes("hypertool")
      );
      const hyperToolConfigExists = await fileExists(
        this.context.hyperToolConfigPath
      );

      if (
        hasHypertool &&
        hyperToolConfigExists &&
        existingServers.length === 0
      ) {
        const hyperToolConfig: MCPConfig = await readJsonFile(
          this.context.hyperToolConfigPath
        );
        const hyperToolServers = Object.keys(hyperToolConfig.mcpServers || {});

        if (hyperToolServers.length > 0) {
          output.success("✅ Hypertool is already configured for Cursor");
          output.info(
            `📍 Managing ${hyperToolServers.length} MCP servers: ${hyperToolServers.join(", ")}`
          );
          output.displaySpaceBuffer(1);
          output.info("Nothing to do - Hypertool is already fully configured.");
          return;
        }
      } else if (existingServers.length === 0) {
        output.warn("⚠️  No MCP servers found");
        output.info(
          "💡 Hypertool will be configured for future server additions"
        );
        output.displaySpaceBuffer(1);
      } else {
        // Show existing servers
        output.info(
          `📍 Cursor has ${existingServers.length} MCP servers: ${existingServers.join(", ")}`
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
        console.log(chalk.green("✨ Cursor configuration complete!"));
        output.displaySpaceBuffer(1);

        // Next steps
        output.info("🎯 Restart Cursor and type:");
        output.displayInstruction("   // list-all-tools");
        output.displaySpaceBuffer(1);
      }
    } catch (error) {
      output.error("❌ Setup failed:");
      output.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  }
}

// Export for backwards compatibility
interface SetupOptions {
  dryRun?: boolean;
}

export default async function main(options: SetupOptions = {}) {
  const setup = new CursorSetup();
  await setup.run(options.dryRun);
}

// Run the setup if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const setup = new CursorSetup();
  setup.run().catch(console.error);
}
