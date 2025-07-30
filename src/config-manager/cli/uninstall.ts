/**
 * CLI command for uninstall operations
 */

import { Command } from 'commander';
import inquirer from 'inquirer';
import { semantic } from '../../utils/theme.js';
import { ConfigurationManager } from '../index.js';
import { output } from '../../utils/output.js';

/**
 * Get human-readable time ago string
 */
function getTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMinutes < 1) {
    return 'just now';
  } else if (diffMinutes < 60) {
    return `${diffMinutes} minute${diffMinutes === 1 ? '' : 's'} ago`;
  } else if (diffHours < 24) {
    return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
  } else if (diffDays < 7) {
    return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
  } else {
    const diffWeeks = Math.floor(diffDays / 7);
    return `${diffWeeks} week${diffWeeks === 1 ? '' : 's'} ago`;
  }
}

export function createUninstallCommand(): Command {
  const uninstall = new Command('uninstall');
  
  uninstall
    .description('Uninstall HyperTool from all applications and restore original configurations')
    .option('--force', 'Skip confirmation prompts')
    .action(async (options) => {
      try {
        const configManager = new ConfigurationManager();
        await configManager.initialize();

        // Check for available backups
        const backups = await configManager.listBackups();
        if (backups.length === 0) {
          output.error('❌ No backups available for restoration.');
          output.warn('Cannot uninstall without a backup to restore from.');
          process.exit(1);
        }

        // Show backup info
        const latestBackup = backups[0];
        const backupDate = new Date(latestBackup.timestamp);
        const timeAgo = getTimeAgo(backupDate);
        const appCount = Object.keys(latestBackup.metadata.applications).length;
        
        output.displaySubHeader('📋 Using latest backup for restoration:');
        output.displayInstruction(`• Backup from: ${backupDate.toLocaleString()}`);
        output.displayInstruction(`• Contains: ${latestBackup.metadata.total_servers} servers from ${appCount} applications`);
        output.displayInstruction(`• Created: ${timeAgo}`);
        output.displaySpaceBuffer(1);

        // Show what will be uninstalled
        output.displaySubHeader('This will:');
        output.displayInstruction('1. Remove HyperTool proxy from all applications');
        output.displayInstruction('2. Restore original MCP configurations from backup');
        output.displayInstruction('3. Keep your backup files for future reference');
        output.displaySpaceBuffer(1);

        // Confirm unless forced
        if (!options.force) {
          const { confirm } = await inquirer.prompt([
            {
              type: 'confirm',
              name: 'confirm',
              message: semantic.messageError('⚠️  Are you sure you want to uninstall HyperTool?'),
              default: false
            }
          ]);

          if (!confirm) {
            output.info('Uninstall cancelled.');
            return;
          }
        }

        output.info('🔄 Uninstalling HyperTool...');
        
        await configManager.uninstall();
        
        output.displaySpaceBuffer(1);
        output.success('✅ HyperTool uninstalled successfully!');
        output.info('All applications have been restored to their original configurations.');
        
        output.displaySpaceBuffer(1);
        output.displaySubHeader('📋 Post-uninstall notes:');
        output.displayInstruction('• Restart affected applications to apply changes');
        output.displayInstruction('• Your backup files remain in ~/.toolprint/hypertool-mcp/backups/');
        output.displayInstruction('• You can reinstall HyperTool at any time');
        
      } catch (error) {
        output.error('❌ Uninstall failed:');
        output.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });
  
  return uninstall;
}