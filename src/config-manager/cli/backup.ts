/**
 * CLI command for backup operations
 */

import { Command } from 'commander';
import inquirer from 'inquirer';
import { theme, semantic } from '../../utils/theme.js';
import { ConfigurationManager } from '../index.js';
import { output } from '../../utils/output.js';

export function createBackupCommand(): Command {
  const backup = new Command('backup');
  
  backup
    .description('Backup MCP configurations from all applications')
    .option('--dry-run', 'Show what would be backed up without creating backup')
    .action(async (options) => {
      try {
        const configManager = new ConfigurationManager();
        await configManager.initialize();

        if (options.dryRun) {
          output.info(theme.info('🔍 [DRY RUN MODE] - Showing what would be backed up'));
          output.displaySpaceBuffer(1);

          // Get enabled applications
          const registry = (configManager as any).registry;
          const apps = await registry.getEnabledApplications();

          output.displaySubHeader('Applications to backup:');
          for (const [appId, app] of Object.entries(apps)) {
            const appDef = app as any;
            const installed = await registry.isApplicationInstalled(appDef);
            if (installed) {
              output.displayInstruction(`• ${appDef.name} (${appId})`);
            }
          }
          
          output.displaySpaceBuffer(1);
          output.info('No actual backup created in dry-run mode.');
          return;
        }

        output.info('🔍 Discovering MCP configurations...');
        
        const result = await configManager.discoverAndImport();
        
        output.displaySpaceBuffer(1);
        output.success('✅ Backup created successfully!');
        output.displaySpaceBuffer(1);
        
        output.displaySubHeader('📊 Backup Summary:');
        output.info(`📁 Backup location: ${result.backup}`);
        
        // Display imported apps with their file paths
        if (result.importedDetails && result.importedDetails.length > 0) {
          output.info(`✅ Imported (${result.importedDetails.length}):`);
          for (const detail of result.importedDetails) {
            output.info(`   ${detail.appId}: ${detail.configPath}`);
          }
        } else if (result.imported && result.imported.length > 0) {
          // Fallback for backwards compatibility
          output.info(`✅ Imported: ${result.imported.join(', ')}`);
        } else {
          output.info(`✅ Imported: None`);
        }
        
        if (result.failed.length > 0) {
          output.warn(`❌ Failed: ${result.failed.join(', ')}`);
        }
        
      } catch (error) {
        output.error('❌ Backup failed:');
        output.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });
  
  return backup;
}

export function createRestoreCommand(): Command {
  const restore = new Command('restore');
  
  restore
    .description('Restore MCP configurations from a backup')
    .option('--list', 'List available backups')
    .option('--latest', 'Restore from the latest backup')
    .option('--backup <path>', 'Restore from specific backup file')
    .action(async (options) => {
      try {
        const configManager = new ConfigurationManager();
        await configManager.initialize();

        const backups = await configManager.listBackups();

        if (options.list) {
          if (backups.length === 0) {
            output.warn('No backups found.');
            return;
          }

          output.displaySubHeader('Available backups:');
          backups.forEach((backup, index) => {
            const metadata = backup.metadata;
            const date = new Date(metadata.timestamp).toLocaleString();
            output.displayInstruction(
              `${index + 1}. ${date} - ${metadata.total_servers} servers from ${Object.keys(metadata.applications).length} apps`
            );
          });
          return;
        }

        let backupPath: string;

        if (options.backup) {
          backupPath = options.backup;
        } else if (options.latest) {
          if (backups.length === 0) {
            output.error('No backups available.');
            process.exit(1);
          }
          if (!backups[0].path) {
            output.error('Backup path not available.');
            process.exit(1);
          }
          backupPath = backups[0].path;
        } else {
          // Interactive selection
          if (backups.length === 0) {
            output.error('No backups available.');
            process.exit(1);
          }

          const choices = backups.map((backup, index) => {
            const metadata = backup.metadata;
            const date = new Date(metadata.timestamp).toLocaleString();
            return {
              name: `${date} - ${metadata.total_servers} servers from ${Object.keys(metadata.applications).length} apps`,
              value: backup.path || backup.id
            };
          });

          const { selectedBackup } = await inquirer.prompt([
            {
              type: 'list',
              name: 'selectedBackup',
              message: 'Select backup to restore:',
              choices
            }
          ]);

          backupPath = selectedBackup;
        }

        // Confirm restoration
        const { confirm } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'confirm',
            message: theme.warning('⚠️  This will overwrite current configurations. Continue?'),
            default: false
          }
        ]);

        if (!confirm) {
          output.info('Restoration cancelled.');
          return;
        }

        output.info('🔄 Restoring configurations...');
        await configManager.restoreBackup(backupPath);
        
        output.displaySpaceBuffer(1);
        output.success('✅ Restoration complete!');
        output.info('All MCP configurations have been restored from backup.');
        
      } catch (error) {
        output.error('❌ Restoration failed:');
        output.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });
  
  return restore;
}