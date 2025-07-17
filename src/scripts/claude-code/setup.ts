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
 * Setup components that can be selected
 */
interface SetupComponents {
  updateMcpConfig: boolean;
  installSlashCommands: boolean;
}

/**
 * Prompt user to select which setup components to install
 */
async function promptForSetupComponents(dryRun: boolean): Promise<SetupComponents> {
  if (dryRun) {
    // In dry run mode, default to all components selected
    return {
      updateMcpConfig: true,
      installSlashCommands: true
    };
  }

  output.displaySpaceBuffer(1);
  output.displaySubHeader('🔧 Setup Components');
  output.displaySpaceBuffer(1);

  const { components } = await inquirer.prompt([{
    type: 'checkbox',
    name: 'components',
    message: 'Select components to install:',
    choices: [
      {
        name: 'Update .mcp.json configuration (setup HyperTool proxy)',
        value: 'updateMcpConfig',
        checked: true
      },
      {
        name: 'Install slash commands in .claude/commands/hypertool/',
        value: 'installSlashCommands', 
        checked: true
      }
    ],
    validate: (answers) => {
      if (answers.length === 0) {
        return 'Please select at least one component to install';
      }
      return true;
    }
  }]);

  return {
    updateMcpConfig: components.includes('updateMcpConfig'),
    installSlashCommands: components.includes('installSlashCommands')
  };
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

  // Step 3: Let user select which components to install
  const selectedComponents = await promptForSetupComponents(dryRun);
  
  if (!selectedComponents.updateMcpConfig && !selectedComponents.installSlashCommands) {
    output.warn('🛑 No components selected. Exiting without changes.');
    process.exit(0);
  }
  
  const actionText = dryRun ? 'Simulating Claude Code integration...' : 'Installing Claude Code integration...';
  const spinner = ora(actionText).start();
  
  try {
    let shouldCleanup = false;
    
    // Steps 3-6: MCP Configuration (only if selected)
    if (selectedComponents.updateMcpConfig) {
      // Step 3: Create backup of .mcp.json
      spinner.text = 'Creating backup...';
      await createConfigBackup(context);
      
      // Step 4: Migrate to HyperTool configuration
      spinner.text = 'Migrating servers...';
      await migrateToHyperToolConfig(context);
      
      // Step 5: Ask about cleanup options
      spinner.stop();
      shouldCleanup = await promptForCleanupOptions(context);
      spinner.start('Updating configuration...');
      
      // Step 6: Update .mcp.json to add HyperTool
      await updateMcpConfigWithHyperTool(context, mcpConfig, shouldCleanup, '.mcp.ht.json');
    }
    
    // Step 7: Install slash commands (only if selected)
    const installedCommands: string[] = [];
    
    if (selectedComponents.installSlashCommands) {
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
      
      // Clean existing commands and install fresh ones
      spinner.text = dryRun ? 'Checking command files...' : 'Installing command files...';
      
      if (!dryRun) {
        // Clean existing hypertool commands directory
        try {
          await fs.rmdir(hyperToolCommandsDir, { recursive: true });
        } catch {
          // Directory doesn't exist, continue
        }
        
        // Recreate the directory
        await fs.mkdir(hyperToolCommandsDir, { recursive: true });
      }
      
      // Write all command files
      for (const [filename, content] of Object.entries(commandTemplates)) {
        const filePath = join(hyperToolCommandsDir, filename);
        
        if (!dryRun) {
          await fs.writeFile(filePath, content, 'utf8');
        }
        
        installedCommands.push('hypertool:' + filename.replace('.md', ''));
      }
    }
    
    const successMessage = dryRun 
      ? 'Claude Code integration simulation completed!' 
      : 'Claude Code integration completed successfully!';
    spinner.succeed(successMessage);
    
    // Display setup summary (only if MCP config was updated)
    if (selectedComponents.updateMcpConfig) {
      await displaySetupSummary(context, shouldCleanup, 'Claude Code');
    }
    
    // Display Claude Code specific information
    if (!dryRun) {
      output.displaySpaceBuffer(1);
      output.displaySubHeader('📋 Components Installed');
      
      if (selectedComponents.updateMcpConfig) {
        output.success('✅ MCP configuration updated with HyperTool proxy');
      } else {
        output.info('⏭️  MCP configuration update skipped');
      }
      
      if (selectedComponents.installSlashCommands) {
        output.success('✅ Slash commands installed');
        output.displaySpaceBuffer(1);
        
        output.displaySubHeader('🎯 Available slash commands in Claude Code:');
        installedCommands.forEach(cmd => {
          output.displayInstruction(`/${cmd}`);
        });
        output.displaySpaceBuffer(1);
        
        output.displaySubHeader('📁 Command Location');
        output.displayInstruction('Commands are installed in: .claude/commands/hypertool/');
        output.displayInstruction('This avoids conflicts with your existing commands');
      } else {
        output.info('⏭️  Slash command installation skipped');
      }
      
      output.displaySpaceBuffer(1);
    }
    
    output.displaySubHeader('💡 Usage');
    if (selectedComponents.updateMcpConfig) {
      output.displayInstruction('Claude Code will now use HyperTool as a proxy for all MCP servers');
    }
    if (selectedComponents.installSlashCommands) {
      output.displayInstruction('Use the slash commands to manage toolsets and filter available tools');
    }
    if (!selectedComponents.updateMcpConfig && !selectedComponents.installSlashCommands) {
      output.displayInstruction('Run the installer again to configure MCP or install slash commands');
    }
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

