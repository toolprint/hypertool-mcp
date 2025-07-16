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

/**
 * Installation options interface
 */
interface InstallOptions {
  dryRun?: boolean;
}

/**
 * MCP configuration interface
 */
interface MCPConfig {
  mcpServers?: Record<string, any>;
  [key: string]: any;
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
  
  // Step 1: Check for .mcp.json in current directory
  output.displayHeader('🔍 Checking for Claude Code MCP configuration...');
  
  let mcpConfig: MCPConfig = {};
  
  try {
    await fs.access(mcpConfigPath);
    const configContent = await fs.readFile(mcpConfigPath, 'utf8');
    mcpConfig = JSON.parse(configContent);
    output.success(`✅ Found .mcp.json in current directory`);
    
    // Display current servers
    const serverCount = Object.keys(mcpConfig.mcpServers || {}).length;
    if (serverCount > 0) {
      output.info(`📋 Current MCP servers: ${Object.keys(mcpConfig.mcpServers || {}).join(', ')}`);
    }
  } catch (error) {
    if ((error as any).code === 'ENOENT') {
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
    } else {
      output.error(`❌ Error reading .mcp.json: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    }
  }
  
  // Step 2: Interactive prompts (skip in dry-run)
  if (!dryRun) {
    output.displaySpaceBuffer(1);
    
    // Check if HyperTool already exists
    if (mcpConfig.mcpServers?.hypertool) {
      output.warn('⚠️  HyperTool is already configured in .mcp.json');
      const { shouldContinue } = await inquirer.prompt([{
        type: 'confirm',
        name: 'shouldContinue',
        message: 'Do you want to reinstall and update the configuration?',
        default: true
      }]);
      
      if (!shouldContinue) {
        output.info('Installation cancelled.');
        process.exit(0);
      }
    } else {
      // Show what will happen
      output.displaySubHeader('This installer will:');
      output.displayInstruction(`1. Backup your current .mcp.json to .mcp.backup.json`);
      output.displayInstruction(`2. Move your ${Object.keys(mcpConfig.mcpServers || {}).length} existing MCP servers to .mcp.ht.json`);
      output.displayInstruction(`3. Configure Claude Code to use HyperTool as a proxy`);
      output.displayInstruction(`4. Install slash commands in .claude/commands/`);
      output.displaySpaceBuffer(1);
      
      const { shouldProceed } = await inquirer.prompt([{
        type: 'confirm',
        name: 'shouldProceed',
        message: 'Proceed with installation?',
        default: true
      }]);
      
      if (!shouldProceed) {
        output.info('Installation cancelled.');
        process.exit(0);
      }
    }
  }
  
  const actionText = dryRun ? 'Simulating Claude Code integration...' : 'Installing Claude Code integration...';
  const spinner = ora(actionText).start();
  
  try {
    // Step 3: Create backup of .mcp.json
    if (!dryRun) {
      spinner.text = 'Creating backup of .mcp.json...';
      try {
        await fs.copyFile(mcpConfigPath, mcpBackupPath);
        spinner.text = 'Backup created successfully';
      } catch (error) {
        spinner.fail('Could not create backup of .mcp.json');
        output.error(`❌ Failed to backup .mcp.json: ${error instanceof Error ? error.message : String(error)}`);
        output.displayInstruction('Please check file permissions and try again');
        process.exit(1);
      }
    } else {
      spinner.text = '[DRY RUN] Would create backup of .mcp.json';
    }
    // Step 4: Create .mcp.ht.json with existing servers
    if (!dryRun) {
      spinner.text = 'Creating HyperTool configuration...';
      
      // Copy existing servers (excluding hypertool itself)
      const existingServers = { ...mcpConfig.mcpServers };
      delete existingServers.hypertool;
      
      const hyperToolConfig = {
        mcpServers: existingServers
      };
      
      await fs.writeFile(hyperToolConfigPath, JSON.stringify(hyperToolConfig, null, 2), 'utf8');
      spinner.text = 'Created .mcp.ht.json with existing servers';
    } else {
      spinner.text = '[DRY RUN] Would create .mcp.ht.json with existing servers';
    }
    
    // Step 5: Update .mcp.json to add HyperTool
    if (!dryRun) {
      spinner.text = 'Updating .mcp.json with HyperTool configuration...';
      
      // Create new config with only HyperTool
      const newMcpConfig = {
        ...mcpConfig,
        mcpServers: {
          hypertool: {
            type: "stdio",
            command: "npx",
            args: ["-y", "@toolprint/hypertool-mcp", "--mcp-config", hyperToolConfigPath]
          }
        }
      };
      
      await fs.writeFile(mcpConfigPath, JSON.stringify(newMcpConfig, null, 2), 'utf8');
      spinner.text = 'Updated .mcp.json with HyperTool proxy';
    } else {
      spinner.text = '[DRY RUN] Would update .mcp.json with HyperTool configuration';
    }
    
    // Step 6: Create .claude/commands directory in current project
    const claudeDir = join(projectDir, '.claude');
    const commandsDir = join(claudeDir, 'commands');
    
    if (dryRun) {
      spinner.text = '[DRY RUN] Would create .claude/commands directory';
    } else {
      spinner.text = 'Creating .claude/commands directory...';
      await fs.mkdir(commandsDir, { recursive: true });
    }
    
    // Generate command templates
    spinner.text = 'Generating command templates...';
    const commandTemplates = await createCommandTemplates();
    
    // Write command files
    spinner.text = dryRun ? 'Checking command files...' : 'Installing command files...';
    const installedCommands: string[] = [];
    
    for (const [filename, content] of Object.entries(commandTemplates)) {
      const filePath = join(commandsDir, filename);
      
      if (dryRun) {
        // Just track it, don't log each file
      } else {
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
      
      installedCommands.push(filename.replace('.md', ''));
    }
    
    const successMessage = dryRun 
      ? 'Claude Code integration simulation completed!' 
      : 'Claude Code integration completed successfully!';
    spinner.succeed(successMessage);
    
    // Display success message using output helpers
    output.displaySpaceBuffer(1);
    const completionMessage = dryRun 
      ? '✅ Dry Run Complete!' 
      : '✅ Installation Complete!';
    output.success(completionMessage);
    output.displaySpaceBuffer(1);
    
    const locationMessage = dryRun 
      ? `📁 Commands would be installed to: ${chalk.yellow(commandsDir)}`
      : `📁 Commands installed to: ${chalk.yellow(commandsDir)}`;
    output.info(locationMessage);
    output.displaySpaceBuffer(1);
    
    // Display what was done
    if (!dryRun) {
      output.displayHeader('📦 What was installed:');
      output.success(`✅ Created backup: ${chalk.yellow('.mcp.backup.json')}`);
      output.success(`✅ Created HyperTool config: ${chalk.yellow('.mcp.ht.json')}`);
      output.success(`✅ Updated .mcp.json to use HyperTool proxy`);
      output.success(`✅ Installed ${installedCommands.length} slash commands`);
      output.displaySpaceBuffer(1);
    }
    
    output.displayHeader('🎯 Available slash commands in Claude Code:');
    installedCommands.forEach(cmd => {
      output.log(`  ${chalk.yellow('/' + cmd)}`);
    });
    output.displaySpaceBuffer(1);
    
    if (dryRun) {
      output.displaySubHeader('🔍 Dry Run Summary');
      const serverCount = Object.keys(mcpConfig.mcpServers || {}).length;
      output.info(`Would migrate ${serverCount} existing MCP server(s) to HyperTool configuration`);
      output.info(`Would install ${installedCommands.length} slash commands`);
      output.info('Run without --dry-run to perform actual installation');
      output.displaySpaceBuffer(1);
    }
    
    output.displaySubHeader('💡 Usage');
    output.displayInstruction('Claude Code will now use HyperTool as a proxy for all MCP servers');
    output.displayInstruction('Use the slash commands to manage toolsets and filter available tools');
    output.displaySpaceBuffer(1);
    
    output.displaySubHeader('📖 Next Steps');
    output.displayInstruction('1. Restart Claude Code to load the new configuration');
    output.displayInstruction('2. Use slash commands to create and manage toolsets');
    output.displayInstruction('3. Your existing MCP servers are still available through HyperTool');
    output.displaySpaceBuffer(1);
    
    if (!dryRun) {
      output.displaySubHeader('🔄 Restore Original Configuration');
      output.displayInstruction('To revert to your original .mcp.json:');
      output.displayTerminalInstruction(`cp .mcp.backup.json .mcp.json`);
      output.displaySpaceBuffer(1);
    }
    
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

