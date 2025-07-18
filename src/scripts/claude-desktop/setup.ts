/**
 * Claude Desktop integration setup script
 * Usage: npx -y @toolprint/hypertool-mcp --install claude-desktop
 */

import { promises as fs } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import chalk from 'chalk';
import inquirer from 'inquirer';
import ora from 'ora';
import { output } from '../../logging/output.js';
import {
  MCPConfig,
  SetupContext,
  validateMcpConfiguration,
  createConfigBackup,
  migrateToHyperToolConfig,
  updateMcpConfigWithHyperTool,
  readJsonFile
} from '../shared/mcpSetupUtils.js';

export class ClaudeDesktopSetup {
  private readonly context: SetupContext;
  private dryRun: boolean = false;

  constructor() {
    // macOS paths
    const claudeConfigPath = join(homedir(), 'Library/Application Support/Claude/claude_desktop_config.json');
    const backupPath = join(homedir(), 'Library/Application Support/Claude/claude_desktop_config.backup.json');
    const hyperToolConfigPath = join(homedir(), 'Library/Application Support/Claude/mcp.hypertool.json');
    
    this.context = {
      originalConfigPath: claudeConfigPath,
      backupPath,
      hyperToolConfigPath,
      dryRun: false
    };
  }

  async run(dryRun: boolean = false): Promise<void> {
    this.dryRun = dryRun;
    this.context.dryRun = dryRun;

    try {
      if (this.dryRun) {
        output.info(chalk.cyan('🔍 [DRY RUN MODE] - No changes will be made'));
        output.displaySpaceBuffer(1);
      }

      // Step 1: Validate configuration exists
      await validateMcpConfiguration(this.context.originalConfigPath);

      // Step 2: Read and analyze configuration
      const originalConfig: MCPConfig = await readJsonFile(this.context.originalConfigPath);
      const existingServers = Object.keys(originalConfig.mcpServers || {}).filter(name => name !== 'hypertool');
      
      if (existingServers.length === 0) {
        output.warn('⚠️  No MCP servers found');
        output.info('💡 Hypertool will be configured for future server additions');
        output.displaySpaceBuffer(1);
      } else {
        // Show existing servers
        output.info(`📍 Claude Desktop has ${existingServers.length} MCP servers: ${existingServers.join(', ')}`);
        output.displaySpaceBuffer(1);
      }

      // Step 3: Get user confirmation
      const { shouldProceed } = await inquirer.prompt([{
        type: 'confirm',
        name: 'shouldProceed',
        message: chalk.yellow('Configure Claude Desktop?'),
        default: true
      }]);

      if (!shouldProceed) {
        output.info('Skipped Claude Desktop.');
        return;
      }

      output.displaySpaceBuffer(1);

      // Step 4: Create backup
      const backupSpinner = this.dryRun ? null : ora('Creating configuration backup...').start();
      await createConfigBackup(this.context);
      if (!this.dryRun) {
        backupSpinner?.succeed('Configuration backed up');
        output.success(`✅ Backup created: ${chalk.gray('claude_desktop_config.backup.json')}`);
        output.displaySpaceBuffer(1);
      }

      // Step 5: Migrate servers
      const migrateSpinner = this.dryRun ? null : ora('Migrating MCP servers...').start();
      await migrateToHyperToolConfig(this.context);
      if (!this.dryRun) {
        migrateSpinner?.stop();
      }

      // Step 6: Update configuration
      const updateSpinner = this.dryRun ? null : ora('Updating Claude Desktop configuration...').start();
      await updateMcpConfigWithHyperTool(this.context, originalConfig, true, this.context.hyperToolConfigPath);
      if (!this.dryRun) {
        updateSpinner?.stop();
      }

      // Success!
      output.displaySpaceBuffer(1);
      
      if (this.dryRun) {
        console.log(chalk.yellow('🔍 [DRY RUN] Installation simulation complete'));
        output.displaySpaceBuffer(1);
        output.info('No actual changes were made to your system.');
      } else {
        console.log(chalk.green('✨ Claude Desktop installation complete!'));
        output.displaySpaceBuffer(1);

        // Show file locations
        output.displaySubHeader('📁 Important File Locations:');
        output.info('• Config: ~/Library/Application Support/Claude/claude_desktop_config.json');
        output.info('• Backup: ~/Library/Application Support/Claude/claude_desktop_config.backup.json');
        output.info('• Servers: ~/Library/Application Support/Claude/mcp.hypertool.json');
        output.displaySpaceBuffer(1);

        // Next steps
        output.displaySubHeader('🎯 Next Steps:');
        output.displayInstruction('1. Restart Claude Desktop to load the new configuration');
        output.displayInstruction('2. Ask Claude:');
        output.displayInstruction('   "Use the list-all-tools tool to show all MCP tools"');
        output.displayInstruction('3. Create a toolset:');
        output.displayInstruction('   "Use the new-toolset tool to create a \'dev\' toolset"');
        output.displaySpaceBuffer(1);

        // Recovery
        output.displaySubHeader('🔄 To Restore Original Configuration:');
        output.displayTerminalInstruction('cp "~/Library/Application Support/Claude/claude_desktop_config.backup.json" \\');
        output.displayTerminalInstruction('   "~/Library/Application Support/Claude/claude_desktop_config.json"');
        output.displaySpaceBuffer(1);
      }

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