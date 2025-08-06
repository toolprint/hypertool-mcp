/**
 * Service start command implementation using Forever
 */

import { Command } from "commander";
import { ForeverServiceManager } from "../../service/forever-manager.js";
import { theme, semantic } from "../../utils/theme.js";
import ora from "ora";

/**
 * Create the service start command
 */
export function createStartCommand(): Command {
  return new Command("start")
    .description("Start the hypertool-mcp background service")
    .option(
      "--profile <profile>",
      "Service profile (development, production)",
      "development"
    )
    .option("--port <number>", "HTTP port to listen on", (value) =>
      parseInt(value, 10)
    )
    .option("--host <host>", "HTTP host to bind to", "localhost")
    .option("--mcp-config <path>", "Path to MCP configuration file")
    .option(
      "--log-level <level>",
      "Log level (trace, debug, info, warn, error, fatal)"
    )
    .option("--debug", "Enable debug mode", false)
    .option("--equip-toolset <name>", "Toolset to equip on startup")
    .option("--group <name>", "Server group to load")
    .option("--force", "Force start even if already running", false)
    .addHelpText(
      "after",
      `
Examples:
  hypertool-mcp service start                    # Start with default settings
  hypertool-mcp service start --profile prod     # Start production profile
  hypertool-mcp service start --port 8080        # Start on custom port
  hypertool-mcp service start --debug            # Start with debug logging`
    )
    .action(async (options) => {
      await handleStartCommand(options);
    });
}

/**
 * Handle the start command
 */
async function handleStartCommand(options: any): Promise<void> {
  const spinner = ora("Starting hypertool-mcp service...").start();

  try {
    // Check if already running
    if (!options.force) {
      const currentStatus = await ForeverServiceManager.status();
      if (currentStatus.running) {
        spinner.fail();
        console.error("");
        console.error(
          semantic.messageError(
            `❌ Service is already running (${currentStatus.profile}, PID: ${currentStatus.pid})`
          )
        );
        console.error(
          theme.info(
            "   Use --force to start anyway, or stop the existing service first"
          )
        );
        console.error("");
        console.error(theme.label("Commands:"));
        console.error(theme.muted("   • hypertool-mcp service stop"));
        console.error(theme.muted("   • hypertool-mcp service restart"));
        process.exit(1);
      }
    }

    // Start the service
    const status = await ForeverServiceManager.start({
      profile: options.profile,
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
    console.log(semantic.messageSuccess("✅ Service started successfully"));
    console.log("");
    console.log(theme.label("Service Information:"));
    console.log(theme.info(`  Status: running`));
    console.log(theme.info(`  PID: ${status.pid}`));
    console.log(theme.info(`  Profile: ${status.profile}`));
    console.log(
      theme.info(`  HTTP: http://${status.host || "localhost"}:${status.port}`)
    );

    if (status.logFile) {
      console.log(theme.info(`  Log File: ${status.logFile}`));
    }

    console.log("");
    console.log(theme.label("Next Steps:"));
    console.log(theme.muted("  • Check status: hypertool-mcp service status"));
    console.log(theme.muted("  • View logs: hypertool-mcp service logs"));
    console.log(theme.muted("  • Health check: hypertool-mcp service health"));
    console.log(
      theme.muted(
        `  • Test HTTP: curl http://${status.host || "localhost"}:${status.port}/health`
      )
    );
  } catch (error) {
    spinner.fail();
    console.error("");
    console.error(semantic.messageError("❌ Failed to start service"));
    console.error(theme.warning(`   Error: ${(error as Error).message}`));

    // Provide helpful troubleshooting
    const errorMessage = (error as Error).message.toLowerCase();

    if (errorMessage.includes("already running")) {
      console.error("");
      console.error(theme.info("💡 Troubleshooting:"));
      console.error(
        theme.muted("   • Check status: hypertool-mcp service status")
      );
      console.error(
        theme.muted("   • Stop existing: hypertool-mcp service stop")
      );
      console.error(
        theme.muted("   • Force restart: hypertool-mcp service restart")
      );
    } else if (errorMessage.includes("port")) {
      console.error("");
      console.error(theme.info("💡 Troubleshooting:"));
      console.error(theme.muted("   • Check if port is in use: lsof -i :3000"));
      console.error(theme.muted("   • Use different port: --port 8080"));
    } else if (errorMessage.includes("permission")) {
      console.error("");
      console.error(theme.info("💡 Troubleshooting:"));
      console.error(theme.muted("   • Check file permissions"));
      console.error(theme.muted("   • Ensure log directory is writable"));
    }

    process.exit(1);
  }
}
