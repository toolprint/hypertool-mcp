/**
 * Service status command implementation using Forever
 */

import { Command } from "commander";
import { ForeverServiceManager } from "../../service/forever-manager.js";
import { theme, semantic } from "../../utils/theme.js";
import ora from "ora";
import axios from "axios";

/**
 * Create the service status command
 */
export function createStatusCommand(): Command {
  return new Command("status")
    .description("Check hypertool-mcp service status")
    .option(
      "--json",
      "Output status in JSON format",
      false
    )
    .addHelpText(
      "after",
      `
Examples:
  hypertool-mcp service status                    # Check service status
  hypertool-mcp service status --json             # Output as JSON`
    )
    .action(async (options) => {
      await handleStatusCommand(options);
    });
}

/**
 * Handle the status command
 */
async function handleStatusCommand(options: any): Promise<void> {
  const spinner = ora("Checking service status...").start();

  try {
    const status = await ForeverServiceManager.status();
    spinner.stop();

    if (options.json) {
      // JSON output
      console.log(JSON.stringify({
        running: status.running,
        pid: status.pid,
        profile: status.profile,
        uptime: status.uptime,
        port: status.port,
        host: status.host,
        logFile: status.logFile
      }, null, 2));
      return;
    }

    // Human-readable output
    console.log("");
    if (status.running) {
      console.log(semantic.messageSuccess("✅ Service is running"));
      console.log("");
      console.log(theme.label("Service Information:"));
      console.log(theme.info(`  Status: RUNNING`));
      console.log(theme.info(`  PID: ${status.pid}`));
      console.log(theme.info(`  Profile: ${status.profile}`));
      console.log(theme.info(`  HTTP: http://${status.host || 'localhost'}:${status.port}`));
      console.log(theme.info(`  Health Endpoint: http://${status.host || 'localhost'}:${status.port}/health`));
      
      if (status.uptime) {
        const uptimeMinutes = Math.floor(status.uptime / 60000);
        const uptimeHours = Math.floor(uptimeMinutes / 60);
        const uptimeDays = Math.floor(uptimeHours / 24);
        
        let uptimeStr = '';
        if (uptimeDays > 0) {
          uptimeStr = `${uptimeDays}d ${uptimeHours % 24}h`;
        } else if (uptimeHours > 0) {
          uptimeStr = `${uptimeHours}h ${uptimeMinutes % 60}m`;
        } else {
          uptimeStr = `${uptimeMinutes}m`;
        }
        console.log(theme.info(`  Uptime: ${uptimeStr}`));
      }

      // Try to check health
      const healthSpinner = ora({ text: "Checking service health...", indent: 2 }).start();
      try {
        const healthUrl = `http://${status.host || 'localhost'}:${status.port}/health`;
        const response = await axios.get(healthUrl, { timeout: 5000 });
        
        if (response.status === 200) {
          healthSpinner.succeed();
          console.log(theme.success("🟢 Service is healthy and responding"));
        } else {
          healthSpinner.warn();
          console.log(theme.warning(`⚠️  Service returned status ${response.status}`));
        }
      } catch (error) {
        healthSpinner.fail();
        console.log(theme.warning("🔴 Service is not responding to health checks"));
      }

      console.log("");
      console.log(theme.label("Management Commands:"));
      console.log(theme.muted("  • Stop service: hypertool-mcp service stop"));
      console.log(theme.muted("  • Restart service: hypertool-mcp service restart"));
      console.log(theme.muted("  • View logs: hypertool-mcp service logs"));
      console.log(theme.muted(`  • Test endpoint: curl http://${status.host || 'localhost'}:${status.port}/health`));

    } else {
      console.log(semantic.messageError("❌ Service is not running"));
      console.log("");
      console.log(theme.label("Available Commands:"));
      console.log(theme.muted("  • Start service: hypertool-mcp service start"));
      console.log(theme.muted("  • Start with profile: hypertool-mcp service start --profile production"));
      console.log("");
      console.log(theme.label("Available Profiles:"));
      console.log(theme.muted("  • development - Local development with debug logging"));
      console.log(theme.muted("  • production  - Production deployment with optimized settings"));
    }

  } catch (error) {
    spinner.fail();
    console.error("");
    console.error(semantic.messageError("❌ Failed to check service status"));
    console.error(theme.warning(`   Error: ${(error as Error).message}`));
    process.exit(1);
  }
}