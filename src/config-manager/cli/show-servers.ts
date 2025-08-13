/**
 * Show all servers in the database
 */

import { Command } from "commander";
import { theme } from "../../utils/theme.js";
import { output } from "../../utils/output.js";
import { getCompositeDatabaseService } from "../../db/compositeDatabaseService.js";

export function createShowServersCommand(): Command {
  const servers = new Command("servers");

  servers
    .description("Show all MCP servers stored in the database")
    .option("--source <source>", "Filter by config source ID")
    .option("--type <type>", "Filter by server type (stdio, http, sse)")
    .option("--group <group>", "Show only servers in a specific group")
    .option("--json", "Output in JSON format")
    .option("--format <format>", "Output format: table, list, json", "list")
    .option("--no-details", "Show only server names")
    .action(async (options) => {
      try {
        // Check if NeDB is enabled
        if (!false) {
          output.error(
            "❌ Database features are not available when HYPERTOOL_NEDB_ENABLED is not set"
          );
          output.info(
            "To enable database features, set: export HYPERTOOL_NEDB_ENABLED=true"
          );
          process.exit(1);
        }

        const dbService = getCompositeDatabaseService();
        await dbService.init();

        let servers = await dbService.servers.findAll();

        // Apply filters
        if (options.source) {
          servers = servers.filter((s) => s.sourceId === options.source);
        }

        if (options.type) {
          servers = servers.filter((s) => s.type === options.type);
        }

        if (options.group) {
          const group = await dbService.groups.findByName(options.group);
          if (!group) {
            output.error(`❌ Group "${options.group}" not found`);
            process.exit(1);
          }
          const groupServers = await dbService.groups.findServersInGroup(
            group.id
          );
          servers = groupServers;
        }

        // Handle output format
        const format = options.json ? "json" : options.format;

        if (format === "json") {
          output.log(JSON.stringify(servers, null, 2));
        } else if (format === "table") {
          displayServersTable(servers, options.details !== false);
        } else {
          output.displayHeader("📡 MCP Servers in Database");
          output.displaySpaceBuffer(1);

          if (servers.length === 0) {
            output.warn("  No servers found");
          } else {
            output.info(`  Total: ${servers.length} server(s)`);
            output.displaySpaceBuffer(1);

            if (options.details === false) {
              // Simple list without details
              for (const server of servers) {
                output.info(
                  `  • ${theme.primary(server.name)} (${theme.muted(server.type)})`
                );
              }
            } else {
              // Detailed list
              for (const server of servers) {
                output.displayInstruction(`  • ${theme.primary(server.name)}`);
                output.info(`    Type: ${theme.muted(server.type)}`);

                if (server.sourceId) {
                  const source = await dbService.configSources.findById(
                    server.sourceId
                  );
                  if (source) {
                    output.info(
                      `    Source: ${theme.muted(`${source.type} (${source.path})`)}`
                    );
                  }
                }

                if (server.type === "stdio" && "command" in server.config) {
                  output.info(
                    `    Command: ${theme.muted(server.config.command)}`
                  );
                } else if (
                  (server.type === "http" || server.type === "sse") &&
                  "url" in server.config
                ) {
                  output.info(`    URL: ${theme.muted(server.config.url)}`);
                }

                output.info(
                  `    Modified: ${theme.muted(new Date(server.lastModified).toLocaleString())}`
                );
                output.displaySpaceBuffer(1);
              }
            }
          }
        }
      } catch (error) {
        output.error("❌ Failed to show servers:");
        output.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });

  return servers;
}

/**
 * Display servers in table format
 */
async function displayServersTable(servers: any[], showDetails: boolean) {
  const dbService = getCompositeDatabaseService();

  output.displayHeader("📡 MCP Servers in Database");
  output.displaySpaceBuffer(1);

  if (servers.length === 0) {
    output.warn("  No servers found");
    return;
  }

  // Prepare table data
  const tableData = [];

  for (const server of servers) {
    const row: any = {
      Name: server.name,
      Type: server.type,
    };

    if (showDetails) {
      // Get source info
      if (server.sourceId) {
        const source = await dbService.configSources.findById(server.sourceId);
        row.Source = source ? `${source.type}` : "unknown";
      } else {
        row.Source = "none";
      }

      // Get connection info
      if (server.type === "stdio" && "command" in server.config) {
        row.Connection =
          server.config.command.substring(0, 30) +
          (server.config.command.length > 30 ? "..." : "");
      } else if (
        (server.type === "http" || server.type === "sse") &&
        "url" in server.config
      ) {
        row.Connection = server.config.url;
      } else {
        row.Connection = "-";
      }

      row.Modified = new Date(server.lastModified).toLocaleDateString();
    }

    tableData.push(row);
  }

  // Display table
  if (tableData.length > 0) {
    console.table(tableData);
  }
}
