/**
 * CLI commands for MCP server management
 */

import { Command } from "commander";
import { createListCommand } from "./list.js";
import { createGetCommand } from "./get.js";
import { createAddCommand } from "./add.js";
import { createRemoveCommand } from "./remove.js";
import { createGroupCommands } from "./group/index.js";

export function createMCPManagementCommands(): Command {
  const mcp = new Command("mcp");

  mcp
    .description("Manage MCP server configurations")
    .addCommand(createListCommand())
    .addCommand(createGetCommand())
    .addCommand(createAddCommand())
    .addCommand(createRemoveCommand())
    .addCommand(createGroupCommands());

  return mcp;
}

// Export individual commands for direct use
export {
  createListCommand,
  createGetCommand,
  createAddCommand,
  createRemoveCommand,
};
