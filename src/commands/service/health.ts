/**
 * Service health command implementation using Forever
 */

import { Command } from "commander";
import { ForeverServiceManager } from "../../service/forever-manager.js";
import { theme, semantic } from "../../utils/theme.js";
import ora from "ora";
import axios from "axios";

/**
 * Create the service health command
 */
export function createHealthCommand(): Command {
  return new Command("health")
    .description("Check hypertool-mcp service health status")
    .option(
      "--json",
      "Output health information in JSON format",
      false
    )
    .option(
      "--timeout <seconds>",
      "Health check timeout in seconds",
      (value) => parseInt(value, 10),
      10
    )
    .addHelpText(
      "after",
      `
Examples:
  hypertool-mcp service health                    # Check health of running service
  hypertool-mcp service health --json             # Output as JSON
  hypertool-mcp service health --timeout 5        # Use 5s timeout`
    )
    .action(async (options) => {
      await handleHealthCommand(options);
    });
}

/**
 * Handle the health command
 */
async function handleHealthCommand(options: any): Promise<void> {
  let spinner = ora("Checking service health...").start();

  try {
    // Get service status first
    const status = await ForeverServiceManager.status();
    
    if (!status.running) {
      spinner.fail();
      console.error("");
      console.error(semantic.messageError("❌ No service is currently running"));
      console.error("");
      console.error(theme.info("💡 Start a service first:"));
      console.error(theme.muted("   hypertool-mcp service start"));
      process.exit(1);
    }

    // Update spinner with specific info
    spinner.text = `Checking health for ${status.profile} service...`;

    // Perform health check
    const healthUrl = `http://${status.host || 'localhost'}:${status.port}/health`;
    const startTime = Date.now();
    
    try {
      const response = await axios.get(healthUrl, { 
        timeout: options.timeout * 1000,
        validateStatus: () => true // Accept any status
      });
      
      const responseTime = Date.now() - startTime;
      const healthy = response.status === 200;
      
      spinner.stop();

      const healthResult = {
        healthy,
        status: response.status,
        responseTime,
        endpoint: healthUrl,
        profile: status.profile,
        timestamp: new Date(),
        data: response.data
      };

      if (options.json) {
        displayJsonHealth(healthResult, status);
      } else {
        displayHumanHealth(healthResult, status);
      }

      // Set exit code based on health
      process.exit(healthy ? 0 : 1);

    } catch (error) {
      const responseTime = Date.now() - startTime;
      spinner.stop();

      const healthResult = {
        healthy: false,
        status: 0,
        responseTime,
        endpoint: healthUrl,
        profile: status.profile,
        timestamp: new Date(),
        error: (error as Error).message
      };

      if (options.json) {
        displayJsonHealth(healthResult, status);
      } else {
        displayHumanHealth(healthResult, status);
      }

      process.exit(1);
    }

  } catch (error) {
    spinner.fail();
    console.error("");
    console.error(semantic.messageError("❌ Health check failed"));
    console.error(theme.warning(`   Error: ${(error as Error).message}`));
    process.exit(1);
  }
}

/**
 * Display health status in human-readable format
 */
function displayHumanHealth(healthResult: any, status: any): void {
  console.log("");

  if (healthResult.healthy) {
    console.log(semantic.messageSuccess("✅ Service is healthy"));
    console.log("");
    console.log(theme.label("Health Check Results:"));
    console.log(theme.success(`  Status: HEALTHY`));
    console.log(theme.info(`  Response Time: ${healthResult.responseTime}ms`));
    console.log(theme.info(`  HTTP Status: ${healthResult.status}`));
    console.log(theme.info(`  Endpoint: ${healthResult.endpoint}`));
    console.log(theme.info(`  Profile: ${healthResult.profile}`));
    console.log(theme.info(`  Checked At: ${healthResult.timestamp.toLocaleString()}`));

  } else {
    console.log(semantic.messageError("❌ Service is unhealthy"));
    console.log("");
    console.log(theme.label("Health Check Results:"));
    console.log(semantic.messageError(`  Status: UNHEALTHY`));
    console.log(theme.info(`  Response Time: ${healthResult.responseTime}ms`));
    console.log(theme.warning(`  HTTP Status: ${healthResult.status || 'N/A'}`));
    console.log(theme.info(`  Endpoint: ${healthResult.endpoint}`));
    console.log(theme.info(`  Profile: ${healthResult.profile}`));
    console.log(theme.info(`  Checked At: ${healthResult.timestamp.toLocaleString()}`));
    
    if (healthResult.error) {
      console.log(theme.warning(`  Error: ${healthResult.error}`));
    }

    console.log("");
    console.log(theme.label("Troubleshooting:"));
    
    if (healthResult.status === 0) {
      console.log(theme.muted("  • Service may not be running or not accessible"));
      console.log(theme.muted("  • Check service status: hypertool-mcp service status"));
    } else if (healthResult.status >= 500) {
      console.log(theme.muted("  • Service is running but has internal errors"));
      console.log(theme.muted("  • Check service logs: hypertool-mcp service logs"));
    } else if (healthResult.status === 404) {
      console.log(theme.muted("  • Health endpoint may not be configured correctly"));
      console.log(theme.muted("  • Expected endpoint: /health"));
    } else {
      console.log(theme.muted(`  • Unexpected HTTP status: ${healthResult.status}`));
      console.log(theme.muted("  • Check service logs for more details"));
    }
  }

  console.log("");
  console.log(theme.label("Service Information:"));
  console.log(theme.info(`  PID: ${status.pid}`));
  console.log(theme.info(`  Port: ${status.port}`));
  
  if (status.uptime) {
    const uptimeMinutes = Math.floor(status.uptime / 60000);
    console.log(theme.info(`  Uptime: ${uptimeMinutes} minutes`));
  }

  console.log("");
  console.log(theme.label("Related Commands:"));
  console.log(theme.muted("  • Service status: hypertool-mcp service status"));
  console.log(theme.muted("  • View logs: hypertool-mcp service logs"));
  console.log(theme.muted("  • Restart service: hypertool-mcp service restart"));
  console.log(theme.muted(`  • Manual test: curl ${healthResult.endpoint}`));
}

/**
 * Display health status in JSON format
 */
function displayJsonHealth(healthResult: any, status: any): void {
  const output = {
    healthy: healthResult.healthy,
    status: healthResult.healthy ? "HEALTHY" : "UNHEALTHY",
    responseTime: healthResult.responseTime,
    httpStatus: healthResult.status,
    endpoint: healthResult.endpoint,
    profile: healthResult.profile,
    timestamp: healthResult.timestamp.toISOString(),
    error: healthResult.error || null,
    service: {
      pid: status.pid,
      port: status.port,
      host: status.host,
      uptime: status.uptime
    }
  };

  console.log(JSON.stringify(output, null, 2));
}