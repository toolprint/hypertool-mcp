/**
 * CLI command for adding servers to a group
 */

import { Command } from "commander";
import { getCompositeDatabaseService } from "../../../db/compositeDatabaseService.js";
import { theme, semantic } from "../../../utils/theme.js";
import { output } from "../../../utils/output.js";
import { createChildLogger } from "../../../utils/logging.js";

const logger = createChildLogger({ module: "mcp-manager/group/add" });

export function createGroupAddCommand(): Command {
  const add = new Command("add");

  add
    .description("Add servers to a group")
    .argument("<group>", "Name of the group")
    .argument("<servers...>", "Names of servers to add")
    .action(async (groupName, serverNames) => {
      try {
        // Initialize database
        const dbService = getCompositeDatabaseService();
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
        let addedCount = 0;
        const errors: string[] = [];

        for (const serverName of serverNames) {
          // Find the server
          const server = await dbService.servers.findByName(serverName);
          if (!server) {
            errors.push(`Server "${serverName}" not found`);
            continue;
          }

          // Check if server is already in the group
          if (group.serverIds.includes(server.id)) {
            errors.push(`Server "${serverName}" is already in the group`);
            continue;
          }

          // Add server to group
          group.serverIds.push(server.id);
          addedCount++;
        }

        // Update the group if any servers were added
        if (addedCount > 0) {
          await dbService.groups.update(group);
        }

        // Display results
        output.displaySeparator();

        if (addedCount > 0) {
          console.log(
            semantic.messageSuccess(
              `✅ Added ${addedCount} server${addedCount === 1 ? "" : "s"} to group "${groupName}"`
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
        logger.error("Failed to add servers to group:", error);
        console.error(
          semantic.messageError(
            `❌ Failed to add servers to group: ${(error as Error).message}`
          )
        );
        process.exit(1);
      }
    });

  return add;
}
