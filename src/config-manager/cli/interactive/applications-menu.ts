/**
 * Applications menu implementation for interactive navigation
 */

import inquirer from "inquirer";
import { theme } from "../../../utils/theme.js";
import { output } from "../../../utils/output.js";
import { ApplicationStatus } from "../show.js";
import { ViewType, MenuChoice, InteractiveOptions } from "./types.js";

/**
 * Format application choice for inquirer list
 */
function formatApplicationChoice(app: ApplicationStatus): MenuChoice {
  let statusIcon: string;
  let statusText: string;

  if (!app.installed) {
    statusIcon = "❌";
    statusText = "Not installed";
  } else if (app.hasConfig) {
    statusIcon = "✅";
    statusText = "Linked";
  } else {
    statusIcon = "⚠️";
    statusText = "Not linked";
  }

  let name = `${statusIcon} ${theme.primary(app.name)}`;

  // Add status text
  name += ` ${theme.muted(`(${statusText})`)}`;

  // Add development indicator
  if (app.isDevelopmentBuild) {
    name += ` ${theme.info("[DEV]")}`;
  }

  // Add config path preview if available
  if (app.configPath) {
    const pathParts = app.configPath.split("/");
    const shortPath =
      pathParts.length > 3
        ? `.../${pathParts.slice(-2).join("/")}`
        : app.configPath;
    name += `\n     ${theme.muted(shortPath)}`;
  }

  return {
    name,
    value: app,
    short: app.name,
  };
}

/**
 * Display the applications list and handle selection
 */
export async function showApplicationsList(
  applications: ApplicationStatus[],
  options: InteractiveOptions
): Promise<{
  action: string;
  nextView?: ViewType;
  data?: unknown;
  itemName?: string;
}> {
  // Clear screen and show header
  console.clear();
  output.displayHeader(`🖥️  Applications (${applications.length} total)`);
  output.displaySpaceBuffer(1);

  // Show summary
  const installed = applications.filter((app) => app.installed).length;
  const linked = applications.filter((app) => app.hasConfig).length;
  output.info(
    `Detected: ${theme.value(`${installed}/${applications.length}`)} | Linked: ${theme.value(`${linked}/${installed}`)}`
  );
  output.displaySpaceBuffer(1);

  // Create choices
  const choices: MenuChoice[] = [];

  // Group applications by status
  const installedApps = applications.filter((app) => app.installed);
  const notInstalledApps = applications.filter((app) => !app.installed);

  if (installedApps.length > 0) {
    choices.push(new inquirer.Separator("── Installed Applications ──") as any);
    for (const app of installedApps) {
      choices.push(formatApplicationChoice(app));
    }
  }

  if (notInstalledApps.length > 0) {
    choices.push(new inquirer.Separator("── Not Installed ──") as any);
    for (const app of notInstalledApps) {
      choices.push(formatApplicationChoice(app));
    }
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
      message: "Select an application for details:",
      choices,
      pageSize: Math.min(30, applications.length + 8), // Increased page size
    },
  ]);

  // Handle selection
  if (selection.action === "back") {
    return { action: "back" };
  } else {
    // Application selected
    return {
      action: "navigate",
      nextView: ViewType.APPLICATION_DETAIL,
      data: selection,
      itemName: selection.name,
    };
  }
}

/**
 * Display application detail view
 */
export async function showApplicationDetail(
  app: ApplicationStatus,
  allApplications: ApplicationStatus[]
): Promise<{ action: string }> {
  // Clear screen and show header
  console.clear();
  output.displayHeader(`Application: ${app.name}`);
  output.displaySpaceBuffer(1);

  // Display application details
  const installedStatus = app.installed
    ? theme.success("✅ Installed")
    : theme.error("❌ Not Installed");
  output.info(`Status: ${installedStatus}`);

  if (app.installed) {
    const linkedStatus = app.hasConfig
      ? theme.success("✅ Linked to HyperTool")
      : theme.warning("⚠️  Not linked to HyperTool");
    output.info(`HyperTool Integration: ${linkedStatus}`);

    if (app.configPath) {
      output.info(`Config Path: ${theme.muted(app.configPath)}`);
    }

    if (app.hasConfig && app.mcpConfigPath) {
      output.info(`MCP Config: ${theme.value(app.mcpConfigPath)}`);
    }

    if (app.isDevelopmentBuild) {
      output.displaySpaceBuffer(1);
      output.warn(`Development Build: ${theme.warning("Yes")}`);
      if (app.developmentPath) {
        output.info(`Dev Path: ${theme.muted(app.developmentPath)}`);
      }
    }
  }

  output.displaySpaceBuffer(2);

  // Create action choices
  const choices: MenuChoice[] = [];

  if (app.installed && app.configPath) {
    choices.push({
      name: "📄 View Configuration",
      value: { action: "view_config" },
    });
  }

  if (
    app.installed &&
    !app.hasConfig &&
    app.name !== "Claude Code" &&
    app.name !== "Claude Code (User)"
  ) {
    choices.push({
      name: "🔗 Link to HyperTool",
      value: { action: "link" },
    });
  }

  choices.push(new inquirer.Separator() as any, {
    name: "[Back]",
    value: { action: "back" },
  });

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
  if (selection.action === "view_config") {
    // Show configuration preview
    console.clear();
    output.displayHeader("Configuration Preview");
    output.displaySpaceBuffer(1);

    if (app.hasConfig) {
      output.info("HyperTool is configured for this application.");
      if (app.mcpConfigPath) {
        output.info(
          `MCP servers are loaded from: ${theme.primary(app.mcpConfigPath)}`
        );
      }
    } else {
      output.info("HyperTool is not yet configured for this application.");
      output.info('Run "hypertool-mcp config link" to set it up.');
    }

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
  } else if (selection.action === "link") {
    output.displaySpaceBuffer(1);
    output.info("To link this application to HyperTool, run:");
    output.displayTerminalInstruction("hypertool-mcp config link");

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
