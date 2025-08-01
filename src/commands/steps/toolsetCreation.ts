/**
 * Toolset creation step - Suggest and create workflow-based toolsets
 * 
 * TODO: App-Specific Toolset Management
 * - Allow toolsets to be associated with specific applications
 * - Create app-specific toolset suggestions based on detected apps
 * - Support per-app toolset preferences and customization
 * - Add toolset synchronization options between applications
 */

import inquirer from 'inquirer';
import { WizardState, WizardStep, ToolsetDefinition } from '../setup/types.js';
import { output } from '../../utils/output.js';
import { theme } from '../../utils/theme.js';

export class ToolsetCreationStep implements WizardStep {
  name = 'toolsetCreation';
  canSkip = true;

  async run(state: WizardState): Promise<WizardState> {
    // Skip if no servers selected
    const selectedServerNames = this.getSelectedServerNames(state);
    if (selectedServerNames.length === 0) {
      return state;
    }

    output.displaySpaceBuffer(1);
    output.info(theme.info('🧰 Toolset Configuration'));
    output.displaySpaceBuffer(1);

    // In non-interactive mode, create default toolsets or skip
    if (state.nonInteractive) {
      const options = state as any;
      if (options.skipToolsets) {
        return {
          ...state,
          toolsets: []
        };
      }
      
      const toolsets = this.generateDefaultToolsets(selectedServerNames);
      return {
        ...state,
        toolsets
      };
    }

    // Ask if they want to create toolsets
    const { wantToolsets } = await inquirer.prompt([{
      type: 'confirm',
      name: 'wantToolsets',
      message: 'Would you like to create toolsets for different workflows?',
      default: true
    }]);

    if (!wantToolsets) {
      return {
        ...state,
        toolsets: []
      };
    }

    output.displaySpaceBuffer(1);
    output.info('Toolsets let you activate specific groups of tools for different tasks.');
    output.displaySpaceBuffer(1);

    // Generate suggested toolsets
    const suggestedToolsets = this.generateSuggestedToolsets(selectedServerNames);
    
    // Show suggested toolsets
    const choices = suggestedToolsets.map(toolset => ({
      name: `${toolset.displayName} - ${toolset.description}`,
      value: toolset.name,
      checked: toolset.suggested
    }));

    // Add custom option
    choices.push({
      name: '➕ Create custom toolset...',
      value: 'custom',
      checked: false
    });

    // Ask which toolsets to create
    const { selectedToolsets } = await inquirer.prompt([{
      type: 'checkbox',
      name: 'selectedToolsets',
      message: 'Select toolsets to create:',
      choices,
      pageSize: 10
    }]);

    const toolsets: ToolsetDefinition[] = [];

    // Add selected suggested toolsets
    for (const name of selectedToolsets) {
      if (name === 'custom') continue;
      
      const toolset = suggestedToolsets.find(t => t.name === name);
      if (toolset) {
        toolsets.push(toolset);
      }
    }

    // Handle custom toolset creation
    if (selectedToolsets.includes('custom')) {
      const customToolset = await this.createCustomToolset(selectedServerNames);
      if (customToolset) {
        toolsets.push(customToolset);
      }
    }

    return {
      ...state,
      toolsets
    };
  }

  private getSelectedServerNames(state: WizardState): string[] {
    const names: string[] = [];
    
    // Go through each app's selections
    for (const [, appServers] of Object.entries(state.perAppSelections)) {
      for (const server of appServers) {
        if (!server.selected) continue;
        
        // Get the final name (after conflict resolution)
        const key = `${server.fromApp}:${server.name}`;
        const finalName = state.serverNameMapping[key] || server.name;
        
        if (finalName) { // Skip if empty (marked for skipping)
          names.push(finalName);
        }
      }
    }
    
    return names;
  }

  private generateDefaultToolsets(serverNames: string[]): ToolsetDefinition[] {
    // Create a single "all" toolset in non-interactive mode
    return [{
      name: 'default',
      displayName: 'Default',
      description: 'All available tools',
      tools: serverNames,
      suggested: true
    }];
  }

  private generateSuggestedToolsets(serverNames: string[]): ToolsetDefinition[] {
    const toolsets: ToolsetDefinition[] = [];
    
    // Development toolset
    const devTools = serverNames.filter(name => 
      name.includes('git') || 
      name.includes('filesystem') || 
      name.includes('python') ||
      name.includes('node') ||
      name.includes('npm')
    );
    
    if (devTools.length > 0) {
      toolsets.push({
        name: 'development',
        displayName: 'Development',
        description: 'Code development and version control',
        tools: devTools,
        suggested: true
      });
    }

    // DevOps toolset
    const devopsTools = serverNames.filter(name =>
      name.includes('docker') ||
      name.includes('kubernetes') ||
      name.includes('git') ||
      name.includes('aws') ||
      name.includes('terraform')
    );
    
    if (devopsTools.length > 0) {
      toolsets.push({
        name: 'devops',
        displayName: 'DevOps',
        description: 'Infrastructure and deployment',
        tools: devopsTools,
        suggested: true
      });
    }

    // Data/AI toolset
    const dataTools = serverNames.filter(name =>
      name.includes('python') ||
      name.includes('jupyter') ||
      name.includes('data') ||
      name.includes('ml') ||
      name.includes('ai')
    );
    
    if (dataTools.length > 0) {
      toolsets.push({
        name: 'data-science',
        displayName: 'Data Science',
        description: 'Data analysis and machine learning',
        tools: dataTools,
        suggested: false
      });
    }

    // All tools toolset
    toolsets.push({
      name: 'all',
      displayName: 'All Tools',
      description: 'Access to all available tools',
      tools: serverNames,
      suggested: false
    });

    return toolsets;
  }

  private async createCustomToolset(availableServers: string[]): Promise<ToolsetDefinition | null> {
    output.displaySpaceBuffer(1);
    output.info(theme.info('Create custom toolset:'));
    
    // Get toolset details
    const { name, displayName, description } = await inquirer.prompt([
      {
        type: 'input',
        name: 'name',
        message: 'Toolset ID (lowercase, no spaces):',
        validate: (value) => {
          if (!value.match(/^[a-z0-9-]+$/)) {
            return 'Use only lowercase letters, numbers, and hyphens';
          }
          return true;
        }
      },
      {
        type: 'input',
        name: 'displayName',
        message: 'Display name:',
        validate: (value) => value.trim().length > 0 || 'Name cannot be empty'
      },
      {
        type: 'input',
        name: 'description',
        message: 'Description:',
        default: 'Custom toolset'
      }
    ]);

    // Select tools
    const { selectedTools } = await inquirer.prompt([{
      type: 'checkbox',
      name: 'selectedTools',
      message: 'Select tools for this toolset:',
      choices: availableServers.map(name => ({
        name: name,
        value: name,
        checked: false
      })),
      validate: (answers) => {
        if (answers.length === 0) {
          return 'Please select at least one tool';
        }
        return true;
      }
    }]);

    return {
      name,
      displayName,
      description,
      tools: selectedTools,
      suggested: false
    };
  }
}