/**
 * Claude Code Integration Setup Script
 * Installs individual command files for each MCP tool in .claude/commands/
 */

import { promises as fs } from 'fs';
import { join } from 'path';
import chalk from 'chalk';
import ora from 'ora';
import { createCommandTemplates } from './utils.js';
import { output } from '../../logging/output.js';

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
  const actionText = dryRun ? 'Simulating Claude Code integration commands installation...' : 'Installing Claude Code integration commands...';
  const spinner = ora(actionText).start();
  
  try {
    // Create .claude/commands directory in current project
    const projectDir = process.cwd();
    const claudeDir = join(projectDir, '.claude');
    const commandsDir = join(claudeDir, 'commands');
    
    if (dryRun) {
      spinner.text = 'Checking .claude/commands directory...';
      output.info(`[DRY RUN] Would create directory: ${commandsDir}`);
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
        output.info(`[DRY RUN] Would install: ${filename}`);
        try {
          await fs.access(filePath);
          output.warn(`[DRY RUN] File exists, would backup: ${filename}.backup`);
        } catch {
          output.info(`[DRY RUN] New file would be created: ${filename}`);
        }
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
      ? 'Claude Code integration commands simulation completed!' 
      : 'Claude Code integration commands installed successfully!';
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
    
    output.displayHeader('🎯 Available slash commands in Claude Code:');
    installedCommands.forEach(cmd => {
      output.log(`  ${chalk.yellow('/' + cmd)}`);
    });
    output.displaySpaceBuffer(1);
    
    if (dryRun) {
      output.displaySubHeader('🔍 Dry Run Summary');
      output.displayInstruction('No files were actually created or modified');
      output.displayInstruction('Run without --dry-run to perform actual installation');
      output.displaySpaceBuffer(1);
    }
    
    output.displaySubHeader('💡 Usage');
    output.displayInstruction('Open Claude Code and use any of the slash commands above');
    output.displayTerminalInstruction('/list-available-tools');
    
    output.displaySubHeader('📖 Next Steps');
    output.displayInstruction('1. Start HyperTool MCP server:');
    output.displayTerminalInstruction('npx @toolprint/hypertool-mcp');
    output.displayInstruction('2. Open Claude Code in this project directory');
    output.displayInstruction('3. Use slash commands to manage your toolsets');
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

