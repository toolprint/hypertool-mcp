/**
 * CLI commands for configuration management
 */

import { Command } from "commander";
import { createBackupCommand, createRestoreCommand } from "./backup.js";
import { createLinkCommand } from "./link.js";
import { createUnlinkCommand } from "./unlink.js";
import { createShowCommand } from "./show.js";
import { createExportCommand } from "./export.js";

export function createConfigCommands(): Command {
  const config = new Command("config");

  config
    .description("Configuration management commands")
    .addCommand(createShowCommand())
    .addCommand(createBackupCommand())
    .addCommand(createRestoreCommand())
    .addCommand(createLinkCommand())
    .addCommand(createUnlinkCommand())
    .addCommand(createExportCommand());

  return config;
}

// Export individual commands for direct use
export {
  createShowCommand,
  createBackupCommand,
  createRestoreCommand,
  createLinkCommand,
  createUnlinkCommand,
  createExportCommand,
};
