/**
 * Show server name conflicts between sources
 */

import { Command } from "commander";
import { theme } from "../../utils/theme.js";
import { output } from "../../utils/output.js";
import { getCompositeDatabaseService } from "../../db/compositeDatabaseService.js";
import { ServerConfigRecord } from "../../db/interfaces.js";

export function createShowConflictsCommand(): Command {
  const conflicts = new Command("conflicts");

  conflicts
    .description("Show server name conflicts between different sources")
    .option("--json", "Output in JSON format")
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

        const servers = await dbService.servers.findAll();
        const sources = await dbService.configSources.findAll();

        // Group servers by name
        const serversByName = new Map<string, ServerConfigRecord[]>();
        for (const server of servers) {
          const existing = serversByName.get(server.name) || [];
          existing.push(server);
          serversByName.set(server.name, existing);
        }

        // Find conflicts (names with multiple servers from different sources)
        const conflicts: Array<{
          name: string;
          servers: Array<{
            sourceId?: string;
            sourceType?: string;
            sourcePath?: string;
            priority?: number;
            lastModified: number;
            type: string;
          }>;
        }> = [];

        for (const [name, nameServers] of serversByName) {
          if (nameServers.length > 1) {
            // Check if they're from different sources
            const uniqueSources = new Set(nameServers.map((s) => s.sourceId));
            if (uniqueSources.size > 1) {
              const conflictData = await Promise.all(
                nameServers.map(async (server) => {
                  const source = server.sourceId
                    ? await dbService.configSources.findById(server.sourceId)
                    : null;
                  return {
                    sourceId: server.sourceId,
                    sourceType: source?.type,
                    sourcePath: source?.path,
                    priority: source?.priority,
                    lastModified: server.lastModified,
                    type: server.type,
                  };
                })
              );

              conflicts.push({ name, servers: conflictData });
            }
          }
        }

        if (options.json) {
          output.log(JSON.stringify(conflicts, null, 2));
        } else {
          output.displayHeader("⚠️  Server Name Conflicts");
          output.displaySpaceBuffer(1);

          if (conflicts.length === 0) {
            output.success(
              "  No conflicts found - all server names are unique across sources"
            );
          } else {
            output.warn(
              `  Found ${conflicts.length} conflicting server name(s)`
            );
            output.displaySpaceBuffer(1);

            for (const conflict of conflicts) {
              output.displayInstruction(`  • ${theme.primary(conflict.name)}`);

              // Sort by priority (highest first)
              conflict.servers.sort(
                (a, b) => (b.priority || 0) - (a.priority || 0)
              );

              for (const server of conflict.servers) {
                const winner = server === conflict.servers[0] ? " ✅" : " ❌";
                output.info(
                  `    ${winner} Source: ${theme.muted(`${server.sourceType} (${server.sourcePath})`)}`
                );
                output.info(
                  `       Priority: ${theme.muted(server.priority?.toString() || "0")}`
                );
                output.info(
                  `       Modified: ${theme.muted(new Date(server.lastModified).toLocaleString())}`
                );
              }

              output.displaySpaceBuffer(1);
            }

            output.info("  ✅ = Currently active (highest priority)");
            output.info("  ❌ = Overridden by higher priority source");
          }
        }
      } catch (error) {
        output.error("❌ Failed to show conflicts:");
        output.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });

  return conflicts;
}
