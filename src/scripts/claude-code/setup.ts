/**
 * Claude Code Integration Setup Script
 * Installs individual command files for each MCP tool in .claude/commands/
 */

import { promises as fs } from 'fs';
import { join } from 'path';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import { createCommandTemplates } from './utils.js';
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
  displaySetupPlan,
  fileExists
} from '../shared/mcpSetupUtils.js';

/**
 * Installation options interface
 */
interface InstallOptions {
  dryRun?: boolean;
}

/**
 * Main installation function
 */
export async function installClaudeCodeCommands(options: InstallOptions = {}): Promise<void> {
  const { dryRun = false } = options;
  const projectDir = process.cwd();
  const mcpConfigPath = join(projectDir, '.mcp.json');
  const mcpBackupPath = join(projectDir, '.mcp.backup.json');
  const hyperToolConfigPath = join(projectDir, '.mcp.ht.json');
  
  const context: SetupContext = {
    originalConfigPath: mcpConfigPath,
    backupPath: mcpBackupPath,
    hyperToolConfigPath,
    dryRun
  };

  // Step 1: Check for .mcp.json in current directory
  let mcpConfig: MCPConfig = {};
  
  try {
    if (!(await fileExists(mcpConfigPath))) {
      output.warn(`⚠️  No .mcp.json found in current directory`);
      output.info(`📁 Current directory: ${chalk.yellow(projectDir)}`);
      output.displaySpaceBuffer(1);
      output.displaySubHeader('To use HyperTool with Claude Code:');
      output.displayInstruction('1. Create a .mcp.json file in your project root');
      output.displayInstruction('2. Add your MCP server configurations');
      output.displayInstruction('3. Run this installer again');
      output.displaySpaceBuffer(1);
      output.displaySubHeader('Example .mcp.json:');
      output.displayTerminalInstruction(`{
  "mcpServers": {
    "git": {
      "type": "stdio",
      "command": "git-mcp-server"
    }
  }
}`);
      process.exit(1);
    }

    await validateMcpConfiguration(mcpConfigPath);
    
    const configContent = await fs.readFile(mcpConfigPath, 'utf8');
    mcpConfig = JSON.parse(configContent);
    
    // Display current servers
    const serverCount = Object.keys(mcpConfig.mcpServers || {}).length;
    if (serverCount > 0) {
      output.info(`📋 Current MCP servers: ${Object.keys(mcpConfig.mcpServers || {}).join(', ')}`);
    }
  } catch (error) {
    output.error(`❌ Error reading .mcp.json: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
  
  // Step 2: Get user consent for the setup plan
  const shouldProceed = await displaySetupPlan(context, mcpConfig, 'Claude Code');
  if (!shouldProceed) {
    process.exit(0);
  }
  
  const actionText = dryRun ? 'Simulating Claude Code integration...' : 'Installing Claude Code integration...';
  const spinner = ora(actionText).start();
  
  try {
    // Step 3: Create backup of .mcp.json
    spinner.text = 'Creating backup...';
    await createConfigBackup(context);
    
    // Step 4: Migrate to HyperTool configuration
    spinner.text = 'Migrating servers...';
    await migrateToHyperToolConfig(context);
    
    // Step 5: Ask about cleanup options
    spinner.stop();
    const shouldCleanup = await promptForCleanupOptions(context);
    spinner.start('Updating configuration...');
    
    // Step 6: Update .mcp.json to add HyperTool
    await updateMcpConfigWithHyperTool(context, mcpConfig, shouldCleanup, '.mcp.ht.json');
    
    // Step 7: Create .claude/commands/hypertool directory and install slash commands
    const claudeDir = join(projectDir, '.claude');
    const commandsDir = join(claudeDir, 'commands');
    const hyperToolCommandsDir = join(commandsDir, 'hypertool');
    
    if (dryRun) {
      spinner.text = '[DRY RUN] Would create .claude/commands/hypertool directory';
    } else {
      spinner.text = 'Creating .claude/commands/hypertool directory...';
      await fs.mkdir(hyperToolCommandsDir, { recursive: true });
    }
    
    // Generate command templates
    spinner.text = 'Generating command templates...';
    const commandTemplates = await createCommandTemplates();
    
    // Write command files
    spinner.text = dryRun ? 'Checking command files...' : 'Installing command files...';
    const installedCommands: string[] = [];
    
    for (const [filename, content] of Object.entries(commandTemplates)) {
      const filePath = join(hyperToolCommandsDir, filename);
      
      if (!dryRun) {
        // Handle existing files gracefully
        try {
          await fs.access(filePath);
          // File exists, create backup
          await fs.copyFile(filePath, `${filePath}.backup`);
          spinner.text = `Backing up existing ${filename}...`;
        } catch {
          // File doesn't exist, continue
        }
        
        await fs.writeFile(filePath, content, 'utf8');
      }
      
      installedCommands.push('hypertool:' + filename.replace('.md', ''));
    }
    
    const successMessage = dryRun 
      ? 'Claude Code integration simulation completed!' 
      : 'Claude Code integration completed successfully!';
    spinner.succeed(successMessage);
    
    // Display setup summary
    await displaySetupSummary(context, shouldCleanup, 'Claude Code');
    
    // Display Claude Code specific information
    if (!dryRun) {
      output.displayHeader('🎯 Available slash commands in Claude Code:');
      installedCommands.forEach(cmd => {
        output.displayInstruction(`/${cmd}`);
      });
      output.displaySpaceBuffer(1);
      
      output.displaySubHeader('📁 Command Location');
      output.displayInstruction('Commands are installed in: .claude/commands/hypertool/');
      output.displayInstruction('This avoids conflicts with your existing commands');
      output.displaySpaceBuffer(1);
    }
    
    output.displaySubHeader('💡 Usage');
    output.displayInstruction('Claude Code will now use HyperTool as a proxy for all MCP servers');
    output.displayInstruction('Use the slash commands to manage toolsets and filter available tools');
    output.displaySpaceBuffer(1);
    
    output.displaySubHeader('🔧 Installation Commands');
    output.displayInstruction('Full command:');
    output.displayTerminalInstruction('npx @toolprint/hypertool-mcp install claude-code');
    output.displayInstruction('Short form:');
    output.displayTerminalInstruction('npx @toolprint/hypertool-mcp install cc');
    output.displayInstruction('Dry run:');
    output.displayTerminalInstruction('npx @toolprint/hypertool-mcp install claude-code --dry-run');
    output.displaySpaceBuffer(1);
    
  } catch (error) {
    spinner.fail('Failed to install Claude Code integration commands');
    output.displaySpaceBuffer(1);
    output.error('❌ Error: ' + (error instanceof Error ? error.message : String(error)));
    output.displaySpaceBuffer(1);
    
    output.displaySubHeader('💡 Troubleshooting');
    output.displayInstruction('• Check file permissions for current directory');
    output.displayInstruction('• Ensure you have write access to the project directory');
    output.displayInstruction('• Run from within a project directory where you want Claude Code integration');
    output.displaySpaceBuffer(1);
    
    process.exit(1);
  }
}

