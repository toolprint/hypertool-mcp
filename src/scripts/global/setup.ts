/**
 * Global installation setup script
 * Installs Hypertool for all detected applications
 * Usage: npx -y @toolprint/hypertool-mcp --install
 */

import { promises as fs } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import { displayBanner, output } from '../../logging/output.js';
import { fileExists, hasClaudeCodeGlobalHypertoolSlashCommands } from '../shared/mcpSetupUtils.js';
import { ClaudeDesktopSetup } from '../claude-desktop/setup.js';
import { CursorSetup } from '../cursor/setup.js';
import { ClaudeCodeSetup } from '../claude-code/setup.js';
import { createCommandTemplates } from '../claude-code/utils.js';

interface DetectedApp {
  name: string;
  displayName: string;
  configPath: string;
  setupClass: new () => { run: (dryRun: boolean) => Promise<void> };
}

export class GlobalSetup {
  private dryRun: boolean = false;

  /**
   * Detect installed applications
   */
  private async detectInstalledApps(): Promise<DetectedApp[]> {
    const apps: DetectedApp[] = [];

    // Check Claude Code first (if in a project directory)
    const currentDir = process.cwd();
    const hasGit = await fileExists(join(currentDir, '.git'));
    const hasMcpJson = await fileExists(join(currentDir, '.mcp.json'));
    if (hasGit || hasMcpJson) {
      apps.push({
        name: 'claude-code',
        displayName: '🤖 Claude Code (current project)',
        configPath: join(currentDir, '.mcp.json'),
        setupClass: ClaudeCodeSetup
      });
    }

    // Check Claude Desktop (macOS)
    const claudeDesktopPath = join(homedir(), 'Library/Application Support/Claude/claude_desktop_config.json');
    if (await fileExists(claudeDesktopPath)) {
      apps.push({
        name: 'claude-desktop',
        displayName: '🖥️ Claude Desktop',
        configPath: claudeDesktopPath,
        setupClass: ClaudeDesktopSetup
      });
    }

    // Check Cursor
    const cursorPath = join(homedir(), '.cursor/mcp.json');
    if (await fileExists(cursorPath)) {
      apps.push({
        name: 'cursor',
        displayName: '✏️ Cursor',
        configPath: cursorPath,
        setupClass: CursorSetup
      });
    }

    return apps;
  }

  async run(dryRun: boolean = false): Promise<void> {
    this.dryRun = dryRun;

    try {
      // Clear terminal at the beginning
      output.clearTerminal();
      displayBanner()

      // Welcome banner
      output.displayHeader('🚀 Hypertool Global Installation')

      if (this.dryRun) {
        output.info(chalk.cyan('🔍 [DRY RUN MODE] - No changes will be made'));
        output.displaySpaceBuffer(1);
      }

      // Step 1: Detect installed applications
      const detectedApps: DetectedApp[] = await this.detectInstalledApps();

      if (detectedApps.length === 0) {
        output.warn('⚠️  No supported applications detected');
        output.displaySpaceBuffer(1);
        output.displaySubHeader('Supported applications:');
        output.displayInstruction('• Claude Code (in project directory)');
        output.displayInstruction('• Claude Desktop (macOS)');
        output.displayInstruction('• Cursor IDE');
        output.displaySpaceBuffer(1);
        output.info('💡 Install one of these applications and run the installer again');
        return;
      }

      // Step 2: Show detected applications
      output.displaySubHeader('🔍 Detected Applications:');
      output.displaySpaceBuffer(1);
      detectedApps.forEach(app => {
        output.info(`✅ ${app.displayName}`);
        output.displayInstruction(`   Config: ${app.configPath}`);
      });
      output.displaySpaceBuffer(1);

      // Step 3: Check for global slash commands
      const hasGlobalCommands = await hasClaudeCodeGlobalHypertoolSlashCommands();
      let shouldInstallGlobalCommands = false;

      if (hasGlobalCommands) {
        output.info('✅ Global CC slash commands already installed in ~/.claude/commands/ht/');
        output.displaySpaceBuffer(1);
      } else {
        output.warn('⚠️  Global slash commands not found');
        output.displaySpaceBuffer(1);

        const { installCommands } = await inquirer.prompt([{
          type: 'confirm',
          name: 'installCommands',
          message: chalk.yellow('Install global slash commands for Claude Code? (recommended)'),
          default: true
        }]);

        shouldInstallGlobalCommands = installCommands;
        output.displaySpaceBuffer(1);
      }

      // Step 4: Get user confirmation
      const { shouldProceed } = await inquirer.prompt([{
        type: 'confirm',
        name: 'shouldProceed',
        message: chalk.yellow(`Install Hypertool for ${detectedApps.length} application(s)?`),
        default: true
      }]);

      if (!shouldProceed) {
        output.info('Installation cancelled.');
        return;
      }

      output.displaySpaceBuffer(1);


      // Step 5: Install global slash commands if needed
      if (shouldInstallGlobalCommands) {
        if (this.dryRun) {
          output.info('[DRY RUN] Would install global slash commands to: ~/.claude/commands/ht/');
        } else {
          const commandsSpinner = ora('Installing global slash commands...').start();

          const globalCommandsDir = join(homedir(), '.claude/commands/ht');

          // Clean existing commands and install fresh ones
          try {
            await fs.rm(globalCommandsDir, { recursive: true, force: true });
          } catch {
            // Directory doesn't exist, continue
          }

          // Create directory
          await fs.mkdir(globalCommandsDir, { recursive: true });

          // Generate command templates
          const commandTemplates = await createCommandTemplates();

          // Write all command files
          for (const [filename, content] of Object.entries(commandTemplates)) {
            const filePath = join(globalCommandsDir, filename);
            await fs.writeFile(filePath, content, 'utf8');
          }

          commandsSpinner.succeed('Global slash commands installed');
          output.displaySpaceBuffer(1);
        }
      }

      // Step 6: Run individual setup scripts
      const results: { app: string; success: boolean; error?: string }[] = [];

      for (const app of detectedApps) {
        // Add separator between apps
        output.displaySeparator();
        output.displaySpaceBuffer(1);

        // // Display app header with typewriter effect
        // const headerEmoji = app.name === 'claude-code' ? '📝' :
        //   app.name === 'claude-desktop' ? '🖥️' :
        //     app.name === 'cursor' ? '✏️' : '📦';

        // const headerText = `${headerEmoji} ${app.displayName}`;

        if (this.dryRun) {
          await output.displayHeader(`[DRY RUN] ${app.displayName}`);
        } else {
          await output.displayHeader(app.displayName);
        }
        output.displaySpaceBuffer(1);

        try {
          const setup = new app.setupClass();
          await setup.run(this.dryRun);

          results.push({ app: app.displayName, success: true });
        } catch (error) {
          results.push({
            app: app.displayName,
            success: false,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }

      // Success summary
      output.displaySpaceBuffer(1);

      if (this.dryRun) {
        console.log(chalk.yellow('🔍 [DRY RUN] Installation simulation complete'));
        output.displaySpaceBuffer(1);
        output.info('No actual changes were made to your system.');
        output.displaySpaceBuffer(1);

        // Show what would have happened
        output.displaySubHeader('📊 What would have been installed:');
        results.forEach(result => {
          output.info(`• ${result.app}`);
        });
        if (shouldInstallGlobalCommands) {
          output.info('• Global slash commands in ~/.claude/commands/ht/');
        }
      } else {
        console.log(chalk.green('✨ Global installation complete!'));
        output.displaySpaceBuffer(1);

        // Show results
        output.displaySubHeader('📊 Installation Results:');
        results.forEach(result => {
          if (result.success) {
            output.success(`✅ ${result.app}`);
          } else {
            output.error(`❌ ${result.app}: ${result.error}`);
          }
        });

        if (shouldInstallGlobalCommands) {
          output.success('✅ Global slash commands');
        }
        output.displaySpaceBuffer(1);

        // Next steps
        const successfulApps = results.filter(r => r.success).length;
        if (successfulApps > 0) {
          output.displaySubHeader('🎯 Next Steps:');
          output.displayInstruction('1. Restart the configured applications');
          output.displayInstruction('2. In Claude Code, use slash commands like:');
          output.displayInstruction('   /ht:list-all-tools');
          output.displayInstruction('   /ht:new-toolset dev');
          output.displayInstruction('3. In other apps, use the Hypertool tools directly');
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

// Run the setup if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const setup = new GlobalSetup();
  setup.run().catch(console.error);
}