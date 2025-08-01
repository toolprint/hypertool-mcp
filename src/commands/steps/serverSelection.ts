/**
 * Per-app server selection step - Choose which servers to include for each application
 */

import inquirer from 'inquirer';
import { WizardState, WizardStep, SelectedServer } from '../setup/types.js';
import { output } from '../../utils/output.js';
import { theme } from '../../utils/theme.js';

export class ServerSelectionStep implements WizardStep {
  name = 'serverSelection';
  canSkip = true;

  async run(state: WizardState): Promise<WizardState> {
    // Skip if not using per-app import or if no existing configs
    if (state.importStrategy !== 'per-app') {
      // For 'fresh' strategy, no servers selected
      return {
        ...state,
        perAppSelections: {}
      };
    }

    // Skip if no existing configs
    if (state.existingConfigs.length === 0) {
      return {
        ...state,
        perAppSelections: {}
      };
    }

    // In non-interactive mode, select all servers for each app
    if (state.nonInteractive) {
      const perAppSelections: Record<string, SelectedServer[]> = {};
      
      for (const config of state.existingConfigs) {
        perAppSelections[config.appId] = config.servers.map(server => ({
          ...server,
          selected: true
        }));
      }
      
      return {
        ...state,
        perAppSelections
      };
    }

    output.displaySpaceBuffer(1);
    output.info(theme.info('📦 Select servers to include for each application:'));
    output.displaySpaceBuffer(1);

    const perAppSelections: Record<string, SelectedServer[]> = {};

    // Go through each app's servers
    for (const config of state.existingConfigs) {
      const app = state.detectedApps.find(a => a.id === config.appId);
      
      if (config.servers.length === 0) {
        continue; // Skip apps with no servers
      }

      output.info(theme.success(`${app?.displayName}:`));

      // Create choices showing detailed server information
      const choices = config.servers.map(server => {
        let displayName = `${theme.label(server.name)}`;
        displayName += `\n    Command: ${theme.muted(server.command)}`;
        if (server.args && server.args.length > 0) {
          displayName += `\n    Args: ${theme.muted(server.args.join(' '))}`;
        }
        
        return {
          name: displayName,
          value: server.name,
          checked: true // Default to selected
        };
      });

      // Ask which servers to import from this app
      const { selected } = await inquirer.prompt([{
        type: 'checkbox',
        name: 'selected',
        message: `Select servers to include:`,
        choices,
        pageSize: 10
      }]);

      // Store selected servers for this app
      perAppSelections[config.appId] = config.servers.map(server => ({
        ...server,
        selected: selected.includes(server.name)
      }));

      output.displaySpaceBuffer(1);
    }

    return {
      ...state,
      perAppSelections
    };
  }
}