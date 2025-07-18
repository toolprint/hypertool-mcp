/**
 * Claude Code integration setup script
 * Usage: npx -y @toolprint/hypertool-mcp --install claude-code
 */

import { promises as fs } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
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
  updateMcpConfigWithHyperTool,
  readJsonFile,
  fileExists,
  hasClaudeCodeGlobalHypertoolSlashCommands
} from '../shared/mcpSetupUtils.js';

export class ClaudeCodeSetup {
  private readonly context: SetupContext;
  private dryRun: boolean = false;

  constructor() {
    // Claude Code uses project-local configuration
    const projectDir = process.cwd();
    const mcpConfigPath = join(projectDir, '.mcp.json');
    const backupPath = join(projectDir, '.mcp.backup.json');
    const hyperToolConfigPath = join(projectDir, 'mcp.hypertool.json');

    this.context = {
      originalConfigPath: mcpConfigPath,
      backupPath,
      hyperToolConfigPath,
      dryRun: false
    };
  }

  /**
   * Check if we're in a valid project directory
   */
  private async isValidProjectDirectory(): Promise<boolean> {
    const projectDir = process.cwd();
    const hasGit = await fileExists(join(projectDir, '.git'));
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
        installSlashCommands: !hasGlobalCommands
      };
    }

    const choices = [
      {
        name: 'Update .mcp.json configuration (setup HyperTool proxy)',
        value: 'updateMcpConfig',
        checked: true
      }
    ];

    // Only offer slash command installation if not already installed globally
    if (!hasGlobalCommands) {
      choices.push({
        name: 'Install slash commands globally in ~/.claude/commands/ht/ (recommended)',
        value: 'installSlashCommandsGlobal',
        checked: true
      });
      choices.push({
        name: 'Install slash commands locally in .claude/commands/ht/',
        value: 'installSlashCommandsLocal',
        checked: false
      });
    }

    // If only one choice, auto-select it
    if (choices.length === 1) {
      return {
        updateMcpConfig: true,
        installSlashCommands: false,
        installGlobally: false
      };
    }

    const { components } = await inquirer.prompt([{
      type: 'checkbox',
      name: 'components',
      message: 'Select components to install:',
      choices,
      validate: (answers) => {
        if (answers.length === 0) {
          return 'Please select at least one component to install';
        }
        return true;
      }
    }]);

    return {
      updateMcpConfig: components.includes('updateMcpConfig'),
      installSlashCommands: components.includes('installSlashCommandsGlobal') || components.includes('installSlashCommandsLocal'),
      installGlobally: components.includes('installSlashCommandsGlobal')
    };
  }

  async run(dryRun: boolean = false): Promise<void> {
    this.dryRun = dryRun;
    this.context.dryRun = dryRun;
    const projectDir = process.cwd();

    try {
      if (this.dryRun) {
        output.info(chalk.cyan('🔍 [DRY RUN MODE] - No changes will be made'));
        output.displaySpaceBuffer(1);
      }

      // Check if we're in a valid project directory
      if (!(await this.isValidProjectDirectory())) {
        output.error('❌ Not in a project directory');
        output.warn('   Claude Code installation must be run from within a project.');
        output.info('   Please navigate to a project directory with .git or .mcp.json');
        process.exit(1);
      }

      // Step 1: Check for .mcp.json
      let mcpConfig: MCPConfig = {};
      let hasExistingConfig = false;

      if (!(await fileExists(this.context.originalConfigPath))) {
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
        output.displaySpaceBuffer(1);

        // Offer to create a basic .mcp.json
        const { createBasic } = await inquirer.prompt([{
          type: 'confirm',
          name: 'createBasic',
          message: 'Would you like to create a basic .mcp.json file?',
          default: true
        }]);

        if (createBasic) {
          const basicConfig = {
            mcpServers: {}
          };
          await fs.writeFile(this.context.originalConfigPath, JSON.stringify(basicConfig, null, 2));
          output.success('✅ Created basic .mcp.json file');
          output.info('   You can add MCP servers to this file later');
          mcpConfig = basicConfig;
          hasExistingConfig = false;
        } else {
          process.exit(0);
        }
      } else {
        hasExistingConfig = true;
        await validateMcpConfiguration(this.context.originalConfigPath);
        mcpConfig = await readJsonFile(this.context.originalConfigPath);
      }

      // Step 2: Analyze existing configuration
      const existingServers = Object.keys(mcpConfig.mcpServers || {}).filter(name => name !== 'hypertool');

      if (existingServers.length === 0 && hasExistingConfig) {
        output.warn('⚠️  No MCP servers found in .mcp.json');
        output.info('💡 You can still install Hypertool to add servers later');
        output.displaySpaceBuffer(1);
      } else if (existingServers.length > 0) {
        // Show existing servers
        output.info(`📍 Project ${projectDir.split('/').pop()} has ${existingServers.length} MCP servers: ${existingServers.join(', ')}`);
        output.displaySpaceBuffer(1);
      }

      // Check if slash commands are already installed globally
      const hasGlobalCommands = await hasClaudeCodeGlobalHypertoolSlashCommands();
      if (hasGlobalCommands) {
        output.info('✅ Global slash commands already installed in ~/.claude/commands/ht/');
        output.displaySpaceBuffer(1);
      }

      // Step 3: Let user select which components to install
      const selectedComponents = await this.promptForSetupComponents(hasGlobalCommands);

      if (!selectedComponents.updateMcpConfig && !selectedComponents.installSlashCommands) {
        output.warn('🛑 No components selected. Exiting without changes.');
        return;
      }

      if (selectedComponents.updateMcpConfig && existingServers.length > 0) {
        output.warn('⚠️  Important: This will replace ALL existing servers with Hypertool proxy.');
        output.info('   Your servers will remain accessible through Hypertool.');
        output.displaySpaceBuffer(1);
      }

      // Step 4: Get user confirmation
      const { shouldProceed } = await inquirer.prompt([{
        type: 'confirm',
        name: 'shouldProceed',
        message: chalk.yellow('Configure Claude Code?'),
        default: true
      }]);

      if (!shouldProceed) {
        output.info('Skipped Claude Code.');
        return;
      }

      output.displaySpaceBuffer(1);

      // MCP Configuration (only if selected)
      if (selectedComponents.updateMcpConfig) {
        // Create backup
        const backupSpinner = this.dryRun ? null : ora('Creating configuration backup...').start();
        await createConfigBackup(this.context);
        if (!this.dryRun) {
          backupSpinner?.succeed('Configuration backed up');
          output.success(`✅ Backup created: ${chalk.gray('.mcp.backup.json')}`);
          output.displaySpaceBuffer(1);
        }

        // Migrate servers
        const migrateSpinner = this.dryRun ? null : ora('Migrating MCP servers...').start();
        await migrateToHyperToolConfig(this.context);
        if (!this.dryRun) {
          migrateSpinner?.stop();
        }

        // Update configuration
        const updateSpinner = this.dryRun ? null : ora('Updating .mcp.json configuration...').start();
        await updateMcpConfigWithHyperTool(this.context, mcpConfig, true, this.context.hyperToolConfigPath);
        if (!this.dryRun) {
          updateSpinner?.stop();
        }
      }

      // Install slash commands (only if selected)
      const installedCommands: string[] = [];

      if (selectedComponents.installSlashCommands) {
        const commandsSpinner = this.dryRun ? null : ora('Installing slash commands...').start();

        // Determine installation directory
        const isGlobal = selectedComponents.installGlobally;
        const baseDir = isGlobal ? homedir() : projectDir;
        const claudeDir = join(baseDir, '.claude');
        const commandsDir = join(claudeDir, 'commands');
        const hyperToolCommandsDir = join(commandsDir, 'ht');

        if (this.dryRun) {
          const location = isGlobal ? '~/.claude/commands/ht/' : '.claude/commands/ht/';
          output.info(`[DRY RUN] Would install slash commands to: ${location}`);
        } else {
          commandsSpinner!.text = isGlobal ? 'Installing global slash commands...' : 'Installing local slash commands...';

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
            await fs.writeFile(filePath, content, 'utf8');
            installedCommands.push('ht:' + filename.replace('.md', ''));
          }

          commandsSpinner!.stop();
        }
      }

      // Success!
      output.displaySpaceBuffer(1);

      if (this.dryRun) {
        console.log(chalk.yellow('🔍 [DRY RUN] Installation simulation complete'));
        output.displaySpaceBuffer(1);
        output.info('No actual changes were made to your system.');
      } else {
        console.log(chalk.green('✨ Claude Code installation complete!'));
        output.displaySpaceBuffer(1);

        // Show file locations
        output.displaySubHeader('📁 Important File Locations:');
        if (selectedComponents.updateMcpConfig) {
          output.info('• Config: .mcp.json');
          output.info('• Backup: .mcp.backup.json');
          output.info('• Servers: mcp.hypertool.json');
        }
        if (selectedComponents.installSlashCommands) {
          const location = selectedComponents.installGlobally ? '~/.claude/commands/ht/' : '.claude/commands/ht/';
          output.info(`• Commands: ${location}`);
        }
        output.displaySpaceBuffer(1);

        // Next steps
        output.displaySubHeader('🎯 Next Steps:');
        if (selectedComponents.updateMcpConfig) {
          output.displayInstruction('1. Open this project in Claude Code');
          output.displayInstruction('2. Use slash commands to manage tools:');
          output.displayInstruction('   /ht:list-all-tools');
          output.displayInstruction('   /ht:new-toolset dev');
          output.displayInstruction('   /ht:list-toolsets');
        } else if (selectedComponents.installSlashCommands) {
          output.displayInstruction('1. Open this project in Claude Code');
          output.displayInstruction('2. Use the installed slash commands:');
          installedCommands.forEach(cmd => {
            output.displayInstruction(`   /${cmd}`);
          });
        }
        output.displaySpaceBuffer(1);

        // Recovery
        if (selectedComponents.updateMcpConfig) {
          output.displaySubHeader('🔄 To Restore Original Configuration:');
          output.displayTerminalInstruction('cp .mcp.backup.json .mcp.json');
          output.displaySpaceBuffer(1);
        }
      }

    } catch (error) {
      output.error('❌ Setup failed:');
      output.error(error instanceof Error ? error.message : String(error));
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
  await setup.run(options.dryRun);
}

// Run the setup if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const setup = new ClaudeCodeSetup();
  setup.run().catch(console.error);
}

