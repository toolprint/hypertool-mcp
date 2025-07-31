/**
 * Completion step - Show next steps and quick start guide
 */

import { WizardState, WizardStep } from '../setup/types.js';
import { output } from '../../utils/output.js';
import { theme } from '../../utils/theme.js';

export class CompletionStep implements WizardStep {
  name = 'completion';

  async run(state: WizardState): Promise<WizardState> {
    // Skip in dry run mode
    if (state.dryRun) {
      return state;
    }

    output.displaySpaceBuffer(2);
    output.displayHeader('🎉 Hypertool MCP is ready to use!');
    output.displaySpaceBuffer(1);

    // Quick start
    output.info(theme.label('Quick Start:'));
    output.info(`  • Run server: ${theme.command('hypertool-mcp')}`);
    
    if (state.toolsets.length > 0) {
      const firstToolset = state.toolsets[0];
      output.info(`  • With toolset: ${theme.command(`hypertool-mcp --equip-toolset ${firstToolset.name}`)}`);
    }
    
    if (state.selectedApps.length > 0) {
      const firstApp = state.selectedApps[0];
      output.info(`  • Specific app: ${theme.command(`hypertool-mcp --linked-app ${firstApp}`)}`);
    }
    
    output.displaySpaceBuffer(1);

    // Management commands
    output.info(theme.label('Manage your setup:'));
    output.info(`  • View config: ${theme.command('hypertool-mcp config show')}`);
    output.info(`  • Add servers: ${theme.command('hypertool-mcp mcp add')}`);
    output.info(`  • Create toolsets: ${theme.command('hypertool-mcp config toolset create')}`);
    
    output.displaySpaceBuffer(1);

    // Help
    output.info(`Need help? Run: ${theme.command('hypertool-mcp --help')}`);
    
    output.displaySpaceBuffer(1);
    
    // Tips based on setup
    if (state.installationType === 'standard' && state.selectedApps.includes('claude-desktop')) {
      output.info(theme.muted('💡 Tip: Restart Claude Desktop to use the new configuration'));
    }
    
    if (state.toolsets.length === 0) {
      output.info(theme.muted('💡 Tip: Create toolsets to organize your tools by workflow'));
    }

    return state;
  }
}