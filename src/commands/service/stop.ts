/**
 * Service stop command implementation using Forever
 */

import { Command } from "commander";
import { ForeverServiceManager } from "../../service/forever-manager.js";
import { theme, semantic } from "../../utils/theme.js";
import ora from "ora";

/**
 * Create the service stop command
 */
export function createStopCommand(): Command {
  return new Command("stop")
    .description("Stop the hypertool-mcp background service")
    .addHelpText(
      "after",
      `
Examples:
  hypertool-mcp service stop                    # Stop the running service`
    )
    .action(async () => {
      await handleStopCommand();
    });
}

/**
 * Handle the stop command
 */
async function handleStopCommand(): Promise<void> {
  const spinner = ora("Stopping hypertool-mcp service...").start();

  try {
    // Check current status
    const status = await ForeverServiceManager.status();
    
    if (!status.running) {
      spinner.succeed();
      console.log("");
      console.log(semantic.messageSuccess("✅ No service is currently running"));
      return;
    }

    // Update spinner with more info
    spinner.text = `Stopping service (${status.profile}, PID: ${status.pid})...`;

    // Stop the service
    await ForeverServiceManager.stop();
    
    spinner.succeed();
    console.log("");
    console.log(semantic.messageSuccess("✅ Service stopped successfully"));
    console.log("");
    console.log(theme.label("Service Information:"));
    console.log(theme.info(`  Profile: ${status.profile}`));
    console.log(theme.info(`  PID: ${status.pid} (terminated)`));
    console.log(theme.info("  Method: Forever managed shutdown"));

  } catch (error) {
    spinner.fail();
    console.error("");
    console.error(semantic.messageError("❌ Failed to stop service"));
    console.error(theme.warning(`   Error: ${(error as Error).message}`));
    
    console.error("");
    console.error(theme.info("💡 Troubleshooting:"));
    console.error(theme.muted("   • Check if service is running: hypertool-mcp service status"));
    console.error(theme.muted("   • View logs for errors: hypertool-mcp service logs"));
    
    process.exit(1);
  }
}