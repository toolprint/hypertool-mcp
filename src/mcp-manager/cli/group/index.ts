/**
 * CLI commands for server group management
 */

import { Command } from "commander";
import { createGroupCreateCommand } from "./create.js";
import { createGroupListCommand } from "./list.js";
import { createGroupAddCommand } from "./add.js";
import { createGroupRemoveCommand } from "./remove.js";
import { createGroupDeleteCommand } from "./delete.js";
import { createGroupShowCommand } from "./show.js";

export function createGroupCommands(): Command {
  const group = new Command("group");

  group
    .description("Manage server configuration groups")
    .addCommand(createGroupCreateCommand())
    .addCommand(createGroupListCommand())
    .addCommand(createGroupShowCommand())
    .addCommand(createGroupAddCommand())
    .addCommand(createGroupRemoveCommand())
    .addCommand(createGroupDeleteCommand());

  return group;
}

// Export individual commands for direct use
export {
  createGroupCreateCommand,
  createGroupListCommand,
  createGroupShowCommand,
  createGroupAddCommand,
  createGroupRemoveCommand,
  createGroupDeleteCommand,
};
