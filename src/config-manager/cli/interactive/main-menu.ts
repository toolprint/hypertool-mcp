/**
 * Main menu implementation for interactive configuration navigation
 */

import inquirer from "inquirer";
import { theme } from "../../../utils/theme.js";
import { output } from "../../../utils/output.js";
import {
  ConfigurationData,
  ViewType,
  MenuChoice,
  SummaryStats,
} from "./types.js";
import { isNedbEnabledAsync } from "../../../config/environment.js";

/**
 * Calculate summary statistics from configuration data
 */
export async function calculateSummaryStats(
  data: ConfigurationData
): Promise<SummaryStats> {
  // Server statistics
  const serverStats = {
    total: data.servers.length,
    healthy: data.servers.filter((s) => s.healthy).length,
    byType: data.servers.reduce(
      (acc, server) => {
        acc[server.type] = (acc[server.type] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    ),
  };

  // Application statistics
  const appStats = {
    total: data.applications.length,
    installed: data.applications.filter((app) => app.installed).length,
    linked: data.applications.filter((app) => app.hasConfig).length,
  };

  // Toolset statistics
  const toolsetStats = {
    total: data.toolsets.length,
    inUse: data.toolsets.filter((ts) => ts.apps && ts.apps.length > 0).length,
  };

  // Group statistics (if database is enabled)
  let groupStats;
  const nedbEnabled = await isNedbEnabledAsync();
  if (data.groups && nedbEnabled) {
    groupStats = {
      total: data.groups.length,
      active: data.groups.filter((g) => g.serverIds && g.serverIds.length > 0)
        .length,
    };
  }

  return {
    servers: serverStats,
    applications: appStats,
    groups: groupStats,
    toolsets: toolsetStats,
  };
}

/**
 * Format the header for the main menu
 */
function formatHeader(): string {
  const title = "HyperTool Configuration Overview";
  const separator = "=".repeat(47);

  return `
${theme.primary(separator)}
       ${theme.primary(title)}
${theme.primary(separator)}`;
}

/**
 * Format server statistics section
 */
function formatServerStats(stats: SummaryStats): string {
  const { servers } = stats;

  // First row: Total and Healthy
  const firstRow = `   Total: ${theme.value(servers.total.toString())} servers | Healthy: ${theme.success(servers.healthy.toString())}`;

  // Second row: Transport types
  const transportTypes = ["stdio", "http", "sse", "websocket"];
  const transportCounts = transportTypes
    .map((type) => {
      const count = servers.byType[type] || 0;
      const typeLabel = type.toUpperCase();
      return `${typeLabel}: ${count}`;
    })
    .join(" | ");

  const secondRow = `   ${theme.muted(transportCounts)}`;

  return `${theme.warning("📡 MCP Servers")}\n${firstRow}\n${secondRow}`;
}

/**
 * Format application statistics section
 */
function formatApplicationStats(stats: SummaryStats): string {
  const { applications } = stats;

  return `${theme.warning("🖥️  Applications")}
   Detected: ${theme.value(`${applications.installed}/${applications.total}`)} | Linked: ${theme.value(`${applications.linked}/${applications.installed}`)}`;
}

/**
 * Format server groups statistics section
 */
async function formatGroupStats(stats: SummaryStats): Promise<string> {
  const nedbEnabled = await isNedbEnabledAsync();
  if (!stats.groups || !nedbEnabled) {
    return "";
  }

  const { groups } = stats;
  return `
${theme.warning("👥 Server Groups")} ${theme.muted("(Database Feature)")}
   Total: ${theme.value(groups.total.toString())} | Active: ${theme.value(groups.active.toString())}`;
}

/**
 * Format toolsets statistics section
 */
function formatToolsetStats(stats: SummaryStats): string {
  const { toolsets } = stats;

  return `${theme.warning("🧰 Toolsets")}
   Total: ${theme.value(toolsets.total.toString())} | In Use: ${theme.value(toolsets.inUse.toString())}`;
}

/**
 * Display the main menu and handle selection
 */
export async function showMainMenu(
  data: ConfigurationData
): Promise<{ action: string; nextView?: ViewType }> {
  const stats = await calculateSummaryStats(data);

  // Clear screen and display header
  console.clear();
  output.log(formatHeader());
  output.displaySpaceBuffer(1);

  // Display statistics sections
  output.log(formatServerStats(stats));
  output.displaySpaceBuffer(1);

  output.log(formatApplicationStats(stats));
  output.displaySpaceBuffer(1);

  // Only show groups if database is enabled
  const nedbEnabled = await isNedbEnabledAsync();
  if (nedbEnabled && stats.groups) {
    output.log(await formatGroupStats(stats));
    output.displaySpaceBuffer(1);
  }

  output.log(formatToolsetStats(stats));
  output.displaySpaceBuffer(2);

  // Create menu choices
  const choices: MenuChoice[] = [
    {
      name: "View MCP Servers",
      value: { action: "navigate", view: ViewType.SERVERS_LIST },
    },
    {
      name: "View Applications",
      value: { action: "navigate", view: ViewType.APPLICATIONS_LIST },
    },
  ];

  // Add server groups option if database is enabled
  if (nedbEnabled && stats.groups) {
    choices.push({
      name: "View Server Groups",
      value: { action: "navigate", view: ViewType.GROUPS_LIST },
    });
  }

  choices.push(
    {
      name: "View Toolsets",
      value: { action: "navigate", view: ViewType.TOOLSETS_LIST },
    },
    new inquirer.Separator() as any,
    {
      name: "Refresh Data",
      value: { action: "refresh" },
    },
    {
      name: "[Exit]",
      value: { action: "exit" },
    }
  );

  // Show the menu
  const { selection } = await inquirer.prompt([
    {
      type: "list",
      name: "selection",
      message:
        "What would you like to explore? (Use [Back] to navigate up, Ctrl+C to exit)",
      choices,
      pageSize: 15, // Increased page size for main menu
    },
  ]);

  return {
    action: selection.action,
    nextView: selection.view,
  };
}
