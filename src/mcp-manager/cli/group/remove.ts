/**
 * CLI command for removing servers from a group
 */

import { Command } from "commander";
import { getDatabaseService } from "../../../db/nedbService.js";
import { theme, semantic } from "../../../utils/theme.js";
import { output } from "../../../utils/output.js";
import { createChildLogger } from "../../../utils/logging.js";

const logger = createChildLogger({ module: "mcp-manager/group/remove" });

export function createGroupRemoveCommand(): Command {
  const remove = new Command("remove");

  remove
    .description("Remove servers from a group")
    .argument("<group>", "Name of the group")
    .argument("<servers...>", "Names of servers to remove")
    .action(async (groupName, serverNames) => {
      try {
        // Initialize database
        const dbService = getDatabaseService();
        await dbService.init();

        // Find the group
        const group = await dbService.groups.findByName(groupName);
        if (!group) {
          console.error(
            semantic.messageError(`❌ Group "${groupName}" not found`)
          );
          process.exit(1);
        }

        // Process each server
        let removedCount = 0;
        const errors: string[] = [];

        for (const serverName of serverNames) {
          // Find the server
          const server = await dbService.servers.findByName(serverName);
          if (!server) {
            errors.push(`Server "${serverName}" not found`);
            continue;
          }

          // Check if server is in the group
          const index = group.serverIds.indexOf(server.id);
          if (index === -1) {
            errors.push(`Server "${serverName}" is not in the group`);
            continue;
          }

          // Remove server from group
          group.serverIds.splice(index, 1);
          removedCount++;
        }

        // Update the group if any servers were removed
        if (removedCount > 0) {
          await dbService.groups.update(group);
        }

        // Display results
        output.displaySeparator();

        if (removedCount > 0) {
          console.log(
            semantic.messageSuccess(
              `✅ Removed ${removedCount} server${removedCount === 1 ? "" : "s"} from group "${groupName}"`
            )
          );
        }

        if (errors.length > 0) {
          output.displaySpaceBuffer();
          console.log(theme.warning("⚠️  Warnings:"));
          errors.forEach((error) => {
            console.log(theme.warning(`   • ${error}`));
          });
        }

        // Show current group status
        output.displaySpaceBuffer();
        console.log(
          theme.info(
            `Group "${groupName}" now contains ${group.serverIds.length} server${group.serverIds.length === 1 ? "" : "s"}`
          )
        );

        await dbService.close();
      } catch (error) {
        logger.error("Failed to remove servers from group:", error);
        console.error(
          semantic.messageError(
            `❌ Failed to remove servers from group: ${(error as Error).message}`
          )
        );
        process.exit(1);
      }
    });

  return remove;
}
