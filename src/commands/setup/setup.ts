/**
 * Setup wizard - Interactive configuration setup for Hypertool MCP
 * 
 * TODO: Profile Management Integration
 * - Add profile selection step to setup wizard
 * - Allow users to create new profiles during setup
 * - Support profile-specific configuration storage
 * - Add profile switching capabilities in wizard
 * - Implement profile templates for common setups
 */

import { output } from '../../utils/output.js';
import { theme } from '../../utils/theme.js';
import { ConfigurationManager } from '../../config-manager/index.js';
import { 
  WizardState, 
  SetupOptions, 
  WizardStep
} from './types.js';

// Import wizard steps
import { WelcomeStep } from '../steps/welcome.js';
import { AppDetectionStep } from '../steps/appDetection.js';
import { ConfigDiscoveryStep } from '../steps/configDiscovery.js';
import { ImportStrategyStep } from '../steps/importStrategy.js';
import { ServerSelectionStep } from '../steps/serverSelection.js';
import { ConflictResolutionStep } from '../steps/conflictResolution.js';
import { ToolsetCreationStep } from '../steps/toolsetCreation.js';
import { InstallationTypeStep } from '../steps/installationType.js';
import { ReviewStep } from '../steps/review.js';
import { ExecutionStep } from '../steps/execution.js';
import { CompletionStep } from '../steps/completion.js';

export class SetupWizard {
  private state: WizardState;
  private options: SetupOptions;
  private configManager: ConfigurationManager;
  private steps: WizardStep[];

  constructor(options: SetupOptions = {}) {
    this.options = options;
    this.configManager = ConfigurationManager.fromEnvironment();
    
    // Initialize state
    this.state = {
      detectedApps: [],
      existingConfigs: [],
      selectedApps: [],
      importStrategy: 'per-app',
      perAppSelections: {},
      toolsets: [],
      installationType: 'standard',
      serverNameMapping: {},
      dryRun: options.dryRun || false,
      nonInteractive: options.yes || false,
      verbose: options.verbose || false,
      // Pass through CLI options for non-interactive mode
      ...options
    };

    // Define wizard steps
    this.steps = [
      new WelcomeStep(),
      new AppDetectionStep(),
      new ConfigDiscoveryStep(),
      new ImportStrategyStep(),
      new ServerSelectionStep(),
      new ConflictResolutionStep(),
      new ToolsetCreationStep(),
      new InstallationTypeStep(),
      new ReviewStep(),
      new ExecutionStep(this.configManager),
      new CompletionStep()
    ];
  }

  /**
   * Run the setup wizard
   */
  async run(): Promise<void> {
    try {
      // Clear terminal and show banner
      if (!this.options.dryRun && !this.state.nonInteractive) {
        output.clearTerminal();
      }
      
      // Run through wizard steps
      for (const step of this.steps) {
        // Skip certain steps in non-interactive mode
        if (this.state.nonInteractive && step.canSkip) {
          continue;
        }

        // Run the step
        this.state = await step.run(this.state);

        // Check if user cancelled
        if (this.state.cancelled) {
          output.info(theme.warning('\n✖ Setup cancelled by user'));
          process.exit(0);
        }
      }

      // Success!
      if (!this.state.dryRun) {
        process.exit(0);
      }
    } catch (error) {
      output.error(`Setup failed: ${error}`);
      process.exit(1);
    }
  }

  /**
   * Check if this is the first run (no config exists)
   */
  static async isFirstRun(): Promise<boolean> {
    try {
      const configManager = ConfigurationManager.fromEnvironment();
      await configManager.initialize();
      
      // Check if config.json exists and has content
      const fs = (await import('fs')).promises;
      const path = await import('path');
      const os = await import('os');
      
      try {
        const configPath = path.join(
          os.homedir(),
          '.toolprint',
          'hypertool-mcp',
          'config.json'
        );
        const content = await fs.readFile(configPath, 'utf-8');
        const config = JSON.parse(content);
        return !config || !config.applications || Object.keys(config.applications).length === 0;
      } catch {
        return true;
      }
    } catch {
      // If we can't read config, assume first run
      return true;
    }
  }

  /**
   * Run setup with specific options for non-interactive mode
   */
  static async runNonInteractive(options: SetupOptions): Promise<void> {
    const wizard = new SetupWizard({
      ...options,
      yes: true
    });
    
    await wizard.run();
  }
}