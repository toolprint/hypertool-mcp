/**
 * CLI command for creating server groups
 */

import { Command } from "commander";
import inquirer from "inquirer";
import { getCompositeDatabaseService } from "../../../db/compositeDatabaseService.js";
import { theme, semantic } from "../../../utils/theme.js";
import { output } from "../../../utils/output.js";
import { createChildLogger } from "../../../utils/logging.js";

const logger = createChildLogger({ module: "mcp-manager/group/create" });

export function createGroupCreateCommand(): Command {
  const create = new Command("create");

  create
    .description("Create a new server group")
    .argument("[name]", "Name of the group")
    .option("-d, --description <description>", "Group description")
    .option("-s, --servers <servers...>", "Server names to add to the group")
    .action(async (name, options) => {
      try {
        // Initialize database
        const dbService = getCompositeDatabaseService();
        await dbService.init();

        // Prompt for name if not provided
        if (!name) {
          const answers = await inquirer.prompt([
            {
              type: "input",
              name: "name",
              message: "Group name:",
              validate: (value) => {
                if (!value.trim()) {
                  return "Group name is required";
                }
                if (!/^[a-zA-Z0-9-_]+$/.test(value)) {
                  return "Group name can only contain letters, numbers, hyphens, and underscores";
                }
                return true;
              },
            },
          ]);
          name = answers.name;
        }

        // Check if group already exists
        const existingGroup = await dbService.groups.findByName(name);
        if (existingGroup) {
          console.error(
            semantic.messageError(`❌ Group "${name}" already exists`)
          );
          process.exit(1);
        }

        // Prompt for description if not provided
        let description = options.description;
        if (!description) {
          const answers = await inquirer.prompt([
            {
              type: "input",
              name: "description",
              message: "Group description (optional):",
            },
          ]);
          description = answers.description;
        }

        // Process server names if provided
        const serverIds: string[] = [];
        if (options.servers && options.servers.length > 0) {
          for (const serverName of options.servers) {
            const server = await dbService.servers.findByName(serverName);
            if (!server) {
              console.warn(
                theme.warning(`⚠️  Server "${serverName}" not found, skipping`)
              );
              continue;
            }
            serverIds.push(server.id);
          }
        }

        // Create the group
        const group = await dbService.groups.add({
          name,
          description: description || undefined,
          serverIds,
        });

        output.displaySeparator();
        console.log(
          semantic.messageSuccess(`✅ Group "${name}" created successfully`)
        );
        console.log(theme.info(`   ID: ${group.id}`));
        if (group.description) {
          console.log(theme.info(`   Description: ${group.description}`));
        }
        console.log(theme.info(`   Servers: ${serverIds.length}`));

        if (serverIds.length === 0) {
          output.displaySpaceBuffer();
          console.log(theme.muted("To add servers to this group:"));
          console.log(
            theme.command(`  hypertool-mcp mcp group add ${name} <server-name>`)
          );
        }

        await dbService.close();
      } catch (error) {
        logger.error("Failed to create group:", error);
        console.error(
          semantic.messageError(
            `❌ Failed to create group: ${(error as Error).message}`
          )
        );
        process.exit(1);
      }
    });

  return create;
}
