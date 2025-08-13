/**
 * Shared utility functions for MCP setup scripts
 * Used by Claude Desktop, Claude Code, and other MCP integrations
 */

import { promises as fs } from "fs";
import { join } from "path";
import { homedir } from "os";
import inquirer from "inquirer";
import { output } from "../../utils/output.js";
import { theme } from "../../utils/theme.js";

export interface MCPConfig {
  mcpServers?: Record<
    string,
    {
      type: string;
      command: string;
      args?: string[];
      env?: Record<string, string>;
      [key: string]: any;
    }
  >;
  [key: string]: any;
}

export interface SetupContext {
  originalConfigPath: string;
  backupPath: string;
  hyperToolConfigPath: string;
  dryRun: boolean;
}

/**
 * Check if a file exists
 */
export async function fileExists(path: string): Promise<boolean> {
  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Read and parse a JSON configuration file
 */
export async function readJsonFile(path: string): Promise<any> {
  try {
    const content = await fs.readFile(path, "utf8");
    return JSON.parse(content);
  } catch (error) {
    throw new Error(`Failed to read JSON from ${path}: ${error}`);
  }
}

/**
 * Write a JSON configuration file
 */
export async function writeJsonFile(path: string, data: any): Promise<void> {
  try {
    await fs.writeFile(path, JSON.stringify(data, null, 2), "utf8");
  } catch (error) {
    throw new Error(`Failed to write JSON to ${path}: ${error}`);
  }
}

/**
 * Ensure a directory exists
 */
export async function ensureDirectoryExists(path: string): Promise<void> {
  try {
    await fs.mkdir(path, { recursive: true });
  } catch (error) {
    throw new Error(`Failed to create directory ${path}: ${error}`);
  }
}

/**
 * Validate that an MCP configuration exists and is valid
 */
export async function validateMcpConfiguration(
  configPath: string
): Promise<void> {
  // Check if config exists
  if (!(await fileExists(configPath))) {
    output.error("❌ No MCP configuration found.");
    output.warn("   Please create a configuration file first.");
    throw new Error("No MCP configuration found");
  }

  // Try to parse the JSON
  try {
    await readJsonFile(configPath);
  } catch (error) {
    output.error("❌ Invalid MCP configuration:");
    output.warn(`   ${error}`);
    output.warn("   Please fix the JSON syntax in your configuration file.");
    throw new Error("Invalid MCP configuration");
  }
}

/**
 * Create a backup of the original configuration file
 */
export async function createConfigBackup(context: SetupContext): Promise<void> {
  if (context.dryRun) {
    output.info(`[DRY RUN] Would create backup: ${context.backupPath}`);
    return;
  }

  // Check if backup already exists
  if (await fileExists(context.backupPath)) {
    // If backup exists and current config only has hypertool, skip backup
    const currentConfig: MCPConfig = await readJsonFile(
      context.originalConfigPath
    );
    const serverNames = Object.keys(currentConfig.mcpServers || {});

    if (
      serverNames.length === 1 &&
      serverNames[0].toLowerCase().includes("hypertool")
    ) {
      // Hypertool is already configured and backup exists - no need to overwrite
      return;
    }

    const { overwrite } = await inquirer.prompt([
      {
        type: "confirm",
        name: "overwrite",
        message: theme.warning("⚠️  Backup file already exists. Overwrite?"),
        default: false,
      },
    ]);

    if (!overwrite) {
      output.warn("🛑 Backup skipped. Exiting without changes.");
      process.exit(0);
    }
  }

  try {
    // Read current .mcp.json to get any new servers
    const currentConfig: MCPConfig = await readJsonFile(
      context.originalConfigPath
    );
    const newServers = { ...currentConfig.mcpServers };

    // Remove hypertool from new servers
    Object.keys(newServers).forEach((key) => {
      if (key.toLowerCase().includes("hypertool")) {
        delete newServers[key];
      }
    });

    let backupConfig: MCPConfig;

    // If backup already exists, merge new servers into it (additive)
    if (await fileExists(context.backupPath)) {
      const existingBackup: MCPConfig = await readJsonFile(context.backupPath);
      backupConfig = {
        mcpServers: {
          ...existingBackup.mcpServers,
          ...newServers, // New servers take precedence
        },
      };
    } else {
      // First time - create backup with current servers
      backupConfig = {
        mcpServers: newServers,
      };
    }

    const backupContent = JSON.stringify(backupConfig, null, 2);
    await fs.writeFile(context.backupPath, backupContent, "utf8");
  } catch (error) {
    output.error("❌ Failed to create backup:");
    output.error(error instanceof Error ? error.message : String(error));
    throw error;
  }
}

/**
 * Migrate existing MCP servers to HyperTool configuration
 */
export async function migrateToHyperToolConfig(
  context: SetupContext
): Promise<MCPConfig> {
  const originalConfig: MCPConfig = await readJsonFile(
    context.originalConfigPath
  );

  if (!originalConfig.mcpServers) {
    originalConfig.mcpServers = {};
  }

  // Use backup as the source of truth for servers
  if (!(await fileExists(context.backupPath))) {
    throw new Error("Backup file not found. Cannot migrate servers safely.");
  }

  const backupConfig: MCPConfig = await readJsonFile(context.backupPath);
  const serversFromBackup = backupConfig.mcpServers || {};

  if (context.dryRun) {
    const serverCount = Object.keys(serversFromBackup).length;
    output.info(
      `[DRY RUN] Would copy ${serverCount} servers from backup to: ${context.hyperToolConfigPath}`
    );
    if (false) {
      output.info(
        `[DRY RUN] Would also sync servers to database (NeDB mode enabled)`
      );
    }
    return originalConfig;
  }

  const hyperToolConfig = {
    mcpServers: serversFromBackup,
  };

  await writeJsonFile(context.hyperToolConfigPath, hyperToolConfig);

  // If NeDB is enabled, we should notify that database sync will happen
  // when HyperTool starts up and reads the config file
  if (false) {
    output.info(
      "📊 Database mode detected - servers will be synced to database on first run"
    );
  }

  return originalConfig;
}

/**
 * Prompt user for cleanup options (automatic vs manual)
 * Note: We're simplifying to always do automated cleanup
 */
export async function promptForCleanupOptions(): Promise<boolean> {
  // Always return true for automated cleanup - we've removed the manual option
  return true;
}

/**
 * Create HyperTool proxy configuration
 */
export function createHyperToolProxyConfig(hyperToolConfigPath: string): any {
  return {
    hypertool: {
      type: "stdio",
      command: "npx",
      args: [
        "-y",
        "@toolprint/hypertool-mcp@latest",
        "--mcp-config",
        hyperToolConfigPath,
      ],
    },
  };
}

/**
 * Update MCP configuration with HyperTool proxy
 */
export async function updateMcpConfigWithHyperTool(
  context: SetupContext,
  originalConfig: MCPConfig,
  _shouldCleanup: boolean,
  hyperToolConfigPath: string
): Promise<void> {
  const hyperToolProxy = createHyperToolProxyConfig(hyperToolConfigPath);

  if (context.dryRun) {
    output.info(
      `[DRY RUN] Would update config with Hypertool proxy: ${context.originalConfigPath}`
    );
    return;
  }

  // Always do automated cleanup (only HyperTool in config)
  const newConfig = {
    ...originalConfig,
    mcpServers: hyperToolProxy,
  };

  await writeJsonFile(context.originalConfigPath, newConfig);
}

/**
 * Display setup summary
 */
export async function displaySetupSummary(
  context: SetupContext,
  shouldCleanup: boolean,
  integrationName: string
): Promise<void> {
  if (context.dryRun) {
    return; // Summary already shown in displaySetupPlan for dry run
  }

  output.displaySpaceBuffer(1);
  output.success(`🎉 ${integrationName} integration setup complete!`);
  output.displaySpaceBuffer(1);

  const hyperToolConfig = await readJsonFile(context.hyperToolConfigPath);
  const serverCount = Object.keys(hyperToolConfig.mcpServers).length;

  output.displaySubHeader("📋 Changes completed:");
  output.success(
    `✅ ${serverCount} MCP server(s) migrated to HyperTool configuration`
  );
  output.success("✅ HyperTool proxy added to MCP configuration");
  output.success("✅ Original configuration backed up");

  if (shouldCleanup) {
    output.success("✅ Automated cleanup completed");
  } else {
    output.warn("⚠️  Manual cleanup selected - you may have duplicate servers");
  }

  // Show database mode information if enabled
  if (false) {
    output.displaySpaceBuffer(1);
    output.info("📊 Database Mode: ENABLED");
    output.displayInstruction(
      "   HyperTool is using database-backed configuration storage"
    );
    output.displayInstruction(
      "   To manage servers, use: hypertool-mcp config show servers"
    );
  }

  output.displaySpaceBuffer(1);
  output.displaySubHeader("🔄 Next steps:");
  output.displayInstruction(`1. Restart ${integrationName}`);
  output.displayInstruction(
    "2. Your MCP tools are now proxied through HyperTool"
  );
  output.displayInstruction("3. Use HyperTool commands to manage toolsets");
  output.displaySpaceBuffer(1);
  output.displaySubHeader("🔄 To restore original configuration:");
  output.displayTerminalInstruction(
    `cp "${context.backupPath}" "${context.originalConfigPath}"`
  );
}

/**
 * Display what the setup process will do before getting user consent
 */
export async function displaySetupPlan(
  context: SetupContext,
  originalConfig: MCPConfig,
  integrationName: string
): Promise<boolean> {
  const serverCount = Object.keys(originalConfig.mcpServers || {}).length;
  const serverNames = Object.keys(originalConfig.mcpServers || {});

  if (context.dryRun) {
    output.displayHeader("📋 Dry Run - Changes Preview");
    output.displaySpaceBuffer(1);

    output.info("📁 Files that would be created/modified:");
    output.displayInstruction(`• Backup: ${context.backupPath}`);
    output.displayInstruction(
      `• HyperTool config: ${context.hyperToolConfigPath}`
    );
    output.displayInstruction(
      `• Updated MCP config: ${context.originalConfigPath}`
    );
    output.displaySpaceBuffer(1);

    output.info(`🔄 ${serverCount} MCP server(s) would be migrated:`);
    if (serverCount > 0) {
      serverNames.forEach((name) => {
        output.displayInstruction(`• ${name}`);
      });
    } else {
      output.displayInstruction("• No existing servers to migrate");
    }
    output.displaySpaceBuffer(1);

    output.info("✨ Result: HyperTool proxy replaces all servers in .mcp.json");
    output.info("💡 Original servers remain accessible through HyperTool");

    if (false) {
      output.displaySpaceBuffer(1);
      output.info("📊 Database Mode: ENABLED");
      output.info("   • Servers will be stored in NeDB database");
      output.info("   • Use 'hypertool-mcp config show' commands to manage");
    }

    output.displaySpaceBuffer(1);

    return true;
  }

  // Check if HyperTool already exists (check for any server with "hypertool" in the name)
  const hasHypertool = Object.keys(originalConfig.mcpServers || {}).some(
    (key) => key.toLowerCase().includes("hypertool")
  );
  if (hasHypertool) {
    output.warn("⚠️  HyperTool is already configured in MCP configuration");
    const { shouldContinue } = await inquirer.prompt([
      {
        type: "confirm",
        name: "shouldContinue",
        message: "Do you want to reinstall and update the configuration?",
        default: true,
      },
    ]);

    if (!shouldContinue) {
      output.info("Installation cancelled.");
      return false;
    }
  } else {
    // Show what will happen
    output.displaySubHeader("This installer will:");
    output.displayInstruction(`1. Backup your current MCP configuration`);
    output.displayInstruction(
      `2. Move your ${serverCount} existing MCP servers to HyperTool config`
    );
    output.displayInstruction(
      `3. Configure ${integrationName} to use HyperTool as a proxy`
    );
    output.displayInstruction(`4. Provide options for configuration cleanup`);
    output.displaySpaceBuffer(1);

    const { shouldProceed } = await inquirer.prompt([
      {
        type: "confirm",
        name: "shouldProceed",
        message: "Proceed with installation?",
        default: true,
      },
    ]);

    if (!shouldProceed) {
      output.info("Installation cancelled.");
      return false;
    }
  }

  return true;
}

/**
 * Check if Hypertool slash commands are already installed globally
 */
export async function hasClaudeCodeGlobalHypertoolSlashCommands(): Promise<boolean> {
  const globalCommandsDir = join(homedir(), ".claude/commands/ht");
  try {
    const exists = await fileExists(globalCommandsDir);
    if (!exists) return false;

    // Check if the directory has command files
    const files = await fs.readdir(globalCommandsDir);
    const mdFiles = files.filter((f) => f.endsWith(".md"));

    // We expect at least the core commands
    const expectedCommands = [
      "list-all-tools.md",
      "new-toolset.md",
      "list-toolsets.md",
    ];
    const hasAllCommands = expectedCommands.every((cmd) =>
      mdFiles.includes(cmd)
    );

    return hasAllCommands;
  } catch {
    return false;
  }
}
