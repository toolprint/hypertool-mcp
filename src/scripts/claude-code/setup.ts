/**
 * Claude Code integration setup script
 * Usage: npx -y @toolprint/hypertool-mcp --install claude-code
 */

import { promises as fs } from "fs";
import { join } from "path";
import { homedir } from "os";
import inquirer from "inquirer";
import chalk from "chalk";
import { createCommandTemplates } from "./utils.js";
import { output } from "../../utils/output.js";
import { theme } from "../../utils/theme.js";
import {
  MCPConfig,
  SetupContext,
  validateMcpConfiguration,
  createConfigBackup,
  migrateToHyperToolConfig,
  updateMcpConfigWithHyperTool,
  readJsonFile,
  fileExists,
  hasClaudeCodeGlobalHypertoolSlashCommands,
  writeJsonFile,
} from "../shared/mcpSetupUtils.js";
import {
  detectExternalMCPs,
  ExternalMCPInfo,
} from "../shared/externalMcpDetector.js";

export class ClaudeCodeSetup {
  private context: SetupContext;
  private dryRun: boolean = false;
  private isGlobalInstall: boolean = false;

  constructor() {
    // Default to project-local configuration
    const projectDir = process.cwd();
    const mcpConfigPath = join(projectDir, ".mcp.json");
    const backupPath = join(projectDir, ".mcp.backup.json");
    const hyperToolConfigPath = join(projectDir, "mcp.hypertool.json");

    this.context = {
      originalConfigPath: mcpConfigPath,
      backupPath,
      hyperToolConfigPath,
      dryRun: false,
    };
  }

  /**
   * Update context paths based on installation scope
   */
  private updateContextForScope(isGlobal: boolean) {
    if (isGlobal) {
      const homeDir = homedir();
      this.context = {
        originalConfigPath: join(homeDir, ".claude.json"),
        backupPath: join(homeDir, ".claude.backup.json"),
        hyperToolConfigPath: join(homeDir, ".claude", "mcp.hypertool.json"),
        dryRun: this.context.dryRun,
      };
    } else {
      // Keep project-local paths
      const projectDir = process.cwd();
      this.context = {
        originalConfigPath: join(projectDir, ".mcp.json"),
        backupPath: join(projectDir, ".mcp.backup.json"),
        hyperToolConfigPath: join(projectDir, "mcp.hypertool.json"),
        dryRun: this.context.dryRun,
      };
    }
    this.isGlobalInstall = isGlobal;
  }

  /**
   * Check if we're in a valid project directory
   */
  private async isValidProjectDirectory(): Promise<boolean> {
    const projectDir = process.cwd();
    const hasGit = await fileExists(join(projectDir, ".git"));
    const hasMcpJson = await fileExists(this.context.originalConfigPath);
    return hasGit || hasMcpJson;
  }

  /**
   * Prompt user to select which setup components to install
   */
  private async promptForSetupComponents(hasGlobalCommands: boolean): Promise<{
    updateMcpConfig: boolean;
    installSlashCommands: boolean;
    installGlobally?: boolean;
  }> {
    if (this.dryRun) {
      // In dry run mode, default to all components selected
      return {
        updateMcpConfig: true,
        installSlashCommands: !hasGlobalCommands,
      };
    }

    const choices = [
      {
        name: "Update .mcp.json configuration (setup HyperTool proxy)",
        value: "updateMcpConfig",
        checked: true,
      },
    ];

    // Only offer slash command installation if not already installed globally
    if (!hasGlobalCommands) {
      choices.push({
        name: "Install slash commands globally in ~/.claude/commands/ht/ (recommended)",
        value: "installSlashCommandsGlobal",
        checked: true,
      });
      choices.push({
        name: "Install slash commands locally in .claude/commands/ht/",
        value: "installSlashCommandsLocal",
        checked: false,
      });
    }

    // If only one choice, auto-select it
    if (choices.length === 1) {
      return {
        updateMcpConfig: true,
        installSlashCommands: false,
        installGlobally: false,
      };
    }

    const { components } = await inquirer.prompt([
      {
        type: "checkbox",
        name: "components",
        message: "Select components to install:",
        choices,
        validate: (answers) => {
          if (answers.length === 0) {
            return "Please select at least one component to install";
          }
          return true;
        },
      },
    ]);

    return {
      updateMcpConfig: components.includes("updateMcpConfig"),
      installSlashCommands:
        components.includes("installSlashCommandsGlobal") ||
        components.includes("installSlashCommandsLocal"),
      installGlobally: components.includes("installSlashCommandsGlobal"),
    };
  }

  async run(dryRun: boolean = false): Promise<void> {
    this.dryRun = dryRun;
    this.context.dryRun = dryRun;
    const projectDir = process.cwd();

    try {
      if (this.dryRun) {
        output.info(theme.info("🔍 [DRY RUN MODE] - No changes will be made"));
        output.displaySpaceBuffer(1);
      }

      // Check if we're in a valid project directory
      const inProjectDirectory = await this.isValidProjectDirectory();

      // Ask user about installation scope
      let installGlobally = false;
      if (this.dryRun) {
        // In dry run mode, default to global if not in project
        installGlobally = !inProjectDirectory;
        if (inProjectDirectory) {
          output.info(
            "[DRY RUN] Would prompt for installation scope (global vs local)"
          );
          installGlobally = true; // Default to global for dry run
        }
      } else if (inProjectDirectory) {
        const { scope } = await inquirer.prompt([
          {
            type: "list",
            name: "scope",
            message: "Where would you like to install hypertool-mcp?",
            choices: [
              {
                name: "Globally (all projects)",
                value: "global",
              },
              {
                name: `This project only (${chalk.yellow(projectDir)})`,
                value: "local",
              },
            ],
            default: "global",
          },
        ]);
        installGlobally = scope === "global";
      } else {
        // Not in a project, install globally
        output.info("📍 Not in a project directory, installing globally");
        installGlobally = true;
      }

      // Update context paths based on scope
      this.updateContextForScope(installGlobally);

      if (!installGlobally) {
        output.info(`📁 Installing to project: ${chalk.yellow(projectDir)}`);
      } else {
        output.info(
          `🌍 Installing globally to: ${chalk.yellow("~/.claude.json")}`
        );
      }
      output.displaySpaceBuffer(1);

      // Step 1: Check for .mcp.json (or .claude.json for global)
      let mcpConfig: MCPConfig = {};
      let hasExistingConfig = false;

      if (!(await fileExists(this.context.originalConfigPath))) {
        const configFileName = installGlobally ? ".claude.json" : ".mcp.json";
        const configLocation = installGlobally
          ? "home directory"
          : "current directory";

        output.warn(`⚠️  No ${configFileName} found in ${configLocation}`);
        if (!installGlobally) {
          output.info(`📁 Current directory: ${theme.value(projectDir)}`);
        }
        output.displaySpaceBuffer(1);
        output.displaySubHeader("To use HyperTool with Claude Code:");
        output.displayInstruction(
          `1. Create a ${configFileName} file in ${configLocation}`
        );
        output.displayInstruction("2. Add your MCP server configurations");
        output.displayInstruction("3. Run this installer again");
        output.displaySpaceBuffer(1);
        output.displaySubHeader(`Example ${configFileName}:`);
        output.displayTerminalInstruction(`{
  "mcpServers": {
    "git": {
      "type": "stdio",
      "command": "git-mcp-server"
    }
  }
}`);
        output.displaySpaceBuffer(1);

        // Offer to create a basic config
        let createBasic = false;
        if (this.dryRun) {
          output.info(
            `[DRY RUN] Would prompt to create a basic ${configFileName} file`
          );
          createBasic = true; // Simulate creating for dry run
        } else {
          const response = await inquirer.prompt([
            {
              type: "confirm",
              name: "createBasic",
              message: `Would you like to create a basic ${configFileName} file?`,
              default: true,
            },
          ]);
          createBasic = response.createBasic;
        }

        if (createBasic) {
          const basicConfig = {
            mcpServers: {},
          };

          if (this.dryRun) {
            output.info(
              `[DRY RUN] Would create basic ${configFileName} at ${this.context.originalConfigPath}`
            );
            if (installGlobally) {
              output.info(
                `[DRY RUN] Would ensure directory exists: ~/.claude/`
              );
            }
          } else {
            // For global install, the .claude.json is at home directory level
            // But we may need to create .claude directory for hypertool config
            if (installGlobally) {
              const claudeDir = join(homedir(), ".claude");
              await fs.mkdir(claudeDir, { recursive: true });
            }
            await fs.writeFile(
              this.context.originalConfigPath,
              JSON.stringify(basicConfig, null, 2)
            );
            output.success(`✅ Created basic ${configFileName} file`);
            output.info("   You can add MCP servers to this file later");
          }
          mcpConfig = basicConfig;
          hasExistingConfig = false;
        } else {
          // In test environment, return early instead of exiting
          if (process.env.NODE_ENV === "test") {
            return;
          }
          process.exit(0);
        }
      } else {
        hasExistingConfig = true;
        await validateMcpConfiguration(this.context.originalConfigPath);
        mcpConfig = await readJsonFile(this.context.originalConfigPath);
      }

      // Step 2: Analyze existing configuration
      const existingServers = Object.keys(mcpConfig.mcpServers || {}).filter(
        (name) => !name.toLowerCase().includes("hypertool")
      );

      // Check if hypertool is already fully configured
      const hasHypertool = Object.keys(mcpConfig.mcpServers || {}).some((key) =>
        key.toLowerCase().includes("hypertool")
      );
      const hyperToolConfigExists = await fileExists(
        this.context.hyperToolConfigPath
      );
      let isFullyConfigured = false;

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
          output.success("✅ Hypertool is already configured for this project");
          output.info(
            `📍 Managing ${hyperToolServers.length} MCP servers: ${hyperToolServers.join(", ")}`
          );
          output.displaySpaceBuffer(1);
          isFullyConfigured = true;
        }
      } else if (existingServers.length === 0 && hasExistingConfig) {
        output.warn("⚠️  No MCP servers found in .mcp.json");
        output.info("💡 You can still install Hypertool to add servers later");
        output.displaySpaceBuffer(1);
      } else if (existingServers.length > 0) {
        // Show existing servers
        if (installGlobally) {
          output.info(
            `📍 Global configuration has ${existingServers.length} MCP servers: ${existingServers.join(", ")}`
          );
        } else {
          output.info(
            `📍 Project ${projectDir.split("/").pop()} has ${existingServers.length} MCP servers: ${existingServers.join(", ")}`
          );
        }
        output.displaySpaceBuffer(1);
      }

      // Check if slash commands are already installed globally
      const hasGlobalCommands =
        await hasClaudeCodeGlobalHypertoolSlashCommands();
      if (hasGlobalCommands) {
        output.info(
          "✅ Global slash commands already installed in ~/.claude/commands/ht/"
        );
        output.displaySpaceBuffer(1);
      }

      // If fully configured and has commands, nothing to do
      if (isFullyConfigured && hasGlobalCommands) {
        output.info("Nothing to do - Hypertool is already fully configured.");
        return;
      }

      // Step 3: Let user select which components to install
      let selectedComponents;
      if (isFullyConfigured) {
        // Only offer slash commands if not already installed
        if (!hasGlobalCommands) {
          const { installCommands } = await inquirer.prompt([
            {
              type: "confirm",
              name: "installCommands",
              message: theme.warning("Install global slash commands?"),
              default: true,
            },
          ]);

          if (installCommands) {
            selectedComponents = {
              updateMcpConfig: false,
              installSlashCommands: true,
              installGlobally: true,
            };
          } else {
            output.info("Installation cancelled.");
            return;
          }
        } else {
          output.info("Nothing to do - Hypertool is already fully configured.");
          return;
        }
      } else {
        selectedComponents =
          await this.promptForSetupComponents(hasGlobalCommands);
      }

      if (
        !selectedComponents.updateMcpConfig &&
        !selectedComponents.installSlashCommands
      ) {
        output.warn("🛑 No components selected. Exiting without changes.");
        return;
      }

      if (selectedComponents.updateMcpConfig && existingServers.length > 0) {
        output.warn(
          "⚠️  Important: This will replace ALL existing servers with Hypertool proxy."
        );
        output.info(
          "   Your servers will remain accessible through Hypertool."
        );
        output.displaySpaceBuffer(1);
      }

      // Step 4: Get user confirmation
      const { shouldProceed } = await inquirer.prompt([
        {
          type: "confirm",
          name: "shouldProceed",
          message: theme.warning("Continue?"),
          default: true,
        },
      ]);

      if (!shouldProceed) {
        output.info("Skipped.");
        return;
      }

      output.displaySpaceBuffer(1);

      // MCP Configuration (only if selected)
      if (selectedComponents.updateMcpConfig) {
        if (!this.dryRun) {
          output.info("📦 Configuring Hypertool...");
        }

        // Create/update backup first (our recoverable source of truth)
        await createConfigBackup(this.context);

        // Migrate servers from backup to hypertool config
        await migrateToHyperToolConfig(this.context);

        // Update configuration
        await updateMcpConfigWithHyperTool(
          this.context,
          mcpConfig,
          true,
          this.context.hyperToolConfigPath
        );
      }

      // Install slash commands (only if selected)
      if (selectedComponents.installSlashCommands) {
        // Determine installation directory
        const isGlobal = selectedComponents.installGlobally;
        const baseDir = isGlobal ? homedir() : projectDir;
        const claudeDir = join(baseDir, ".claude");
        const commandsDir = join(claudeDir, "commands");
        const hyperToolCommandsDir = join(commandsDir, "ht");

        if (this.dryRun) {
          const location = isGlobal
            ? "~/.claude/commands/ht/"
            : ".claude/commands/ht/";
          output.info(`[DRY RUN] Would install slash commands to: ${location}`);
        } else {
          if (!selectedComponents.updateMcpConfig) {
            output.info("📦 Installing slash commands...");
          }

          // Clean existing commands and install fresh ones
          try {
            await fs.rm(hyperToolCommandsDir, { recursive: true, force: true });
          } catch {
            // Directory doesn't exist, continue
          }

          // Create directory
          await fs.mkdir(hyperToolCommandsDir, { recursive: true });

          // Generate command templates
          const commandTemplates = await createCommandTemplates();

          // Write all command files
          for (const [filename, content] of Object.entries(commandTemplates)) {
            const filePath = join(hyperToolCommandsDir, filename);
            await fs.writeFile(filePath, content, "utf8");
          }
        }
      }

      // After main setup, check for external MCPs to import
      if (!this.dryRun && selectedComponents.updateMcpConfig) {
        const externalMCPs = await detectExternalMCPs();

        // Filter out MCPs that are already in hypertool config
        const hyperToolConfig = (await fileExists(
          this.context.hyperToolConfigPath
        ))
          ? await readJsonFile(this.context.hyperToolConfigPath)
          : { mcpServers: {} };

        const newExternalMCPs = externalMCPs.filter(
          (mcp) => !hyperToolConfig.mcpServers?.[mcp.name]
        );

        if (newExternalMCPs.length > 0) {
          output.displaySpaceBuffer(1);
          output.warn("📋 Other MCP servers detected:");

          // Group by source
          const mcpsBySource = new Map<string, ExternalMCPInfo[]>();
          for (const mcp of newExternalMCPs) {
            if (!mcpsBySource.has(mcp.source)) {
              mcpsBySource.set(mcp.source, []);
            }
            mcpsBySource.get(mcp.source)!.push(mcp);
          }

          // Display MCPs by source
          for (const [source, mcps] of mcpsBySource) {
            output.info(`   ${source}:`);
            for (const mcp of mcps) {
              output.info(`     - ${mcp.name}`);
            }
          }

          output.displaySpaceBuffer(1);

          const { shouldImport } = await inquirer.prompt([
            {
              type: "confirm",
              name: "shouldImport",
              message: "Would you like to import these into hypertool?",
              default: true,
            },
          ]);

          if (shouldImport) {
            // Import the MCPs
            for (const mcp of newExternalMCPs) {
              hyperToolConfig.mcpServers[mcp.name] = mcp.config;
            }

            await writeJsonFile(
              this.context.hyperToolConfigPath,
              hyperToolConfig
            );
            output.success(
              `✅ Imported ${newExternalMCPs.length} MCP configurations`
            );
          }
        }
      }

      // Success!
      output.displaySpaceBuffer(1);

      if (this.dryRun) {
        output.info(
          theme.warning("🔍 [DRY RUN] Installation simulation complete")
        );
        output.displaySpaceBuffer(1);
        output.info("No actual changes were made to your system.");
      } else {
        output.success("✨ Claude Code configuration complete!");
        output.displaySpaceBuffer(1);

        // Next steps
        if (
          selectedComponents.updateMcpConfig ||
          selectedComponents.installSlashCommands
        ) {
          output.info("🎯 Open this project in Claude Code and use:");
          if (selectedComponents.installSlashCommands) {
            output.displayInstruction("   /ht:list-all-tools");
          } else {
            output.displayInstruction("   (Use installed slash commands)");
          }
          output.displaySpaceBuffer(1);
        }
      }
    } catch (error) {
      output.error("❌ Setup failed:");
      output.error(error instanceof Error ? error.message : String(error));
      // In test environment, throw the error for the test to handle
      if (process.env.NODE_ENV === "test") {
        throw error;
      }
      process.exit(1);
    }
  }
}

// Export for backwards compatibility
interface InstallOptions {
  dryRun?: boolean;
}

export async function installClaudeCodeCommands(options: InstallOptions = {}) {
  const setup = new ClaudeCodeSetup();
  try {
    await setup.run(options.dryRun);
  } catch (error) {
    // In test environment, we want to propagate the error instead of exiting
    if (process.env.NODE_ENV === "test") {
      throw error;
    }
    // In production, we handle it like before
    output.error("❌ Setup failed:");
    output.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

// Run the setup if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const setup = new ClaudeCodeSetup();
  setup.run().catch((error) => {
    output.error("Setup failed:");
    output.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
