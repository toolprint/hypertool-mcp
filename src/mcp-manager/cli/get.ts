/**
 * CLI command for getting MCP server details
 */

import { Command } from "commander";
import { MCPServerManager } from "../index.js";
import { output } from "../../utils/output.js";
import { theme } from "../../utils/theme.js";

export function createGetCommand(): Command {
  const get = new Command("get");

  get
    .description("Get details of a specific MCP server")
    .argument("<name>", "Server name")
    .option("--json", "Output in JSON format")
    .action(async (name, options) => {
      try {
        const manager = new MCPServerManager();
        await manager.initialize();

        const server = await manager.getServer(name);

        if (!server) {
          output.error(`❌ Server '${name}' not found`);
          process.exit(1);
        }

        if (options.json) {
          // JSON output
          output.log(JSON.stringify(server, null, 2));
        } else {
          // Formatted output
          output.displayHeader(`MCP Server: ${server.name}`);
          output.displaySpaceBuffer(1);

          // Basic info
          output.info(
            `${theme.label("Type:")} ${theme.value(server.config.type)}`
          );

          // Transport-specific info
          if (server.config.type === "stdio") {
            output.info(
              `${theme.label("Command:")} ${theme.value(server.config.command || "N/A")}`
            );
            if (server.config.args && server.config.args.length > 0) {
              output.info(
                `${theme.label("Arguments:")} ${theme.value(JSON.stringify(server.config.args))}`
              );
            }
          } else {
            output.info(
              `${theme.label("URL:")} ${theme.value(server.config.url || "N/A")}`
            );
          }

          // Environment variables
          if (server.config.env && Object.keys(server.config.env).length > 0) {
            output.displaySpaceBuffer(1);
            output.info(theme.label("Environment Variables:"));
            for (const [key, value] of Object.entries(server.config.env)) {
              output.info(`  ${theme.subtle(key)}=${theme.value(value)}`);
            }
          }

          // Headers (for HTTP/SSE)
          if (
            server.config.headers &&
            Object.keys(server.config.headers).length > 0
          ) {
            output.displaySpaceBuffer(1);
            output.info(theme.label("Headers:"));
            for (const [key, value] of Object.entries(server.config.headers)) {
              output.info(`  ${theme.subtle(key)}: ${theme.value(value)}`);
            }
          }

          // Metadata
          if (server.metadata) {
            output.displaySpaceBuffer(1);
            output.info(theme.label("Metadata:"));
            output.info(
              `  ${theme.subtle("Source:")} ${theme.value(server.metadata.app)}`
            );
            output.info(
              `  ${theme.subtle("Imported:")} ${theme.value(server.metadata.importedAt)}`
            );
            if (server.metadata.addedManually) {
              output.info(
                `  ${theme.subtle("Added:")} ${theme.value("Manually")}`
              );
            }
          }
        }
      } catch (error) {
        output.error("❌ Failed to get MCP server:");
        output.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });

  return get;
}
