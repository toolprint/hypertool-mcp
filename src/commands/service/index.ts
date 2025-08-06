/**
 * Service management commands using Forever
 */

import { Command } from "commander";
import { createStartCommand } from "./start.js";
import { createStopCommand } from "./stop.js";
import { createRestartCommand } from "./restart.js";
import { createStatusCommand } from "./status.js";
import { createLogsCommand } from "./logs.js";
import { createHealthCommand } from "./health.js";

/**
 * Create the service command with all subcommands
 */
export function createServiceCommand(): Command {
  const serviceCommand = new Command("service").description(
    "Manage hypertool-mcp background service"
  );

  // Add subcommands
  serviceCommand.addCommand(createStartCommand());
  serviceCommand.addCommand(createStopCommand());
  serviceCommand.addCommand(createRestartCommand());
  serviceCommand.addCommand(createStatusCommand());
  serviceCommand.addCommand(createLogsCommand());
  serviceCommand.addCommand(createHealthCommand());

  return serviceCommand;
}
