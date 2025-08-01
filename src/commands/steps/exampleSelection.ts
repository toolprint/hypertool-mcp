/**
 * Example configuration selection step
 */

import inquirer from 'inquirer';
import { WizardState, WizardStep, ExampleConfig } from '../setup/types.js';
import { output } from '../../utils/output.js';
import { theme } from '../../utils/theme.js';
import { 
  EXAMPLE_CONFIGS, 
  getExamplesByCategory, 
  verifyExamplesAvailable 
} from './exampleConfigs.js';

export class ExampleSelectionStep implements WizardStep {
  name = 'exampleSelection';
  
  async run(state: WizardState): Promise<WizardState> {
    // Skip if not using examples
    if (state.importStrategy !== 'examples') {
      return state;
    }

    // Skip if already selected (non-interactive mode)
    if (state.selectedExample) {
      return state;
    }

    // Verify examples are available
    const examplesAvailable = await verifyExamplesAvailable();
    if (!examplesAvailable) {
      output.error('Example configurations are not available. Using fresh start instead.');
      return {
        ...state,
        importStrategy: 'fresh'
      };
    }

    output.displaySpaceBuffer(1);
    output.displayHeader('Select Example Configuration');

    // Group examples by category
    const zeroSetup = getExamplesByCategory('zero-setup');
    const specialized = getExamplesByCategory('specialized');
    const fullFeatured = getExamplesByCategory('full-featured');

    // Create choices with category separators
    const choices: any[] = [];
    
    // Zero Setup section
    choices.push(new inquirer.Separator('── Recommended: Zero Setup ──'));
    zeroSetup.forEach(example => {
      choices.push({
        name: this.formatExampleTitle(example),
        value: example.id,
        description: this.formatExampleDescription(example),
        short: example.name
      });
    });

    // Specialized section
    choices.push(new inquirer.Separator());
    choices.push(new inquirer.Separator('── Specialized Configurations ──'));
    specialized.forEach(example => {
      choices.push({
        name: this.formatExampleTitle(example),
        value: example.id,
        description: this.formatExampleDescription(example),
        short: example.name
      });
    });

    // Full Featured section
    choices.push(new inquirer.Separator());
    choices.push(new inquirer.Separator('── Full Featured (Requires API Keys) ──'));
    fullFeatured.forEach(example => {
      choices.push({
        name: this.formatExampleTitle(example),
        value: example.id,
        description: this.formatExampleDescription(example),
        short: example.name
      });
    });

    // Ask for selection
    const { selectedId } = await inquirer.prompt([{
      type: 'list',
      name: 'selectedId',
      message: 'Choose an example configuration:',
      choices,
      pageSize: 15,
      loop: false
    }]);

    // Find the selected example
    const selectedExample = EXAMPLE_CONFIGS.find(e => e.id === selectedId);
    if (!selectedExample) {
      throw new Error(`Invalid example selection: ${selectedId}`);
    }

    // Show confirmation
    output.displaySpaceBuffer(1);
    output.info(`Selected: ${theme.value(selectedExample.name)}`);
    
    if (selectedExample.requiresSecrets) {
      output.displaySpaceBuffer(1);
      output.warn('⚠️  This configuration requires API keys to be fully functional.');
      output.info('You\'ll need to add your credentials after setup completes.');
    }

    return {
      ...state,
      selectedExample
    };
  }

  /**
   * Format example title with emoji indicators
   */
  private formatExampleTitle(example: ExampleConfig): string {
    let title = '';
    
    // Add recommended star for "everything" (zero-setup)
    if (example.id === 'everything') {
      title += '⭐ ';
    }
    // Add key emoji if requires secrets
    else if (example.requiresSecrets) {
      title += '🔑 ';
    }
    // Add bullet for all others
    else {
      title += '• ';
    }
    
    title += example.name;
    return title;
  }

  /**
   * Format example description for display when highlighted
   */
  private formatExampleDescription(example: ExampleConfig): string {
    let desc = example.description;
    desc += ` • ${example.serverCount} servers`;
    
    if (example.requiresSecrets) {
      desc += ' • Requires API keys';
    }
    
    return desc;
  }

}