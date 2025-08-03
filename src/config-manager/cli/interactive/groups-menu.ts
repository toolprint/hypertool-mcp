/**
 * Server groups menu implementation for interactive navigation
 */

import inquirer from "inquirer";
import { theme } from "../../../utils/theme.js";
import { output } from "../../../utils/output.js";
import { ServerConfigGroup } from "../../../db/interfaces.js";
import { ServerInfo } from "../show.js";
import { ViewType, MenuChoice, InteractiveOptions } from "./types.js";

/**
 * Format group choice for inquirer list
 */
function formatGroupChoice(group: ServerConfigGroup): MenuChoice {
  let name = `👥 ${theme.primary(group.name)}`;

  // Add server count
  const serverCount = group.serverIds?.length || 0;
  name += ` ${theme.muted(`(${serverCount} server${serverCount !== 1 ? "s" : ""})`)}`;

  // Add description preview if available
  if (group.description) {
    const shortDesc =
      group.description.length > 40
        ? group.description.substring(0, 40) + "..."
        : group.description;
    name += `\n     ${theme.muted(shortDesc)}`;
  }

  return {
    name,
    value: group,
    short: group.name,
  };
}

/**
 * Display the groups list and handle selection
 */
export async function showGroupsList(
  groups: ServerConfigGroup[],
  options: InteractiveOptions
): Promise<{
  action: string;
  nextView?: ViewType;
  data?: unknown;
  itemName?: string;
}> {
  // Clear screen and show header
  console.clear();
  output.displayHeader(`👥 Server Groups (${groups.length} total)`);
  output.displaySpaceBuffer(1);

  // Show summary
  const activeGroups = groups.filter(
    (g) => g.serverIds && g.serverIds.length > 0
  ).length;
  output.info(
    `Total: ${theme.value(groups.length.toString())} | Active: ${theme.value(activeGroups.toString())}`
  );
  output.displaySpaceBuffer(1);

  if (groups.length === 0) {
    output.warn("No server groups configured.");
    output.info(
      "Server groups help organize MCP servers for different projects or environments."
    );
    output.displaySpaceBuffer(2);

    const { action } = await inquirer.prompt([
      {
        type: "list",
        name: "action",
        message: "What would you like to do?",
        choices: [
          {
            name: "[Back]",
            value: "back",
          },
        ],
      },
    ]);

    return { action };
  }

  // Create choices
  const choices: MenuChoice[] = [];

  // Sort groups by name
  const sortedGroups = [...groups].sort((a, b) => a.name.localeCompare(b.name));

  for (const group of sortedGroups) {
    choices.push(formatGroupChoice(group));
  }

  choices.push(new inquirer.Separator() as any, {
    name: "[Back]",
    value: { action: "back" },
  });

  // Show menu
  const { selection } = await inquirer.prompt([
    {
      type: "list",
      name: "selection",
      message: "Select a group for details:",
      choices,
      pageSize: Math.min(30, groups.length + 8), // Increased page size
    },
  ]);

  // Handle selection
  if (selection.action === "back") {
    return { action: "back" };
  } else {
    // Group selected
    return {
      action: "navigate",
      nextView: ViewType.GROUP_DETAIL,
      data: selection,
      itemName: selection.name,
    };
  }
}

/**
 * Display group detail view
 */
export async function showGroupDetail(
  group: ServerConfigGroup,
  allGroups: ServerConfigGroup[],
  servers: ServerInfo[]
): Promise<{ action: string }> {
  // Clear screen and show header
  console.clear();
  output.displayHeader(`Group: ${group.name}`);
  output.displaySpaceBuffer(1);

  // Display group details
  output.info(`ID: ${theme.muted(group.id)}`);

  if (group.description) {
    output.info(`Description: ${theme.muted(group.description)}`);
  }

  const serverCount = group.serverIds?.length || 0;
  output.info(`Servers: ${theme.value(serverCount.toString())}`);

  output.displaySpaceBuffer(1);

  // Show servers in this group
  if (serverCount > 0) {
    output.displaySubHeader("Servers in this group:");
    output.displaySpaceBuffer(1);

    // Note: In a real implementation, we would look up the actual server details
    // For now, we'll just show the server IDs
    for (const serverId of group.serverIds) {
      // Try to find the server in our servers list
      const server = servers.find((s) => s.name === serverId);
      if (server) {
        const healthIcon = server.healthy ? "🟢" : "🔴";
        output.info(
          `  ${healthIcon} ${theme.primary(server.name)} ${theme.muted(`(${server.type})`)}`
        );
      } else {
        output.info(`  • ${theme.muted(serverId)}`);
      }
    }
  } else {
    output.warn("This group has no servers assigned.");
  }

  output.displaySpaceBuffer(2);

  // Create action choices
  const choices: MenuChoice[] = [
    {
      name: "[Back]",
      value: { action: "back" },
    },
  ];

  // Show actions menu
  const { selection } = await inquirer.prompt([
    {
      type: "list",
      name: "selection",
      message: "Actions:",
      choices,
      pageSize: 10,
    },
  ]);

  return { action: selection.action };
}
