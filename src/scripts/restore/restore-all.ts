#!/usr/bin/env node

/**
 * Restore script to revert all Hypertool installations
 * This helps with testing the installer by cleanly resetting to pre-installation state
 * 
 * Usage: npm run restore
 *        npx tsx src/scripts/restore/restore-all.ts
 *        npx tsx src/scripts/restore/restore-all.ts --dry-run
 */

import { promises as fs } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import chalk from 'chalk';
import { Command } from 'commander';
import { output } from '../../logging/output.js';
import { fileExists } from '../shared/mcpSetupUtils.js';

interface RestoreResult {
  app: string;
  success: boolean;
  error?: string;
  actions?: string[];
}

export class RestoreAll {
  private dryRun: boolean = false;
  private results: RestoreResult[] = [];

  /**
   * Restore Claude Desktop configuration
   */
  private async restoreClaudeDesktop(): Promise<RestoreResult> {
    const result: RestoreResult = {
      app: 'Claude Desktop',
      success: false,
      actions: []
    };

    try {
      const configPath = join(homedir(), 'Library/Application Support/Claude/claude_desktop_config.json');
      const backupPath = join(homedir(), 'Library/Application Support/Claude/claude_desktop_config.backup.json');
      const hyperToolPath = join(homedir(), 'Library/Application Support/Claude/mcp.hypertool.json');

      // Check if backup exists
      if (await fileExists(backupPath)) {
        if (this.dryRun) {
          result.actions!.push(`[DRY RUN] Would restore: ${backupPath} → ${configPath}`);
        } else {
          const backupContent = await fs.readFile(backupPath, 'utf8');
          await fs.writeFile(configPath, backupContent, 'utf8');
          result.actions!.push(`Restored configuration from backup`);
        }

        // Remove backup file
        if (this.dryRun) {
          result.actions!.push(`[DRY RUN] Would remove backup: ${backupPath}`);
        } else {
          await fs.unlink(backupPath);
          result.actions!.push(`Removed backup file`);
        }
      } else {
        result.actions!.push('No backup found to restore');
      }

      // Remove hypertool config
      if (await fileExists(hyperToolPath)) {
        if (this.dryRun) {
          result.actions!.push(`[DRY RUN] Would remove: ${hyperToolPath}`);
        } else {
          await fs.unlink(hyperToolPath);
          result.actions!.push(`Removed mcp.hypertool.json`);
        }
      }

      result.success = true;
    } catch (error) {
      result.error = error instanceof Error ? error.message : String(error);
    }

    return result;
  }

  /**
   * Restore Cursor configuration
   */
  private async restoreCursor(): Promise<RestoreResult> {
    const result: RestoreResult = {
      app: 'Cursor',
      success: false,
      actions: []
    };

    try {
      const configPath = join(homedir(), '.cursor/mcp.json');
      const backupPath = join(homedir(), '.cursor/mcp.backup.json');
      const hyperToolPath = join(homedir(), '.cursor/mcp.hypertool.json');

      // Check if backup exists
      if (await fileExists(backupPath)) {
        if (this.dryRun) {
          result.actions!.push(`[DRY RUN] Would restore: ${backupPath} → ${configPath}`);
        } else {
          const backupContent = await fs.readFile(backupPath, 'utf8');
          await fs.writeFile(configPath, backupContent, 'utf8');
          result.actions!.push(`Restored configuration from backup`);
        }

        // Remove backup file
        if (this.dryRun) {
          result.actions!.push(`[DRY RUN] Would remove backup: ${backupPath}`);
        } else {
          await fs.unlink(backupPath);
          result.actions!.push(`Removed backup file`);
        }
      } else {
        result.actions!.push('No backup found to restore');
      }

      // Remove hypertool config
      if (await fileExists(hyperToolPath)) {
        if (this.dryRun) {
          result.actions!.push(`[DRY RUN] Would remove: ${hyperToolPath}`);
        } else {
          await fs.unlink(hyperToolPath);
          result.actions!.push(`Removed mcp.hypertool.json`);
        }
      }

      result.success = true;
    } catch (error) {
      result.error = error instanceof Error ? error.message : String(error);
    }

    return result;
  }

  /**
   * Restore Claude Code configuration (current project)
   */
  private async restoreClaudeCode(): Promise<RestoreResult> {
    const result: RestoreResult = {
      app: 'Claude Code (current project)',
      success: false,
      actions: []
    };

    try {
      const projectDir = process.cwd();
      const configPath = join(projectDir, '.mcp.json');
      const backupPath = join(projectDir, '.mcp.backup.json');
      const hyperToolPath = join(projectDir, 'mcp.hypertool.json');
      const localCommandsPath = join(projectDir, '.claude/commands/ht');

      // Check if this is a project with MCP config
      if (!(await fileExists(configPath))) {
        result.actions!.push('No .mcp.json found in current directory');
        result.success = true;
        return result;
      }

      // Check if backup exists
      if (await fileExists(backupPath)) {
        if (this.dryRun) {
          result.actions!.push(`[DRY RUN] Would restore: ${backupPath} → ${configPath}`);
        } else {
          const backupContent = await fs.readFile(backupPath, 'utf8');
          await fs.writeFile(configPath, backupContent, 'utf8');
          result.actions!.push(`Restored configuration from backup`);
        }

        // Remove backup file
        if (this.dryRun) {
          result.actions!.push(`[DRY RUN] Would remove backup: ${backupPath}`);
        } else {
          await fs.unlink(backupPath);
          result.actions!.push(`Removed backup file`);
        }
      } else {
        result.actions!.push('No backup found to restore');
      }

      // Remove hypertool config
      if (await fileExists(hyperToolPath)) {
        if (this.dryRun) {
          result.actions!.push(`[DRY RUN] Would remove: ${hyperToolPath}`);
        } else {
          await fs.unlink(hyperToolPath);
          result.actions!.push(`Removed mcp.hypertool.json`);
        }
      }

      // Remove local slash commands
      if (await fileExists(localCommandsPath)) {
        if (this.dryRun) {
          result.actions!.push(`[DRY RUN] Would remove: ${localCommandsPath}`);
        } else {
          await fs.rm(localCommandsPath, { recursive: true, force: true });
          result.actions!.push(`Removed local slash commands`);
        }
      }

      result.success = true;
    } catch (error) {
      result.error = error instanceof Error ? error.message : String(error);
    }

    return result;
  }

  /**
   * Remove global slash commands
   */
  private async removeGlobalCommands(): Promise<RestoreResult> {
    const result: RestoreResult = {
      app: 'Global Slash Commands',
      success: false,
      actions: []
    };

    try {
      const globalCommandsPath = join(homedir(), '.claude/commands/ht');

      if (await fileExists(globalCommandsPath)) {
        if (this.dryRun) {
          result.actions!.push(`[DRY RUN] Would remove: ${globalCommandsPath}`);
        } else {
          await fs.rm(globalCommandsPath, { recursive: true, force: true });
          result.actions!.push(`Removed global slash commands`);
        }
      } else {
        result.actions!.push('No global commands found');
      }

      result.success = true;
    } catch (error) {
      result.error = error instanceof Error ? error.message : String(error);
    }

    return result;
  }

  async run(dryRun: boolean = false): Promise<void> {
    this.dryRun = dryRun;

    try {
      // Welcome banner
      console.log(chalk.red(`
╔══════════════════════════════════════════╗
║       🔄 Hypertool Restore Utility       ║
║     Revert All Installations to Original ║
╚══════════════════════════════════════════╝
      `));

      if (this.dryRun) {
        output.info(chalk.cyan('🔍 [DRY RUN MODE] - No changes will be made'));
        output.displaySpaceBuffer(1);
      }

      output.warn('⚠️  This will restore all applications to their pre-Hypertool state');
      output.displaySpaceBuffer(1);

      // Perform all restorations
      output.displaySubHeader('Restoring configurations...');
      output.displaySpaceBuffer(1);

      // Restore each application
      const claudeDesktopResult = await this.restoreClaudeDesktop();
      this.results.push(claudeDesktopResult);
      
      const cursorResult = await this.restoreCursor();
      this.results.push(cursorResult);
      
      const claudeCodeResult = await this.restoreClaudeCode();
      this.results.push(claudeCodeResult);
      
      const globalCommandsResult = await this.removeGlobalCommands();
      this.results.push(globalCommandsResult);

      // Display results
      output.displaySpaceBuffer(1);
      output.displaySubHeader('📊 Restoration Results:');
      output.displaySpaceBuffer(1);

      for (const result of this.results) {
        if (result.success) {
          output.success(`✅ ${result.app}`);
          if (result.actions && result.actions.length > 0) {
            result.actions.forEach(action => {
              output.info(`   ${action}`);
            });
          }
        } else {
          output.error(`❌ ${result.app}: ${result.error}`);
        }
        output.displaySpaceBuffer(1);
      }

      if (this.dryRun) {
        console.log(chalk.yellow('🔍 [DRY RUN] Restoration simulation complete'));
        output.info('No actual changes were made to your system.');
      } else {
        console.log(chalk.green('✨ Restoration complete!'));
        output.displaySpaceBuffer(1);
        output.info('All Hypertool installations have been reverted.');
        output.info('You can now run the installer again for testing.');
      }

    } catch (error) {
      output.error('❌ Restoration failed:');
      output.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  }
}

// CLI setup
const program = new Command();

program
  .name('restore-all')
  .description('Restore all applications to pre-Hypertool state')
  .option('--dry-run', 'Show what would be restored without making changes')
  .action(async (options) => {
    const restore = new RestoreAll();
    await restore.run(options.dryRun);
  });

// Run the CLI
program.parse();