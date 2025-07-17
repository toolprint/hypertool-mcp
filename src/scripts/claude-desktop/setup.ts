/**
 * Claude Desktop integration setup script
 * Usage: npx -y @toolprint/hypertool-mcp claude-desktop
 */

import { promises as fs } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { output } from '../../logging/output.js';
import {
  MCPConfig,
  SetupContext,
  validateMcpConfiguration,
  createConfigBackup,
  migrateToHyperToolConfig,
  promptForCleanupOptions,
  updateMcpConfigWithHyperTool,
  displaySetupSummary,
  displaySetupPlan
} from '../shared/mcpSetupUtils.js';

interface ClaudeDesktopConfig extends MCPConfig {
  mcpServers: Record<string, {
    type: string;
    command: string;
    args?: string[];
    env?: Record<string, string>;
    [key: string]: any;
  }>;
}

class ClaudeDesktopSetup {
  private readonly context: SetupContext;
  private dryRun: boolean = false;

  constructor() {
    // macOS paths as specified in PRD
    const claudeConfigPath = join(homedir(), 'Library/Application Support/Claude/claude_desktop_config.json');
    const backupPath = join(homedir(), 'Library/Application Support/Claude/claude_desktop_config.backup.json');
    const hyperToolConfigPath = join(homedir(), 'Library/Application Support/Claude/.mcp.ht.json');
    
    this.context = {
      originalConfigPath: claudeConfigPath,
      backupPath,
      hyperToolConfigPath,
      dryRun: false // Will be set in run method
    };
  }

  // All the shared functionality is now in mcpSetupUtils.ts

  async run(dryRun: boolean = false): Promise<void> {
    this.dryRun = dryRun;
    this.context.dryRun = dryRun;

    try {
      output.displayHeader('🚀 Claude Desktop + HyperTool Integration Setup');
      if (this.dryRun) {
        output.info(chalk.cyan('🔍 [DRY RUN MODE] - No changes will be made'));
      }
      output.displaySpaceBuffer(1);

      // Step 1: Validate configuration
      await validateMcpConfiguration(this.context.originalConfigPath);

      // Step 2: Read original configuration
      const originalConfig = JSON.parse(await fs.readFile(this.context.originalConfigPath, 'utf8'));

      // Step 3: Get user consent for the setup plan
      const shouldProceed = await displaySetupPlan(this.context, originalConfig, 'Claude Desktop');
      if (!shouldProceed) {
        process.exit(0);
      }

      // Step 4: Create backup
      await createConfigBackup(this.context);

      // Step 5: Migrate configuration
      await migrateToHyperToolConfig(this.context);

      // Step 6: Ask about cleanup options
      const shouldCleanup = await promptForCleanupOptions(this.context);

      // Step 7: Add HyperTool proxy with absolute path (Claude Desktop uses absolute paths)
      await updateMcpConfigWithHyperTool(this.context, originalConfig, shouldCleanup, this.context.hyperToolConfigPath);

      // Step 8: Display summary
      await displaySetupSummary(this.context, shouldCleanup, 'Claude Desktop');

    } catch (error) {
      output.error('❌ Setup failed:');
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

export { ClaudeDesktopSetup };