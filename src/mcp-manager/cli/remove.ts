/**
 * CLI command for removing MCP servers
 */

import { Command } from "commander";
import inquirer from "inquirer";
import { MCPServerManager } from "../index.js";
import { output } from "../../utils/output.js";
import { theme } from "../../utils/theme.js";

export function createRemoveCommand(): Command {
  const remove = new Command("remove");

  remove
    .description("Remove an MCP server")
    .argument("<name>", "Server name to remove")
    .option("--force", "Skip confirmation prompt")
    .action(async (name, options) => {
      try {
        const manager = new MCPServerManager();
        await manager.initialize();

        // Check if server exists
        const server = await manager.getServer(name);
        if (!server) {
          output.error(`❌ Server '${name}' not found`);
          process.exit(1);
        }

        // Show server details
        output.displayHeader(`Remove MCP Server: ${name}`);
        output.displaySpaceBuffer(1);
        output.info(
          `${theme.label("Type:")} ${theme.value(server.config.type)}`
        );

        if (server.config.type === "stdio") {
          output.info(
            `${theme.label("Command:")} ${theme.value(server.config.command || "N/A")}`
          );
        } else {
          output.info(
            `${theme.label("URL:")} ${theme.value(server.config.url || "N/A")}`
          );
        }

        if (server.metadata) {
          output.info(
            `${theme.label("Source:")} ${theme.value(server.metadata.app)}`
          );
        }

        output.displaySpaceBuffer(1);

        // Confirm removal unless forced
        if (!options.force) {
          const { confirm } = await inquirer.prompt([
            {
              type: "confirm",
              name: "confirm",
              message: theme.warning(
                `⚠️  Are you sure you want to remove '${name}'?`
              ),
              default: false,
            },
          ]);

          if (!confirm) {
            output.info("Removal cancelled.");
            return;
          }
        }

        // Remove the server
        await manager.removeServer(name);

        output.success(`✅ Removed MCP server '${name}'`);
      } catch (error) {
        output.error("❌ Failed to remove MCP server:");
        output.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });

  return remove;
}
