/**
 * Service logs command implementation using Forever
 */

import { Command } from "commander";
import { ForeverServiceManager } from "../../service/forever-manager.js";
import { theme, semantic } from "../../utils/theme.js";
import { spawn } from "child_process";

/**
 * Create the service logs command
 */
export function createLogsCommand(): Command {
  return new Command("logs")
    .description("View hypertool-mcp service logs")
    .option("--follow", "Follow log output in real-time (like tail -f)", false)
    .option(
      "--tail <number>",
      "Number of lines to show from the end",
      (value) => parseInt(value, 10),
      50
    )
    .addHelpText(
      "after",
      `
Examples:
  hypertool-mcp service logs                      # Show last 50 log lines
  hypertool-mcp service logs --follow             # Follow logs in real-time
  hypertool-mcp service logs --tail 100           # Show last 100 lines`
    )
    .action(async (options) => {
      await handleLogsCommand(options);
    });
}

/**
 * Handle the logs command
 */
async function handleLogsCommand(options: any): Promise<void> {
  try {
    // Get service status to determine profile
    const status = await ForeverServiceManager.status();
    const profile = status.profile || "development";

    console.log(theme.info(`📋 Showing logs for ${profile} profile`));
    console.log("");

    if (options.follow) {
      // Get log file path for following
      const logFile = await ForeverServiceManager.getLogs({ follow: true });

      console.log(theme.label(`Log File: ${logFile}`));
      console.log("");
      console.log(theme.info("Following logs... (Press Ctrl+C to stop)"));
      console.log("");

      // Use tail -f to follow the file
      const tailProcess = spawn("tail", ["-f", logFile], {
        stdio: ["ignore", "pipe", "pipe"],
      });

      tailProcess.stdout?.on("data", (data) => {
        process.stdout.write(data);
      });

      tailProcess.stderr?.on("data", (data) => {
        process.stderr.write(data);
      });

      tailProcess.on("error", (error) => {
        console.error(theme.warning(`Failed to follow logs: ${error.message}`));
      });

      // Handle process termination
      process.on("SIGINT", () => {
        console.log("");
        console.log(theme.info("Stopping log follow..."));
        tailProcess.kill();
        process.exit(0);
      });
    } else {
      // Show static logs
      const logs = await ForeverServiceManager.getLogs({ tail: options.tail });

      if (!logs) {
        console.log(theme.muted("No log entries found"));
        return;
      }

      console.log(logs);
      console.log("");

      const lines = logs.split("\n").filter((line) => line.trim()).length;
      console.log(theme.muted(`Showing ${lines} log entries`));
    }
  } catch (error) {
    console.error("");
    console.error(semantic.messageError("❌ Failed to read logs"));
    console.error(theme.warning(`   Error: ${(error as Error).message}`));

    if ((error as Error).message.includes("not found")) {
      console.error("");
      console.error(theme.info("💡 Possible reasons:"));
      console.error(theme.muted("   • Service has not been started yet"));
      console.error(theme.muted("   • Log files have been deleted"));
      console.error("");
      console.error(theme.label("Try:"));
      console.error(
        theme.muted("   • hypertool-mcp service start (to generate logs)")
      );
    }

    process.exit(1);
  }
}
