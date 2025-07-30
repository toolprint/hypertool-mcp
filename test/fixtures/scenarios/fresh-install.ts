/**
 * Fresh install scenario - no existing configurations
 */

import { TestScenario, TestEnvironment } from '../base.js';

export class FreshInstallScenario implements TestScenario {
  name = 'fresh-install';
  description = 'Clean environment with no existing MCP configurations';

  async apply(env: TestEnvironment): Promise<void> {
    // The base environment already provides a clean state
    // We just need to ensure no application configs exist
    
    // This scenario represents a user who has:
    // - Never used HyperTool before
    // - Has the applications installed but no MCP configurations
    // - Ready for first-time setup
    
    // We don't need to do anything here as the base environment
    // already provides this state
  }
}