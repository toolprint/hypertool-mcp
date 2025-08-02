/**
 * Export server groups to standard mcp.json format
 */

import { Command } from "commander";
import { theme } from "../../utils/theme.js";
import { output } from "../../utils/output.js";
import { getDatabaseService } from "../../db/nedbService.js";
import { promises as fs } from "fs";
import { dirname } from "path";
import { ServerConfig } from "../../types/config.js";
import { isNedbEnabled } from "../../config/environment.js";

export function createExportCommand(): Command {
  const exportCmd = new Command("export");

  exportCmd
    .description("Export server group to standard mcp.json format")
    .argument("<group>", "Server group name to export")
    .option("-o, --output <path>", "Output file path (defaults to stdout)")
    .option("--include-metadata", "Include group metadata in export")
    .option("--pretty", "Pretty print JSON output", true)
    .action(async (groupName, options) => {
      try {
        // Check if NeDB is enabled
        if (!isNedbEnabled()) {
          output.error(
            "❌ Database features are not available when HYPERTOOL_NEDB_ENABLED is not set"
          );
          output.info(
            "To enable database features, set: export HYPERTOOL_NEDB_ENABLED=true"
          );
          process.exit(1);
        }

        const dbService = getDatabaseService();
        await dbService.init();

        // Find the group
        const group = await dbService.groups.findByName(groupName);
        if (!group) {
          output.error(`❌ Group "${groupName}" not found`);
          process.exit(1);
        }

        // Get all servers in the group
        const servers = await dbService.groups.findServersInGroup(group.id);

        if (servers.length === 0) {
          output.warn(`⚠️  Group "${groupName}" has no servers`);
        }

        // Build the mcp.json structure
        const mcpConfig: any = {
          mcpServers: {},
        };

        // Add each server to the config
        for (const server of servers) {
          // Convert internal ServerConfig to the format expected in mcp.json
          const serverConfig: any = {
            type: server.config.type,
          };

          // Add type-specific fields
          if (server.config.type === "stdio" && "command" in server.config) {
            serverConfig.command = server.config.command;
            if ("args" in server.config && server.config.args) {
              serverConfig.args = server.config.args;
            }
            if ("env" in server.config && server.config.env) {
              serverConfig.env = server.config.env;
            }
          } else if (
            (server.config.type === "http" || server.config.type === "sse") &&
            "url" in server.config
          ) {
            serverConfig.url = server.config.url;
            if ("headers" in server.config && server.config.headers) {
              serverConfig.headers = server.config.headers;
            }
          }

          mcpConfig.mcpServers[server.name] = serverConfig;
        }

        // Add metadata if requested
        if (options.includeMetadata) {
          mcpConfig._metadata = {
            exportedFrom: "hypertool-mcp",
            exportDate: new Date().toISOString(),
            groupName: group.name,
            groupDescription: group.description,
            serverCount: servers.length,
          };
        }

        // Format output
        const jsonOutput = options.pretty
          ? JSON.stringify(mcpConfig, null, 2)
          : JSON.stringify(mcpConfig);

        // Write to file or stdout
        if (options.output) {
          // Ensure directory exists
          const dir = dirname(options.output);
          await fs.mkdir(dir, { recursive: true });

          // Write file
          await fs.writeFile(options.output, jsonOutput, "utf-8");
          output.success(
            `✅ Exported group "${groupName}" to ${options.output}`
          );
          output.info(`   ${servers.length} server(s) exported`);
        } else {
          // Output to stdout
          console.log(jsonOutput);
        }
      } catch (error) {
        output.error("❌ Failed to export group:");
        output.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });

  return exportCmd;
}
