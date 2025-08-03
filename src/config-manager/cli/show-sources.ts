/**
 * Show all configuration sources
 */

import { Command } from "commander";
import { theme } from "../../utils/theme.js";
import { output } from "../../utils/output.js";
import { getCompositeDatabaseService } from "../../db/compositeDatabaseService.js";
import { isNedbEnabledAsync } from "../../config/environment.js";

export function createShowSourcesCommand(): Command {
  const sources = new Command("sources");

  sources
    .description("Show all configuration sources in the database")
    .option("--json", "Output in JSON format")
    .action(async (options) => {
      try {
        // Check if NeDB is enabled
        if (!(await isNedbEnabledAsync())) {
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

        const sources = await dbService.configSources.findAll();

        if (options.json) {
          output.log(JSON.stringify(sources, null, 2));
        } else {
          output.displayHeader("📂 Configuration Sources");
          output.displaySpaceBuffer(1);

          if (sources.length === 0) {
            output.warn("  No configuration sources found");
          } else {
            output.info(`  Total: ${sources.length} source(s)`);
            output.displaySpaceBuffer(1);

            // Sort by priority (highest first)
            sources.sort((a, b) => b.priority - a.priority);

            for (const source of sources) {
              const typeIcon =
                source.type === "global"
                  ? "🌍"
                  : source.type === "app"
                    ? "📱"
                    : "👤";
              output.displayInstruction(
                `  ${typeIcon} ${theme.primary(source.type)} - ${source.path}`
              );
              output.info(
                `    Priority: ${theme.muted(source.priority.toString())}`
              );

              if (source.appId) {
                output.info(`    App ID: ${theme.muted(source.appId)}`);
              }

              if (source.profileId) {
                output.info(`    Profile: ${theme.muted(source.profileId)}`);
              }

              // Count servers from this source
              const servers = await dbService.servers.findAll();
              const sourceServers = servers.filter(
                (s) => s.sourceId === source.id
              );
              output.info(
                `    Servers: ${theme.muted(sourceServers.length.toString())}`
              );

              output.info(
                `    Last Synced: ${theme.muted(new Date(source.lastSynced).toLocaleString())}`
              );
              output.displaySpaceBuffer(1);
            }
          }
        }
      } catch (error) {
        output.error("❌ Failed to show sources:");
        output.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });

  return sources;
}
