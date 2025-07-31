/**
 * Installation type step - Choose how to integrate with applications
 */

import inquirer from 'inquirer';
import { WizardState, WizardStep, InstallationType } from '../setup/types.js';
import { output } from '../../utils/output.js';
import { theme } from '../../utils/theme.js';

export class InstallationTypeStep implements WizardStep {
  name = 'installationType';
  canSkip = true;

  async run(state: WizardState): Promise<WizardState> {
    // Skip if no apps selected
    if (state.selectedApps.length === 0) {
      return state;
    }

    // In non-interactive mode, use CLI options or default to standard
    if (state.nonInteractive) {
      const options = state as any;
      let installationType: InstallationType = 'standard';
      
      // Check if specific installation type was requested
      if (options.standard === true) {
        installationType = 'standard';
      } else if (options.development === true) {
        installationType = 'development';
      }
      
      return {
        ...state,
        installationType
      };
    }

    output.displaySpaceBuffer(1);
    output.info(theme.info('🔗 Installation Type'));
    output.displaySpaceBuffer(1);

    const { installationType } = await inquirer.prompt([{
      type: 'list',
      name: 'installationType',
      message: 'How should Hypertool connect to your applications?',
      choices: [
        {
          name: 'Standard - Replace app configs to use Hypertool as proxy (recommended)',
          value: 'standard'
        },
        {
          name: 'Development - Use Hypertool alongside existing configs',
          value: 'development'
        },
        {
          name: 'Custom - Advanced configuration options',
          value: 'custom'
        }
      ],
      default: 'standard'
    }]);

    // Show additional info based on selection
    output.displaySpaceBuffer(1);
    
    switch (installationType) {
      case 'standard':
        output.info(theme.muted('ℹ️  Standard installation will:'));
        output.info(theme.muted('   • Back up existing configurations'));
        output.info(theme.muted('   • Replace app configs to point to Hypertool'));
        output.info(theme.muted('   • Hypertool will manage all MCP servers'));
        break;
        
      case 'development':
        output.info(theme.muted('ℹ️  Development installation will:'));
        output.info(theme.muted('   • Keep existing app configurations intact'));
        output.info(theme.muted('   • Create separate Hypertool configuration'));
        output.info(theme.muted('   • Run Hypertool independently'));
        break;
        
      case 'custom':
        output.info(theme.muted('ℹ️  Custom installation allows:'));
        output.info(theme.muted('   • Per-app installation choices'));
        output.info(theme.muted('   • Custom configuration paths'));
        output.info(theme.muted('   • Advanced proxy settings'));
        break;
    }

    // For custom installation, ask per-app choices
    if (installationType === 'custom') {
      output.displaySpaceBuffer(1);
      output.warn('⚠️  Custom installation not yet implemented.');
      output.info('   Falling back to standard installation.');
      
      return {
        ...state,
        installationType: 'standard'
      };
    }

    return {
      ...state,
      installationType: installationType as InstallationType
    };
  }
}