/**
 * Service command placeholder when background service is disabled.
 */

import { Command } from "commander";

export function createServiceCommand(): Command {
  return new Command("service")
    .description("Manage hypertool-mcp background service (not available)")
    .action(() => {
      console.log("Service commands are not available in this build.");
      process.exit(1);
    });
}

export default createServiceCommand;
