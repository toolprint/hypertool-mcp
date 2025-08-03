/**
 * MCP servers menu implementation for interactive navigation
 */

import inquirer from "inquirer";
import { theme } from "../../../utils/theme.js";
import { output } from "../../../utils/output.js";
import { ServerInfo } from "../show.js";
import {
  ViewType,
  MenuChoice,
  InteractiveOptions,
  ServerFilterOptions,
} from "./types.js";
import { execSync } from "child_process";

/**
 * Format server choice for inquirer list
 */
function formatServerChoice(server: ServerInfo): MenuChoice {
  const healthIcon = server.healthy ? "🟢" : "🔴";
  let name = `${healthIcon} ${theme.primary(server.name)}`;

  // Add transport type
  name += ` ${theme.muted(`(${server.type})`)}`;

  // Add warning if present
  if (server.warning) {
    name += ` ${theme.warning("⚠️")}`;
  }

  // Add development indicator
  if (server.isDevelopment) {
    name += ` ${theme.info("[DEV]")}`;
  }

  // Add first part of command/URL
  const details = server.details.split(" ")[0];
  name += `\n     ${theme.muted(details)}`;

  return {
    name,
    value: server,
    short: server.name,
  };
}

/**
 * Apply filters to server list
 */
function applyFilters(
  servers: ServerInfo[],
  filters: ServerFilterOptions
): ServerInfo[] {
  let filtered = [...servers];

  // Filter by transport type
  if (filters.transportType && filters.transportType !== "all") {
    filtered = filtered.filter((s) => s.type === filters.transportType);
  }

  // Filter by health status
  if (filters.healthStatus && filters.healthStatus !== "all") {
    if (filters.healthStatus === "healthy") {
      filtered = filtered.filter((s) => s.healthy);
    } else {
      filtered = filtered.filter((s) => !s.healthy);
    }
  }

  // Filter by source
  if (filters.source && filters.source !== "all") {
    filtered = filtered.filter((s) => s.source === filters.source);
  }

  return filtered;
}

/**
 * Show filter menu
 */
async function showFilterMenu(
  currentFilters: ServerFilterOptions
): Promise<ServerFilterOptions> {
  const { filters } = await inquirer.prompt([
    {
      type: "checkbox",
      name: "filters",
      message: "Select filters to apply:",
      choices: [
        {
          name: `Transport Type: ${currentFilters.transportType || "all"}`,
          value: "transport",
          checked: currentFilters.transportType !== undefined,
        },
        {
          name: `Health Status: ${currentFilters.healthStatus || "all"}`,
          value: "health",
          checked: currentFilters.healthStatus !== undefined,
        },
        {
          name: `Source: ${currentFilters.source || "all"}`,
          value: "source",
          checked: currentFilters.source !== undefined,
        },
      ],
    },
  ]);

  const newFilters: ServerFilterOptions = {};

  // Apply transport filter
  if (filters.includes("transport")) {
    const { transportType } = await inquirer.prompt([
      {
        type: "list",
        name: "transportType",
        message: "Filter by transport type:",
        choices: ["all", "stdio", "http", "sse", "websocket"],
        default: currentFilters.transportType || "all",
      },
    ]);
    if (transportType !== "all") {
      newFilters.transportType = transportType;
    }
  }

  // Apply health filter
  if (filters.includes("health")) {
    const { healthStatus } = await inquirer.prompt([
      {
        type: "list",
        name: "healthStatus",
        message: "Filter by health status:",
        choices: ["all", "healthy", "unhealthy"],
        default: currentFilters.healthStatus || "all",
      },
    ]);
    if (healthStatus !== "all") {
      newFilters.healthStatus = healthStatus;
    }
  }

  return newFilters;
}

/**
 * Display the servers list and handle selection
 */
export async function showServersList(
  servers: ServerInfo[],
  options: InteractiveOptions,
  currentFilters: ServerFilterOptions = {},
  currentPage: number = 0
): Promise<{
  action: string;
  nextView?: ViewType;
  data?: unknown;
  itemName?: string;
  filters?: ServerFilterOptions;
  page?: number;
}> {
  // Clear screen and show header
  console.clear();
  output.displayHeader(`📡 MCP Servers (${servers.length} total)`);
  output.displaySpaceBuffer(1);

  // Apply filters
  const filteredServers = applyFilters(servers, currentFilters);

  // Show active filters
  if (Object.keys(currentFilters).length > 0) {
    const filterText = Object.entries(currentFilters)
      .map(([key, value]) => `${key}: ${value}`)
      .join(", ");
    output.info(`Active filters: ${theme.warning(filterText)}`);
    output.displaySpaceBuffer(1);
  }

  // Use larger page size to show more items and reduce pagination confusion
  const pageSize = Math.max(options.pageSize || 25, 20);
  const totalPages = Math.ceil(filteredServers.length / pageSize);
  const startIndex = currentPage * pageSize;
  const endIndex = Math.min(startIndex + pageSize, filteredServers.length);
  const pageServers = filteredServers.slice(startIndex, endIndex);

  // Create choices
  const choices: MenuChoice[] = [];

  // Add server choices first (main content)
  for (const server of pageServers) {
    choices.push(formatServerChoice(server));
  }

  // Add pagination controls if needed
  if (totalPages > 1) {
    choices.push(
      new inquirer.Separator(
        `── Page ${currentPage + 1}/${totalPages} ──`
      ) as any
    );

    if (currentPage > 0) {
      choices.push({
        name: "◀ Previous Page",
        value: { action: "prev_page" },
      });
    }

    if (currentPage < totalPages - 1) {
      choices.push({
        name: "▶ Next Page",
        value: { action: "next_page" },
      });
    }

    choices.push(new inquirer.Separator() as any);
  }

  // Add action options at the bottom
  choices.push({
    name: "🔍 Filter Servers",
    value: { action: "filter" },
  });

  if (Object.keys(currentFilters).length > 0) {
    choices.push({
      name: "❌ Clear Filters",
      value: { action: "clear_filters" },
    });
  }

  choices.push(new inquirer.Separator() as any, {
    name: "[Back]",
    value: { action: "back" },
  });

  // Show menu with increased page size to show more items at once
  const { selection } = await inquirer.prompt([
    {
      type: "list",
      name: "selection",
      message: "Select a server for details:",
      choices,
      pageSize: Math.min(30, pageSize + 10), // Show more items to reduce scrolling
    },
  ]);

  // Handle selection and return appropriate action
  if (selection.action === "filter") {
    const newFilters = await showFilterMenu(currentFilters);
    return {
      action: "filter_applied",
      filters: newFilters,
      page: 0, // Reset to first page after filtering
    };
  } else if (selection.action === "clear_filters") {
    return {
      action: "filter_applied",
      filters: {},
      page: 0,
    };
  } else if (selection.action === "next_page") {
    return {
      action: "page_changed",
      filters: currentFilters,
      page: currentPage + 1,
    };
  } else if (selection.action === "prev_page") {
    return {
      action: "page_changed",
      filters: currentFilters,
      page: currentPage - 1,
    };
  } else if (selection.action === "back") {
    return { action: "back" };
  } else {
    // Server selected
    return {
      action: "navigate",
      nextView: ViewType.SERVER_DETAIL,
      data: selection,
      itemName: selection.name,
    };
  }
}

/**
 * Copy text to clipboard (cross-platform)
 */
function copyToClipboard(text: string): boolean {
  try {
    const platform = process.platform;

    if (platform === "darwin") {
      execSync("pbcopy", { input: text });
    } else if (platform === "win32") {
      execSync("clip", { input: text });
    } else {
      // Linux
      try {
        execSync("xclip -selection clipboard", { input: text });
      } catch {
        // Try xsel if xclip is not available
        execSync("xsel --clipboard --input", { input: text });
      }
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Display server detail view
 */
export async function showServerDetail(
  server: ServerInfo,
  allServers: ServerInfo[]
): Promise<{ action: string }> {
  // Clear screen and show header
  console.clear();
  output.displayHeader(`Server: ${server.name}`);
  output.displaySpaceBuffer(1);

  // Display server details
  const healthStatus = server.healthy
    ? theme.success("🟢 Healthy")
    : theme.error("🔴 Unhealthy");
  output.info(`Status: ${healthStatus}`);
  output.info(`Type: ${theme.value(server.type.toUpperCase())}`);

  if (server.type === "stdio") {
    output.info(`Command: ${theme.muted(server.details)}`);
  } else {
    output.info(`URL: ${theme.muted(server.details)}`);
  }

  if (server.source) {
    output.info(`Source: ${theme.muted(server.source)}`);
  }

  if (server.isDevelopment) {
    output.warn(`Development Build: ${theme.warning("Yes")}`);
    if (server.developmentPath) {
      output.info(`Path: ${theme.muted(server.developmentPath)}`);
    }
  }

  if (server.warning) {
    output.displaySpaceBuffer(1);
    output.warn(`⚠️  Warning: ${theme.warning(server.warning)}`);
  }

  output.displaySpaceBuffer(2);

  // Create action choices
  const choices: MenuChoice[] = [
    {
      name: "📋 Copy Command/URL",
      value: { action: "copy" },
    },
    {
      name: "📄 View Raw Configuration",
      value: { action: "view_raw" },
    },
    new inquirer.Separator() as any,
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

  // Handle actions
  if (selection.action === "copy") {
    const textToCopy = server.details;
    if (copyToClipboard(textToCopy)) {
      output.success("✅ Copied to clipboard!");
    } else {
      output.error("❌ Failed to copy to clipboard");
    }
    await new Promise((resolve) => setTimeout(resolve, 1500));
    return { action: "stay" }; // Signal to stay on current view
  } else if (selection.action === "view_raw") {
    // Show raw configuration
    console.clear();
    output.displayHeader("Raw Configuration");
    output.displaySpaceBuffer(1);

    // Create a mock config object (in real implementation, this would come from the actual config)
    const rawConfig = {
      type: server.type,
      command:
        server.type === "stdio" ? server.details.split(" ")[0] : undefined,
      args:
        server.type === "stdio"
          ? server.details.split(" ").slice(1)
          : undefined,
      url: server.type !== "stdio" ? server.details : undefined,
    };

    output.log(JSON.stringify(rawConfig, null, 2));
    output.displaySpaceBuffer(1);

    await inquirer.prompt([
      {
        type: "confirm",
        name: "continue",
        message: "Press Enter to go back",
        default: true,
      },
    ]);

    return { action: "stay" }; // Signal to stay on current view
  }

  return { action: selection.action };
}
