/**
 * Conflict resolution step - Handle server name conflicts
 *
 * TODO: This step is currently disabled in favor of per-application configuration
 * approach which eliminates naming conflicts by keeping each app's servers in
 * separate namespaces. This code is kept for potential future use with
 * cross-app server sharing or global server libraries.
 */

// import inquirer from 'inquirer';
import { WizardState, WizardStep } from "../setup/types.js";
// import { output } from '../../utils/output.js';
// import { theme } from '../../utils/theme.js';

export class ConflictResolutionStep implements WizardStep {
  name = "conflictResolution";
  canSkip = true;

  async run(state: WizardState): Promise<WizardState> {
    // TODO: Conflict resolution is disabled for per-app configuration approach
    // Each app gets its own namespace, so conflicts don't occur
    // Return state unchanged
    return state;

    /* DISABLED - KEEP FOR FUTURE USE
    // Original conflict resolution logic:

    // Find naming conflicts among selected servers
    const conflicts = this.findConflicts(state);

    // Skip if no conflicts
    if (conflicts.length === 0) {
      return state;
    }

    // In non-interactive mode, auto-resolve by adding app suffix
    if (state.nonInteractive) {
      const serverNameMapping: Record<string, string> = {};

      for (const conflict of conflicts) {
        for (const server of conflict.servers) {
          const newName = `${server.name}-${server.fromApp}`;
          serverNameMapping[`${server.fromApp}:${server.name}`] = newName;
        }
      }

      return {
        ...state,
        serverNameMapping
      };
    }

    output.displaySpaceBuffer(1);
    output.warn('⚠️  Server name conflicts detected:');
    output.displaySpaceBuffer(1);

    const serverNameMapping: Record<string, string> = {};

    // Handle each conflict
    for (const conflict of conflicts) {
      output.info(`Conflict: "${theme.label(conflict.name)}" exists in multiple apps:`);

      for (const server of conflict.servers) {
        const app = state.detectedApps.find(a => a.id === server.fromApp);
        output.info(`  • ${app?.displayName}: ${server.description || 'No description'}`);
      }

      output.displaySpaceBuffer(1);

      // Ask resolution strategy
      const { strategy } = await inquirer.prompt([{
        type: 'list',
        name: 'strategy',
        message: `How to handle "${conflict.name}" conflict?`,
        choices: [
          {
            name: 'Add app suffix to all (recommended)',
            value: 'suffix'
          },
          {
            name: 'Keep first, skip others',
            value: 'first'
          },
          {
            name: 'Choose custom names',
            value: 'custom'
          }
        ],
        default: 'suffix'
      }]);

      if (strategy === 'suffix') {
        // Add app suffix to each conflicting server
        for (const server of conflict.servers) {
          const newName = `${server.name}-${server.fromApp}`;
          serverNameMapping[`${server.fromApp}:${server.name}`] = newName;
        }
      } else if (strategy === 'first') {
        // Keep first, mark others for skipping
        const [first, ...others] = conflict.servers;
        for (const server of others) {
          // Mark for skipping by setting empty name
          serverNameMapping[`${server.fromApp}:${server.name}`] = '';
        }
      } else if (strategy === 'custom') {
        // Ask for custom names
        for (const server of conflict.servers) {
          const app = state.detectedApps.find(a => a.id === server.fromApp);
          const { customName } = await inquirer.prompt([{
            type: 'input',
            name: 'customName',
            message: `New name for "${server.name}" from ${app?.displayName}:`,
            default: `${server.name}-${server.fromApp}`,
            validate: (value) => {
              if (!value.trim()) {
                return 'Name cannot be empty';
              }
              // Check if name already exists
              const exists = Object.values(serverNameMapping).includes(value);
              if (exists) {
                return 'This name is already in use';
              }
              return true;
            }
          }]);

          serverNameMapping[`${server.fromApp}:${server.name}`] = customName;
        }
      }

      output.displaySpaceBuffer(1);
    }

    return {
      ...state,
      serverNameMapping
    };
    */
  }

  /*
  // TODO: Keep this method for future use
  private findConflicts(state: WizardState): Array<{
    name: string;
    servers: SelectedServer[];
  }> {
    const serverGroups = new Map<string, SelectedServer[]>();

    // Note: This would need to be updated to work with perAppSelections
    // when conflict resolution is re-enabled

    // Group selected servers by name
    for (const [appId, servers] of Object.entries(state.perAppSelections)) {
      for (const server of servers) {
        if (!server.selected) continue;

        if (!serverGroups.has(server.name)) {
          serverGroups.set(server.name, []);
        }
        serverGroups.get(server.name)!.push(server);
      }
    }

    // Find conflicts (multiple servers with same name)
    const conflicts = [];
    for (const [name, servers] of serverGroups.entries()) {
      if (servers.length > 1) {
        conflicts.push({ name, servers });
      }
    }

    return conflicts;
  }
  */
}
