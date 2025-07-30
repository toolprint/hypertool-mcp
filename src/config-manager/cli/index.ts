/**
 * CLI commands for configuration management
 */

import { Command } from 'commander';
import { createBackupCommand, createRestoreCommand } from './backup.js';
import { createDeployCommand } from './deploy.js';
import { createUninstallCommand } from './uninstall.js';
import { createShowCommand } from './show.js';

export function createConfigCommands(): Command {
  const config = new Command('config');
  
  config
    .description('Configuration management commands')
    .addCommand(createShowCommand())
    .addCommand(createBackupCommand())
    .addCommand(createRestoreCommand())
    .addCommand(createDeployCommand())
    .addCommand(createUninstallCommand());
  
  return config;
}

// Export individual commands for direct use
export { createShowCommand, createBackupCommand, createRestoreCommand, createDeployCommand, createUninstallCommand };