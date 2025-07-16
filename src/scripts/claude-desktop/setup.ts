/**
 * Claude Desktop integration setup script
 * Usage: npx -y @toolprint/hypertool-mcp claude-desktop
 */

import { promises as fs } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import chalk from 'chalk';
import inquirer from 'inquirer';

interface ClaudeDesktopConfig {
  mcpServers: Record<string, {
    type: string;
    command: string;
    args?: string[];
    env?: Record<string, string>;
    [key: string]: any;
  }>;
  [key: string]: any;
}

class ClaudeDesktopSetup {
  private readonly claudeConfigPath: string;
  private readonly backupPath: string;
  private readonly hyperToolConfigPath: string;
  private dryRun: boolean = false;

  constructor() {
    // macOS paths as specified in PRD
    this.claudeConfigPath = join(homedir(), 'Library/Application Support/Claude/claude_desktop_config.json');
    this.backupPath = join(homedir(), 'Library/Application Support/Claude/claude_desktop_config.backup.json');
    this.hyperToolConfigPath = join(homedir(), 'Library/Application Support/Claude/.mcp.ht.json');
  }

  private async fileExists(path: string): Promise<boolean> {
    try {
      await fs.access(path);
      return true;
    } catch {
      return false;
    }
  }

  private async readJsonFile(path: string): Promise<any> {
    try {
      const content = await fs.readFile(path, 'utf8');
      return JSON.parse(content);
    } catch (error) {
      throw new Error(`Failed to read JSON from ${path}: ${error}`);
    }
  }

  private async writeJsonFile(path: string, data: any): Promise<void> {
    try {
      await fs.writeFile(path, JSON.stringify(data, null, 2), 'utf8');
    } catch (error) {
      throw new Error(`Failed to write JSON to ${path}: ${error}`);
    }
  }

  private async ensureDirectoryExists(path: string): Promise<void> {
    try {
      await fs.mkdir(path, { recursive: true });
    } catch (error) {
      throw new Error(`Failed to create directory ${path}: ${error}`);
    }
  }

  private async validateConfiguration(): Promise<void> {
    console.log(chalk.blue('🔍 Validating Claude Desktop configuration...'));
    
    // Check if Claude Desktop config exists
    if (!(await this.fileExists(this.claudeConfigPath))) {
      console.error(chalk.red('❌ No Claude Desktop configuration found.'));
      console.error(chalk.yellow('   Please run Claude Desktop first to create initial configuration.'));
      process.exit(1);
    }

    // Try to parse the JSON
    try {
      await this.readJsonFile(this.claudeConfigPath);
      console.log(chalk.green('✅ Claude Desktop configuration found and valid'));
    } catch (error) {
      console.error(chalk.red('❌ Invalid Claude Desktop configuration:'));
      console.error(chalk.yellow(`   ${error}`));
      console.error(chalk.yellow('   Please fix the JSON syntax in your configuration file.'));
      process.exit(1);
    }
  }

  private async createBackup(): Promise<void> {
    console.log(chalk.blue('💾 Creating backup of Claude Desktop configuration...'));
    
    if (this.dryRun) {
      console.log(chalk.cyan('🔍 [DRY RUN] Would create backup at:'), this.backupPath);
      return;
    }
    
    // Check if backup already exists
    if (await this.fileExists(this.backupPath)) {
      const { overwrite } = await inquirer.prompt([{
        type: 'confirm',
        name: 'overwrite',
        message: chalk.yellow('⚠️  Backup file already exists. Overwrite?'),
        default: false
      }]);
      if (!overwrite) {
        console.log(chalk.yellow('🛑 Backup skipped. Exiting without changes.'));
        process.exit(0);
      }
    }

    try {
      const originalConfig = await fs.readFile(this.claudeConfigPath, 'utf8');
      await fs.writeFile(this.backupPath, originalConfig, 'utf8');
      console.log(chalk.green('✅ Backup created successfully'));
      console.log(chalk.gray(`   Location: ${this.backupPath}`));
    } catch (error) {
      console.error(chalk.red('❌ Failed to create backup:'), error);
      process.exit(1);
    }
  }

  private async migrateConfiguration(): Promise<ClaudeDesktopConfig> {
    console.log(chalk.blue('🔄 Migrating MCP servers to HyperTool configuration...'));
    
    const originalConfig: ClaudeDesktopConfig = await this.readJsonFile(this.claudeConfigPath);
    
    if (!originalConfig.mcpServers) {
      console.log(chalk.yellow('⚠️  No MCP servers found in configuration.'));
      originalConfig.mcpServers = {};
    }

    const serverCount = Object.keys(originalConfig.mcpServers).length;
    
    if (this.dryRun) {
      console.log(chalk.cyan(`🔍 [DRY RUN] Would migrate ${serverCount} MCP server(s) to HyperTool configuration`));
      console.log(chalk.cyan('🔍 [DRY RUN] Would create HyperTool config at:'), this.hyperToolConfigPath);
      if (serverCount > 0) {
        console.log(chalk.cyan('🔍 [DRY RUN] Servers to migrate:'));
        Object.keys(originalConfig.mcpServers).forEach(name => {
          console.log(chalk.gray(`   - ${name}`));
        });
      }
      return originalConfig;
    }

    // Ensure HyperTool config directory exists
    const hyperToolConfigDir = join(homedir(), 'Library/Application Support/Claude');
    await this.ensureDirectoryExists(hyperToolConfigDir);

    // Copy all existing servers to HyperTool config
    const hyperToolConfig = {
      mcpServers: { ...originalConfig.mcpServers }
    };

    await this.writeJsonFile(this.hyperToolConfigPath, hyperToolConfig);
    
    console.log(chalk.green(`✅ Migrated ${serverCount} MCP server(s) to HyperTool configuration`));
    console.log(chalk.gray(`   Location: ${this.hyperToolConfigPath}`));

    return originalConfig;
  }

  private async addHyperToolProxy(originalConfig: ClaudeDesktopConfig): Promise<void> {
    console.log(chalk.blue('🔗 Adding HyperTool proxy to Claude Desktop configuration...'));
    
    if (this.dryRun) {
      console.log(chalk.cyan('🔍 [DRY RUN] Would add HyperTool proxy to Claude Desktop configuration'));
      console.log(chalk.cyan('🔍 [DRY RUN] New hypertool server configuration:'));
      console.log(chalk.gray('   {'));
      console.log(chalk.gray('     "hypertool": {'));
      console.log(chalk.gray('       "type": "stdio",'));
      console.log(chalk.gray('       "command": "npx",'));
      console.log(chalk.gray(`       "args": ["-y", "@toolprint/hypertool-mcp", "--config", "${this.hyperToolConfigPath}"]`));
      console.log(chalk.gray('     }'));
      console.log(chalk.gray('   }'));
      return;
    }
    
    // Add HyperTool as the primary MCP server
    originalConfig.mcpServers = {
      hypertool: {
        type: 'stdio',
        command: 'npx',
        args: ['-y', '@toolprint/hypertool-mcp', '--config', this.hyperToolConfigPath]
      }
    };

    await this.writeJsonFile(this.claudeConfigPath, originalConfig);
    console.log(chalk.green('✅ HyperTool proxy added to Claude Desktop configuration'));
  }

  private async promptForCleanup(): Promise<boolean> {
    console.log('');
    console.log(chalk.blue('🧹 Configuration Management Options:'));
    console.log('');
    console.log(chalk.cyan('Option 1: Automated (Recommended)'));
    console.log('  - Claude Desktop will only see HyperTool proxy');
    console.log('  - All original servers accessible through HyperTool');
    console.log('  - Cleaner configuration management');
    console.log('');
    console.log(chalk.cyan('Option 2: Manual'));
    console.log('  - Keep both HyperTool and original servers in config');
    console.log('  - You manage duplicate servers manually');
    console.log('  - More complex but gives you full control');
    console.log('');
    
    const { shouldCleanup } = await inquirer.prompt([{
      type: 'confirm',
      name: 'shouldCleanup',
      message: chalk.yellow('Would you like automated cleanup (recommended)?'),
      default: true
    }]);
    
    return shouldCleanup;
  }

  private async performCleanup(): Promise<void> {
    console.log(chalk.blue('🧹 Performing automated cleanup...'));
    
    if (this.dryRun) {
      console.log(chalk.cyan('🔍 [DRY RUN] Would clean up Claude Desktop configuration'));
      console.log(chalk.cyan('🔍 [DRY RUN] Would keep only HyperTool proxy in configuration'));
      return;
    }

    // Read current config and keep only HyperTool
    const currentConfig = await this.readJsonFile(this.claudeConfigPath);
    const cleanConfig = {
      ...currentConfig,
      mcpServers: {
        hypertool: currentConfig.mcpServers.hypertool
      }
    };

    await this.writeJsonFile(this.claudeConfigPath, cleanConfig);
    console.log(chalk.green('✅ Automated cleanup completed'));
    console.log(chalk.gray('   Claude Desktop configuration now contains only HyperTool proxy'));
  }

  private async displaySummary(): Promise<void> {
    console.log('');
    if (this.dryRun) {
      console.log(chalk.cyan('🔍 [DRY RUN] Summary of what would be done:'));
    } else {
      console.log(chalk.green('🎉 Claude Desktop integration setup complete!'));
    }
    console.log('');
    console.log(chalk.blue('📋 Summary of changes:'));

    if (this.dryRun) {
      // In dry run, read original config to show what would be migrated
      const originalConfig = await this.readJsonFile(this.claudeConfigPath);
      const serverCount = Object.keys(originalConfig.mcpServers || {}).length;

      console.log(chalk.cyan(`🔍 ${serverCount} MCP server(s) would be migrated to HyperTool configuration`));
      console.log(chalk.cyan('🔍 HyperTool proxy would be added to Claude Desktop'));
      console.log(chalk.cyan('🔍 Original configuration would be backed up'));
    } else {
      const hyperToolConfig = await this.readJsonFile(this.hyperToolConfigPath);
      const serverCount = Object.keys(hyperToolConfig.mcpServers).length;

      console.log(chalk.green(`✅ ${serverCount} MCP server(s) migrated to HyperTool configuration`));
      console.log(chalk.green('✅ HyperTool proxy added to Claude Desktop'));
      console.log(chalk.green('✅ Original configuration backed up'));
    }

    console.log('');
    console.log(chalk.blue('📁 File locations:'));
    console.log(chalk.gray(`   Claude Desktop config: ${this.claudeConfigPath}`));
    console.log(chalk.gray(`   HyperTool config: ${this.hyperToolConfigPath}`));
    console.log(chalk.gray(`   Backup: ${this.backupPath}`));

    if (!this.dryRun) {
      console.log('');
      console.log(chalk.blue('🔄 Next steps:'));
      console.log(chalk.cyan('1. Restart Claude Desktop'));
      console.log(chalk.cyan('2. Your MCP tools are now proxied through HyperTool'));
      console.log(chalk.cyan('3. Use HyperTool commands to manage toolsets'));
      console.log('');
      console.log(chalk.yellow('💡 To restore original configuration:'));
      console.log(chalk.gray(`   cp "${this.backupPath}" "${this.claudeConfigPath}"`));
    } else {
      console.log('');
      console.log(chalk.blue('🔄 To run the actual setup:'));
      console.log(chalk.cyan('npx -y @toolprint/hypertool-mcp install claude-desktop'));
    }
  }

  async run(dryRun: boolean = false): Promise<void> {
    this.dryRun = dryRun;

    try {
      console.log(chalk.blue.bold('🚀 Claude Desktop + HyperTool Integration Setup'));
      if (this.dryRun) {
        console.log(chalk.cyan.bold('🔍 [DRY RUN MODE] - No changes will be made'));
      }
      console.log('');

      // Step 1: Validate configuration
      await this.validateConfiguration();

      // Step 2: Create backup
      await this.createBackup();

      // Step 3: Migrate configuration
      const originalConfig = await this.migrateConfiguration();

      // Step 4: Add HyperTool proxy
      await this.addHyperToolProxy(originalConfig);

      // Step 5: Ask about cleanup (skip prompts in dry run)
      let shouldCleanup = true;
      if (!this.dryRun) {
        shouldCleanup = await this.promptForCleanup();
      } else {
        console.log(chalk.cyan('🔍 [DRY RUN] Would prompt for cleanup options'));
      }

      if (shouldCleanup) {
        await this.performCleanup();
      } else {
        console.log(chalk.yellow('ℹ️  Manual cleanup selected. You may have duplicate servers in your configuration.'));
      }

      // Step 6: Display summary
      await this.displaySummary();

    } catch (error) {
      console.error(chalk.red('❌ Setup failed:'), error);
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