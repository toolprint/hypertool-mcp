/**
 * CLI command for deleting server groups
 */

import { Command } from "commander";
import inquirer from "inquirer";
import { getDatabaseService } from "../../../db/nedbService.js";
import { theme, semantic } from "../../../utils/theme.js";
import { output } from "../../../utils/output.js";
import { createChildLogger } from "../../../utils/logging.js";

const logger = createChildLogger({ module: "mcp-manager/group/delete" });

export function createGroupDeleteCommand(): Command {
  const deleteCmd = new Command("delete");

  deleteCmd
    .description("Delete a server group")
    .argument("<name>", "Name of the group to delete")
    .option("-f, --force", "Skip confirmation prompt")
    .action(async (name, options) => {
      try {
        // Initialize database
        const dbService = getDatabaseService();
        await dbService.init();

        // Find the group
        const group = await dbService.groups.findByName(name);
        if (!group) {
          console.error(
            semantic.messageError(`❌ Group "${name}" not found`)
          );
          process.exit(1);
        }

        // Get servers in the group for display
        const serverCount = group.serverIds.length;

        // Confirm deletion unless --force is used
        if (!options.force) {
          const answers = await inquirer.prompt([
            {
              type: "confirm",
              name: "confirmDelete",
              message: `Are you sure you want to delete group "${name}"? (contains ${serverCount} server${serverCount === 1 ? '' : 's'})`,
              default: false,
            },
          ]);

          if (!answers.confirmDelete) {
            console.log(theme.info("Deletion cancelled."));
            await dbService.close();
            return;
          }
        }

        // Delete the group
        const deleted = await dbService.groups.delete(group.id);

        if (deleted) {
          output.displaySeparator();
          console.log(
            semantic.messageSuccess(`✅ Group "${name}" deleted successfully`)
          );
          
          if (serverCount > 0) {
            console.log(theme.info(`   Note: The ${serverCount} server${serverCount === 1 ? '' : 's'} in this group were not affected.`));
          }
        } else {
          console.error(
            semantic.messageError(`❌ Failed to delete group "${name}"`)
          );
          process.exit(1);
        }

        await dbService.close();
      } catch (error) {
        logger.error("Failed to delete group:", error);
        console.error(
          semantic.messageError(`❌ Failed to delete group: ${(error as Error).message}`)
        );
        process.exit(1);
      }
    });

  return deleteCmd;
}