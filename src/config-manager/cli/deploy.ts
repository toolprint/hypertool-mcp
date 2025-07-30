/**
 * CLI command for deployment operations
 */

import { Command } from 'commander';
import inquirer from 'inquirer';
import { theme, semantic } from '../../utils/theme.js';
import { ConfigurationManager } from '../index.js';
import { output } from '../../utils/output.js';

export function createDeployCommand(): Command {
  const deploy = new Command('deploy');
  
  deploy
    .description('Deploy HyperTool configuration to all applications')
    .option('--dry-run', 'Show what would be deployed without making changes')
    .option('--app <appId>', 'Deploy to specific application only')
    .action(async (options) => {
      try {
        const configManager = new ConfigurationManager();
        await configManager.initialize();

        if (options.dryRun) {
          output.info(theme.info('🔍 [DRY RUN MODE] - Showing deployment plan'));
          output.displaySpaceBuffer(1);

          const registry = (configManager as any).registry;
          const apps = await registry.getEnabledApplications();

          output.displaySubHeader('Would deploy HyperTool to:');
          for (const [appId, app] of Object.entries(apps)) {
            if (options.app && options.app !== appId) continue;
            
            const appDef = app as any;
            const installed = await registry.isApplicationInstalled(appDef);
            if (installed) {
              const platformConfig = registry.getPlatformConfig(appDef);
              if (platformConfig) {
                const configPath = registry.resolvePath(platformConfig.configPath);
                output.displayInstruction(`• ${appDef.name}: ${configPath}`);
              }
            }
          }
          
          output.displaySpaceBuffer(1);
          output.info('No actual changes made in dry-run mode.');
          return;
        }

        // Confirm deployment
        const { confirm } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'confirm',
            message: theme.warning('Deploy HyperTool configuration to all applications?'),
            default: true
          }
        ]);

        if (!confirm) {
          output.info('Deployment cancelled.');
          return;
        }

        output.info('🚀 Deploying HyperTool configuration...');
        
        const result = await configManager.deployToApplications();
        
        output.displaySpaceBuffer(1);
        output.success('✅ Deployment complete!');
        output.displaySpaceBuffer(1);
        
        output.displaySubHeader('📊 Deployment Summary:');
        if (result.deployed.length > 0) {
          output.success(`✅ Deployed to: ${result.deployed.join(', ')}`);
        }
        if (result.failed.length > 0) {
          output.warn(`❌ Failed: ${result.failed.join(', ')}`);
        }
        
        output.displaySpaceBuffer(1);
        output.displaySubHeader('🔄 Next steps:');
        output.displayInstruction('1. Restart affected applications');
        output.displayInstruction('2. Your MCP tools are now proxied through HyperTool');
        
      } catch (error) {
        output.error('❌ Deployment failed:');
        output.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });
  
  return deploy;
}