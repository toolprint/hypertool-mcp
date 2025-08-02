/**
 * Show all server groups in the database
 */

import { Command } from "commander";
import { theme } from "../../utils/theme.js";
import { output } from "../../utils/output.js";
import { getDatabaseService } from "../../db/nedbService.js";
import { isNedbEnabled } from "../../config/environment.js";

export function createShowGroupsCommand(): Command {
  const groups = new Command("groups");

  groups
    .description("Show all server groups in the database")
    .option("--json", "Output in JSON format")
    .option("--format <format>", "Output format: table, list, json", "list")
    .option("--members", "Show group member server names")
    .action(async (options) => {
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

        const groups = await dbService.groups.findAll();

        const format = options.json ? "json" : options.format;

        if (format === "json") {
          // Include server details in JSON output
          const groupsWithServers = await Promise.all(
            groups.map(async (group) => {
              const servers = await dbService.groups.findServersInGroup(
                group.id
              );
              return {
                id: group.id,
                name: group.name,
                description: group.description,
                serverIds: group.serverIds,
                servers: servers.map((s) => ({ name: s.name, type: s.type })),
              };
            })
          );
          output.log(JSON.stringify(groupsWithServers, null, 2));
        } else if (format === "table") {
          await displayGroupsTable(groups, options.members);
        } else {
          output.displayHeader("👥 Server Groups");
          output.displaySpaceBuffer(1);

          if (groups.length === 0) {
            output.warn("  No groups found");
          } else {
            output.info(`  Total: ${groups.length} group(s)`);
            output.displaySpaceBuffer(1);

            for (const group of groups) {
              const servers = await dbService.groups.findServersInGroup(
                group.id
              );
              output.displayInstruction(`  • ${theme.primary(group.name)}`);

              if (group.description) {
                output.info(`    ${theme.muted(group.description)}`);
              }

              output.info(
                `    Servers: ${theme.muted(servers.length.toString())}`
              );

              if (servers.length > 0 && options.members) {
                const serverNames = servers.map((s) => s.name).join(", ");
                output.info(`    Members: ${theme.muted(serverNames)}`);
              }

              output.displaySpaceBuffer(1);
            }
          }
        }
      } catch (error) {
        output.error("❌ Failed to show groups:");
        output.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });

  return groups;
}

/**
 * Display groups in table format
 */
async function displayGroupsTable(groups: any[], showMembers: boolean) {
  const dbService = getDatabaseService();

  output.displayHeader("👥 Server Groups");
  output.displaySpaceBuffer(1);

  if (groups.length === 0) {
    output.warn("  No groups found");
    return;
  }

  // Prepare table data
  const tableData = [];

  for (const group of groups) {
    const servers = await dbService.groups.findServersInGroup(group.id);
    const row: any = {
      Name: group.name,
      Servers: servers.length,
    };

    if (group.description) {
      row.Description =
        group.description.substring(0, 40) +
        (group.description.length > 40 ? "..." : "");
    }

    if (showMembers && servers.length > 0) {
      row.Members =
        servers
          .map((s) => s.name)
          .join(", ")
          .substring(0, 50) +
        (servers.map((s) => s.name).join(", ").length > 50 ? "..." : "");
    }

    tableData.push(row);
  }

  // Display table
  if (tableData.length > 0) {
    console.table(tableData);
  }
}
