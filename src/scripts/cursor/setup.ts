#!/usr/bin/env node

import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import chalk from "chalk";
import inquirer from "inquirer";
import { output } from "../../logging/output.js";
import {
  MCPConfig,
  SetupContext,
  validateMcpConfiguration,
  createConfigBackup,
  migrateToHyperToolConfig,
  promptForCleanupOptions,
  updateMcpConfigWithHyperTool,
  displaySetupSummary,
  displaySetupPlan,
  fileExists
} from '../shared/mcpSetupUtils.js';

interface SetupOptions {
  dryRun?: boolean;
}

export default async function main(options: SetupOptions = {}) {
  const { dryRun = false } = options;
  
  const CURSOR_CONFIG_PATH = path.join(os.homedir(), ".cursor", "mcp.json");
  const BACKUP_PATH = path.join(os.homedir(), ".cursor", "mcp.backup.json");
  const HYPERTOOL_CONFIG_PATH = path.join(os.homedir(), ".cursor", ".mcp.ht.json");
  
  const context: SetupContext = {
    originalConfigPath: CURSOR_CONFIG_PATH,
    backupPath: BACKUP_PATH,
    hyperToolConfigPath: HYPERTOOL_CONFIG_PATH,
    dryRun
  };

  output.clearTerminal();
  output.displayHeader("🚀 Cursor IDE Integration Setup");
  output.displaySubHeader("HyperTool MCP Configuration");
  
  if (dryRun) {
    output.warn("🧪 DRY RUN MODE - No actual changes will be made");
    output.displaySpaceBuffer(1);
  }
  
  output.displaySpaceBuffer(1);

  // 1. Validation Phase
  let originalConfig: MCPConfig = {};
  
  try {
    if (!(await fileExists(CURSOR_CONFIG_PATH))) {
      output.error("❌ No mcp.json exists yet");
      output.displayInstruction("Please set up at least one MCP server in Cursor first");
      process.exit(1);
    }

    await validateMcpConfiguration(CURSOR_CONFIG_PATH);
    
    const configContent = await fs.promises.readFile(CURSOR_CONFIG_PATH, "utf8");
    originalConfig = JSON.parse(configContent);
    
    // Show current MCP servers
    const existingServers = Object.keys(originalConfig.mcpServers || {});
    if (existingServers.length > 0) {
      output.info("📋 Current MCP servers:");
      existingServers.forEach((server) => {
        output.displayHelpContext(`   • ${server}`);
      });
      output.displaySpaceBuffer(1);
    }
  } catch (error) {
    output.error(`❌ Error reading Cursor configuration: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }

  // 2. Get user consent for the setup plan
  const shouldProceed = await displaySetupPlan(context, originalConfig, 'Cursor IDE');
  if (!shouldProceed) {
    process.exit(0);
  }

  try {
    // 3. Create backup
    await createConfigBackup(context);

    // 4. Migrate to HyperTool configuration
    await migrateToHyperToolConfig(context);

    // 5. Ask about cleanup options
    const shouldCleanup = await promptForCleanupOptions(context);

    // 6. Update configuration with HyperTool proxy (using absolute path for Cursor)
    await updateMcpConfigWithHyperTool(context, originalConfig, shouldCleanup, HYPERTOOL_CONFIG_PATH);

    // Display setup summary
    await displaySetupSummary(context, shouldCleanup, 'Cursor IDE');
    
    // Additional Cursor-specific information
    if (!dryRun) {
      output.displaySpaceBuffer(1);
      output.displaySubHeader("🎯 Cursor IDE Integration");
      output.displayInstruction("• HyperTool proxy is now active in Cursor");
      output.displayInstruction("• All your MCP tools are accessible through HyperTool");
      output.displayInstruction("• Use HyperTool commands to manage toolsets");
      output.displaySpaceBuffer(1);
    }
  } catch (error) {
    output.error("❌ Setup failed:");
    output.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

// ESM equivalent of require.main === module
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    output.error("❌ Setup failed:");
    output.error(error.message || error);
    process.exit(1);
  });
}
