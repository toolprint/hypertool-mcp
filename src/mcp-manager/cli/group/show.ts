/**
 * CLI command for showing server group details
 */

import { Command } from "commander";
import { getCompositeDatabaseService } from "../../../db/compositeDatabaseService.js";
import { theme, semantic } from "../../../utils/theme.js";
import { output } from "../../../utils/output.js";
import { createChildLogger } from "../../../utils/logging.js";

const logger = createChildLogger({ module: "mcp-manager/group/show" });

export function createGroupShowCommand(): Command {
  const show = new Command("show");

  show
    .description("Show details of a server group")
    .argument("<name>", "Name of the group")
    .option("-j, --json", "Output in JSON format")
    .action(async (name, options) => {
      try {
        // Initialize database
        const dbService = getCompositeDatabaseService();
        await dbService.init();

        // Find the group
        const group = await dbService.groups.findByName(name);
        if (!group) {
          console.error(semantic.messageError(`❌ Group "${name}" not found`));
          process.exit(1);
        }

        // Get servers in the group
        const servers = await dbService.groups.findServersInGroup(group.id);

        // Output in JSON format if requested
        if (options.json) {
          const jsonOutput = {
            id: group.id,
            name: group.name,
            description: group.description,
            serverCount: servers.length,
            servers: servers.map((server) => ({
              id: server.id,
              name: server.name,
              type: server.type,
              checksum: server.checksum,
              lastModified: server.lastModified,
            })),
          };
          console.log(JSON.stringify(jsonOutput, null, 2));
          await dbService.close();
          return;
        }

        // Display group details
        output.displaySubHeader(`Group: ${group.name}`);
        output.displaySpaceBuffer();

        console.log(theme.label("Group Information"));
        console.log(theme.info(`  ID: ${group.id}`));
        if (group.description) {
          console.log(theme.info(`  Description: ${group.description}`));
        }
        console.log(theme.info(`  Total servers: ${servers.length}`));

        if (servers.length > 0) {
          output.displaySpaceBuffer();
          console.log(theme.label("Servers in group:"));

          for (const server of servers) {
            console.log(theme.info(`  • ${server.name} (${server.type})`));
          }
        } else {
          output.displaySpaceBuffer();
          console.log(theme.muted("No servers in this group."));
          console.log(theme.muted("\nTo add servers:"));
          console.log(
            theme.command(`  hypertool-mcp mcp group add ${name} <server-name>`)
          );
        }

        await dbService.close();
      } catch (error) {
        logger.error("Failed to show group:", error);
        console.error(
          semantic.messageError(
            `❌ Failed to show group: ${(error as Error).message}`
          )
        );
        process.exit(1);
      }
    });

  return show;
}
