/**
 * CLI command for listing server groups
 */

import { Command } from "commander";
import { getDatabaseService } from "../../../db/nedbService.js";
import { theme, semantic } from "../../../utils/theme.js";
import { output } from "../../../utils/output.js";
import { createChildLogger } from "../../../utils/logging.js";

const logger = createChildLogger({ module: "mcp-manager/group/list" });

export function createGroupListCommand(): Command {
  const list = new Command("list");

  list
    .description("List all server groups")
    .option("-j, --json", "Output in JSON format")
    .action(async (options) => {
      try {
        // Initialize database
        const dbService = getDatabaseService();
        await dbService.init();

        // Get all groups
        const groups = await dbService.groups.findAll();

        // Output in JSON format if requested
        if (options.json) {
          const jsonOutput = await Promise.all(
            groups.map(async (group) => ({
              id: group.id,
              name: group.name,
              description: group.description,
              serverCount: group.serverIds.length,
              serverIds: group.serverIds,
            }))
          );
          console.log(JSON.stringify(jsonOutput, null, 2));
          await dbService.close();
          return;
        }

        // Display in table format
        if (groups.length === 0) {
          console.log(theme.info("No server groups found."));
          console.log(theme.muted("\nTo create a group:"));
          console.log(theme.command("  hypertool-mcp mcp group create <name>"));
        } else {
          output.displaySubHeader("Server Groups");
          output.displaySpaceBuffer();

          for (const group of groups) {
            console.log(theme.label(`📁 ${group.name}`));
            if (group.description) {
              console.log(theme.muted(`   ${group.description}`));
            }
            console.log(theme.info(`   Servers: ${group.serverIds.length}`));
            console.log(theme.muted(`   ID: ${group.id}`));
            console.log();
          }

          output.displaySeparator();
          console.log(theme.info(`Total groups: ${groups.length}`));
        }

        await dbService.close();
      } catch (error) {
        logger.error("Failed to list groups:", error);
        console.error(
          semantic.messageError(`❌ Failed to list groups: ${(error as Error).message}`)
        );
        process.exit(1);
      }
    });

  return list;
}