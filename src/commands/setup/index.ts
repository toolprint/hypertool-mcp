/**
 * Setup command - Modern setup and configuration experience
 */

import { Command } from 'commander';
import { SetupWizard } from './setup.js';
import { theme } from '../../utils/theme.js';

export function createSetupCommand(): Command {
  const setupCommand = new Command('setup')
    .description('Interactive setup wizard for Hypertool MCP')
    .option('-y, --yes', 'Accept all defaults (non-interactive mode)')
    .option('--dry-run', 'Preview changes without making them')
    .option('--apps <apps>', 'Comma-separated list of apps to configure (claude-desktop,cursor,claude-code)')
    .option('--import-all', 'Import all existing configurations (default in non-interactive)')
    .option('--import-none', 'Start fresh without importing existing configs')
    .option('--standard', 'Use standard installation type (default)')
    .option('--development', 'Use development installation type')
    .option('--skip-toolsets', 'Skip toolset creation')
    .option('--verbose', 'Show detailed output')
    .action(async (options) => {
      try {
        const setupOptions = {
          yes: options.yes,
          dryRun: options.dryRun,
          apps: options.apps?.split(',').map((app: string) => app.trim()),
          importAll: options.importNone ? false : (options.importAll ?? true),
          standard: options.development ? false : (options.standard ?? true),
          development: options.development,
          skipToolsets: options.skipToolsets,
          verbose: options.verbose
        };

        const wizard = new SetupWizard(setupOptions);
        await wizard.run();
      } catch (error) {
        console.error(theme.error('Setup failed:'), error);
        process.exit(1);
      }
    });

  return setupCommand;
}

// Keep the old function for backward compatibility but mark as deprecated
export function createVibeCommand(): Command {
  const vibeCommand = new Command('vibe')
    .description('[DEPRECATED] Use top-level commands directly');
  
  // Add a deprecation notice
  vibeCommand.action(() => {
    console.log(theme.warning('⚠️  The "vibe" command namespace is deprecated.'));
    console.log(theme.info('   Use commands directly: hypertool-mcp setup'));
  });

  return vibeCommand;
}