/**
 * Config discovery step - Finds existing MCP configurations
 */

import { promises as fs } from 'fs';
import { WizardState, WizardStep, ExistingConfig, ServerInfo } from '../setup/types.js';
import { output } from '../../utils/output.js';
import { theme } from '../../utils/theme.js';

export class ConfigDiscoveryStep implements WizardStep {
  name = 'configDiscovery';
  canSkip = false;

  async run(state: WizardState): Promise<WizardState> {
    // Skip if no apps selected
    if (state.selectedApps.length === 0) {
      return state;
    }

    output.displaySpaceBuffer(1);
    output.info(theme.info('📋 Checking for existing MCP configurations...'));
    output.displaySpaceBuffer(1);

    const existingConfigs: ExistingConfig[] = [];

    // Read configurations from selected apps
    for (const appId of state.selectedApps) {
      const app = state.detectedApps.find(a => a.id === appId);
      if (!app || !app.hasExistingConfig) continue;

      try {
        const content = await fs.readFile(app.configPath, 'utf-8');
        const config = JSON.parse(content);
        
        if (config.mcpServers) {
          const servers: ServerInfo[] = [];
          
          for (const [name, serverConfig] of Object.entries(config.mcpServers)) {
            const server = serverConfig as any;
            servers.push({
              name,
              command: server.command || server.type || 'unknown',
              args: server.args || undefined,
              description: this.getServerDescription(name, server),
              fromApp: appId
            });
          }

          if (servers.length > 0) {
            existingConfigs.push({
              appId,
              servers,
              configPath: app.configPath
            });
          }
        }
      } catch {
        output.warn(`Failed to read config from ${app.displayName}`);
      }
    }

    // Display summary
    if (existingConfigs.length > 0) {
      output.success('Found existing configurations:');
      for (const config of existingConfigs) {
        const app = state.detectedApps.find(a => a.id === config.appId);
        output.info(`  • ${app?.displayName}: ${config.servers.length} servers`);
        
        // Show server details in verbose mode
        if (state.verbose) {
          for (const server of config.servers) {
            output.info(`    - ${server.name}: ${server.description}`);
          }
        }
      }
    } else {
      output.info('No existing MCP configurations found in selected applications.');
    }

    return {
      ...state,
      existingConfigs
    };
  }

  private getServerDescription(name: string, config: any): string {
    // Try to generate a helpful description based on the server config
    if (config.command) {
      if (config.command.includes('filesystem')) return 'File system operations';
      if (config.command.includes('git')) return 'Git repository management';
      if (config.command.includes('docker')) return 'Docker container management';
      if (config.command.includes('python')) return 'Python code execution';
      if (config.command.includes('npm')) return 'Node.js package management';
    }
    
    // Use args if available
    if (config.args && Array.isArray(config.args)) {
      const argsStr = config.args.join(' ');
      if (argsStr.includes('filesystem')) return 'File system operations';
      if (argsStr.includes('git')) return 'Git repository management';
    }
    
    // Default to the command or type
    return config.command || config.type || 'MCP server';
  }
}