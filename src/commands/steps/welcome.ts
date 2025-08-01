/**
 * Welcome step - Shows introduction and overview
 */

import inquirer from 'inquirer';
import { WizardState, WizardStep } from '../setup/types.js';
import { displayBanner, output } from '../../utils/output.js';
import { theme } from '../../utils/theme.js';

export class WelcomeStep implements WizardStep {
  name = 'welcome';

  async run(state: WizardState): Promise<WizardState> {
    // Show banner
    displayBanner('HYPERTOOL MCP SETUP WIZARD');

    // Welcome message
    output.info(theme.success('Welcome! This wizard will help you:'));
    output.info('  ✓ Detect your installed MCP-compatible applications');
    output.info('  ✓ Import existing MCP server configurations');
    output.info('  ✓ Set up Hypertool as your unified MCP proxy');
    output.info('  ✓ Create toolsets for different workflows');
    
    output.displaySpaceBuffer(1);

    // In non-interactive mode, skip the prompt
    if (state.nonInteractive) {
      output.info(theme.info('Running in non-interactive mode...'));
      return state;
    }

    // In dry-run mode, show a notice
    if (state.dryRun) {
      output.info(theme.warning('🔍 [DRY RUN MODE] - No changes will be made'));
      output.displaySpaceBuffer(1);
    }

    // Ask to continue
    const { shouldContinue } = await inquirer.prompt([{
      type: 'confirm',
      name: 'shouldContinue',
      message: 'Ready to begin setup?',
      default: true
    }]);

    if (!shouldContinue) {
      return { ...state, cancelled: true };
    }

    return state;
  }
}