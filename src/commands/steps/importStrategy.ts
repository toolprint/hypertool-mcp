/**
 * Import strategy step - Determine how to handle existing configurations
 */

import inquirer from 'inquirer';
import { WizardState, WizardStep, ImportStrategy } from '../setup/types.js';
import { output } from '../../utils/output.js';
import { theme } from '../../utils/theme.js';

export class ImportStrategyStep implements WizardStep {
  name = 'importStrategy';
  canSkip = true; // Can skip in non-interactive mode

  async run(state: WizardState): Promise<WizardState> {
    // Check for --example flag first in non-interactive mode
    if (state.nonInteractive) {
      const options = state as any;
      if (options.example) {
        // User explicitly requested an example config
        const { EXAMPLE_CONFIGS } = await import('./exampleConfigs.js');
        const selectedExample = EXAMPLE_CONFIGS.find(e => e.id === options.example);
        if (!selectedExample) {
          throw new Error(`Unknown example configuration: ${options.example}`);
        }
        return {
          ...state,
          importStrategy: 'examples',
          selectedExample
        };
      }
    }

    // If no existing configs or no apps selected, ask if they want to use examples
    if (state.existingConfigs.length === 0 || state.selectedApps.length === 0) {
      // In non-interactive mode, default to fresh
      if (state.nonInteractive) {
        return {
          ...state,
          importStrategy: 'fresh'
        };
      }
      
      output.displaySpaceBuffer(1);
      
      const message = state.selectedApps.length === 0 
        ? 'No applications selected. Would you like to start from an example configuration?' 
        : 'No existing configurations found. Would you like to start from an example configuration?';
      
      const { useExamples } = await inquirer.prompt([{
        type: 'confirm',
        name: 'useExamples',
        message,
        default: true
      }]);
      
      return {
        ...state,
        importStrategy: useExamples ? 'examples' : 'fresh'
      };
    }

    // In non-interactive mode, use CLI options or default to per-app configuration
    if (state.nonInteractive) {
      let importStrategy: ImportStrategy = 'per-app';
      
      // Check if specific import strategy was requested
      const options = state as any;
      if (options.importAll === false) {
        importStrategy = 'fresh';
      } else {
        importStrategy = 'per-app'; // Default to per-app instead of 'all'
      }
      
      return {
        ...state,
        importStrategy
      };
    }

    output.displaySpaceBuffer(1);

    // Ask how to proceed
    const { strategy } = await inquirer.prompt([{
      type: 'list',
      name: 'strategy',
      message: 'How would you like to proceed with existing configurations?',
      choices: [
        {
          name: 'Configure per application (recommended)',
          value: 'per-app'
        },
        {
          name: 'Start from an example configuration',
          value: 'examples'
        },
        {
          name: 'Start fresh (ignore existing configs)',
          value: 'fresh'
        },
        {
          name: 'View existing configurations first',
          value: 'view'
        }
      ],
      default: 'per-app'
    }]);

    // If they want to view configs, show them and ask again
    if (strategy === 'view') {
      output.displaySpaceBuffer(1);
      output.info(theme.info('📄 Existing server configurations:'));
      output.displaySpaceBuffer(1);
      
      for (const config of state.existingConfigs) {
        const app = state.detectedApps.find(a => a.id === config.appId);
        output.info(theme.success(`${app?.displayName}:`));
        
        for (const server of config.servers) {
          output.info(`  • ${theme.label(server.name)}`);
          output.info(`    Command: ${theme.muted(server.command)}`);
          if (server.args && server.args.length > 0) {
            output.info(`    Args: ${theme.muted(server.args.join(' '))}`);
          }
        }
        output.displaySpaceBuffer(1);
      }

      // Ask again
      const { strategyAfterView } = await inquirer.prompt([{
        type: 'list',
        name: 'strategyAfterView',
        message: 'How would you like to proceed?',
        choices: [
          {
            name: 'Configure per application (recommended)',
            value: 'per-app'
          },
          {
            name: 'Start fresh',
            value: 'fresh'
          }
        ],
        default: 'per-app'
      }]);

      return {
        ...state,
        importStrategy: strategyAfterView as ImportStrategy
      };
    }

    return {
      ...state,
      importStrategy: strategy as ImportStrategy
    };
  }
}