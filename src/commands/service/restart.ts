/**
 * Service restart command implementation using Forever
 */

import { Command } from "commander";
import { ForeverServiceManager } from "../../service/forever-manager.js";
import { theme, semantic } from "../../utils/theme.js";
import ora from "ora";

/**
 * Create the service restart command
 */
export function createRestartCommand(): Command {
  return new Command("restart")
    .description("Restart the hypertool-mcp background service")
    .option("--profile <profile>", "Service profile (development, production)")
    .option("--port <number>", "HTTP port to listen on", (value) =>
      parseInt(value, 10)
    )
    .option("--host <host>", "HTTP host to bind to")
    .option("--mcp-config <path>", "Path to MCP configuration file")
    .option(
      "--log-level <level>",
      "Log level (trace, debug, info, warn, error, fatal)"
    )
    .option("--debug", "Enable debug mode", false)
    .option("--equip-toolset <name>", "Toolset to equip on startup")
    .option("--group <name>", "Server group to load")
    .addHelpText(
      "after",
      `
Examples:
  hypertool-mcp service restart                   # Restart with current settings
  hypertool-mcp service restart --profile prod    # Restart with production profile
  hypertool-mcp service restart --port 8080       # Restart on different port`
    )
    .action(async (options) => {
      await handleRestartCommand(options);
    });
}

/**
 * Handle the restart command
 */
async function handleRestartCommand(options: any): Promise<void> {
  let spinner = ora("Checking service status...").start();

  try {
    // Get current status
    const currentStatus = await ForeverServiceManager.status();
    const wasRunning = currentStatus.running;

    if (wasRunning) {
      spinner.text = `Found running service: ${currentStatus.profile} (PID: ${currentStatus.pid})`;
      spinner.succeed();
      console.log("");
    } else {
      spinner.text = "No running service found";
      spinner.info();
      console.log("");
    }

    // Restart the service
    spinner = ora("Restarting hypertool-mcp service...").start();

    const newStatus = await ForeverServiceManager.restart({
      profile: options.profile || currentStatus.profile,
      port: options.port,
      host: options.host,
      mcpConfig: options.mcpConfig,
      logLevel: options.logLevel,
      debug: options.debug,
      equipToolset: options.equipToolset,
      group: options.group,
    });

    spinner.succeed();
    console.log("");
    console.log(semantic.messageSuccess("✅ Service restarted successfully"));
    console.log("");
    console.log(theme.label("Service Information:"));
    console.log(theme.info(`  Status: running`));
    console.log(theme.info(`  PID: ${newStatus.pid}`));
    console.log(theme.info(`  Profile: ${newStatus.profile}`));
    console.log(
      theme.info(
        `  HTTP: http://${newStatus.host || "localhost"}:${newStatus.port}`
      )
    );

    if (wasRunning) {
      console.log(
        theme.info(`  Previous PID: ${currentStatus.pid} (terminated)`)
      );
    }

    console.log("");
    console.log(theme.label("Next Steps:"));
    console.log(theme.muted("  • Check status: hypertool-mcp service status"));
    console.log(theme.muted("  • View logs: hypertool-mcp service logs"));
    console.log(
      theme.muted(
        `  • Test HTTP: curl http://${newStatus.host || "localhost"}:${newStatus.port}/health`
      )
    );
  } catch (error) {
    spinner.fail();
    console.error("");
    console.error(semantic.messageError("❌ Failed to restart service"));
    console.error(theme.warning(`   Error: ${(error as Error).message}`));

    console.error("");
    console.error(theme.info("💡 Troubleshooting:"));
    console.error(
      theme.muted("   • Check service status: hypertool-mcp service status")
    );
    console.error(theme.muted("   • View logs: hypertool-mcp service logs"));
    console.error(theme.muted("   • Try manual stop/start:"));
    console.error(theme.muted("     - hypertool-mcp service stop"));
    console.error(theme.muted("     - hypertool-mcp service start"));

    process.exit(1);
  }
}
