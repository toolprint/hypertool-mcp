/**
 * Interactive navigation system for configuration display
 */

import { join } from "path";
import { homedir } from "os";
import { promises as fs } from "fs";
import { ConfigurationManager } from "../index.js";
import { output } from "../../utils/output.js";
import { theme } from "../../utils/theme.js";
import {
  ConfigurationData,
  ViewType,
  NavigationState,
  InteractiveOptions,
  ExportFormat,
} from "./interactive/types.js";
import { showMainMenu } from "./interactive/main-menu.js";
import {
  showServersList,
  showServerDetail,
} from "./interactive/servers-menu.js";
import {
  showApplicationsList,
  showApplicationDetail,
} from "./interactive/applications-menu.js";
import { showGroupsList, showGroupDetail } from "./interactive/groups-menu.js";
import {
  showToolsetsList,
  showToolsetDetail,
  showToolDetail,
} from "./interactive/toolsets-menu.js";
import { getMcpServers, getApplicationStatus, getToolsets, ServerInfo, ApplicationStatus, ToolsetInfo } from "./show.js";
import { isNedbEnabledAsync } from "../../config/environment.js";
import { getCompositeDatabaseService } from "../../db/compositeDatabaseService.js";
import { ServerConfigGroup } from "../../db/interfaces.js";
import { ServerFilterOptions } from "./interactive/types.js";
import * as yaml from "yaml";

/**
 * Interactive navigator for configuration display
 */
export class InteractiveNavigator {
  private navigationStack: NavigationState[] = [];
  private configData!: ConfigurationData;
  private options: InteractiveOptions;
  private configManager: ConfigurationManager;
  private serverFilters: ServerFilterOptions = {};
  private serverPage: number = 0;

  constructor(options: InteractiveOptions = {}) {
    this.options = {
      pageSize: 25, // Increased default page size
      enableSearch: true,
      ...options,
    };
    this.configManager = new ConfigurationManager();
  }

  /**
   * Initialize and start the interactive session
   */
  async start(linkedApp?: string): Promise<void> {
    try {
      // Initialize configuration manager
      await this.configManager.initialize();

      // Load initial data
      await this.loadConfigurationData(linkedApp);

      // Start with main menu
      this.navigationStack.push({
        viewType: ViewType.MAIN_MENU,
        breadcrumb: ["Main Menu"],
      });

      // Main navigation loop
      await this.navigationLoop();
    } catch (error) {
      // Check if this is a user interruption (Ctrl+C)
      if (error instanceof Error && error.message.includes("interrupted")) {
        console.log("\n👋 Goodbye!");
        process.exit(0);
      }
      
      output.error("❌ Failed to start interactive mode:");
      output.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  }

  /**
   * Load configuration data from various sources
   */
  private async loadConfigurationData(linkedApp?: string): Promise<void> {
    const basePath = join(homedir(), ".toolprint/hypertool-mcp");

    // Get MCP servers
    const { servers, configPath } = await getMcpServers(basePath, linkedApp);

    // Get applications
    const applications = linkedApp
      ? []
      : await getApplicationStatus(this.configManager);

    // Get toolsets
    const toolsets = await getToolsets(basePath);

    // Get server groups if database is enabled
    let groups = undefined;
    const nedbEnabled = await isNedbEnabledAsync();
    if (nedbEnabled) {
      try {
        const dbService = getCompositeDatabaseService();
        await dbService.init();
        groups = await dbService.groups.findAll();
      } catch (error) {
        // Database not available, continue without groups
      }
    }

    this.configData = {
      servers,
      applications,
      toolsets,
      groups,
      configPath,
      linkedApp,
    };
  }

  /**
   * Main navigation loop
   */
  private async navigationLoop(): Promise<void> {
    while (this.navigationStack.length > 0) {
      const currentState =
        this.navigationStack[this.navigationStack.length - 1];

      try {
        const result = await this.showCurrentView(currentState);

        if (result.action === "exit") {
          break;
        } else if (result.action === "back") {
          this.navigationStack.pop();
        } else if (result.action === "refresh") {
          await this.loadConfigurationData(this.configData.linkedApp);
          // Stay on current view
        } else if (result.action === "filter_applied") {
          // Handle server filter changes
          this.serverFilters = result.filters || {};
          this.serverPage = result.page || 0;
          // Stay on current view
        } else if (result.action === "page_changed") {
          // Handle server page changes
          this.serverFilters = result.filters || {};
          this.serverPage = result.page || 0;
          // Stay on current view
        } else if (result.action === "navigate" && result.nextView) {
          // Push new view onto stack
          const nextState: NavigationState = {
            viewType: result.nextView,
            breadcrumb: [...currentState.breadcrumb],
            data: result.data,
          };

          // Update breadcrumb based on view type
          this.updateBreadcrumb(nextState, result.itemName);
          this.navigationStack.push(nextState);
        } else if (result.action === "export") {
          await this.exportCurrentView(
            currentState,
            result.format as ExportFormat
          );
        } else if (result.action === "stay") {
          // Stay on current view - used when detail views complete an action
          // Do nothing, loop will continue
        }
      } catch (error) {
        output.error(
          `Navigation error: ${error instanceof Error ? error.message : String(error)}`
        );
        // Stay on current view
      }
    }
  }

  /**
   * Show the appropriate view based on current state
   */
  private async showCurrentView(state: NavigationState): Promise<any> {
    switch (state.viewType) {
      case ViewType.MAIN_MENU:
        return showMainMenu(this.configData);

      case ViewType.SERVERS_LIST:
        return showServersList(this.configData.servers, this.options, this.serverFilters, this.serverPage);

      case ViewType.SERVER_DETAIL:
        return showServerDetail(state.data as ServerInfo, this.configData.servers);

      case ViewType.APPLICATIONS_LIST:
        return showApplicationsList(this.configData.applications, this.options);

      case ViewType.APPLICATION_DETAIL:
        return showApplicationDetail(state.data as ApplicationStatus, this.configData.applications);

      case ViewType.GROUPS_LIST:
        return showGroupsList(this.configData.groups || [], this.options);

      case ViewType.GROUP_DETAIL:
        return showGroupDetail(
          state.data as ServerConfigGroup,
          this.configData.groups || [],
          this.configData.servers
        );

      case ViewType.TOOLSETS_LIST:
        return showToolsetsList(this.configData.toolsets, this.options);

      case ViewType.TOOLSET_DETAIL:
        return showToolsetDetail(state.data as ToolsetInfo, this.configData.toolsets);

      case ViewType.TOOL_DETAIL:
        return showToolDetail(state.data as ToolsetInfo, this.configData.toolsets);

      default:
        throw new Error(`Unknown view type: ${state.viewType}`);
    }
  }

  /**
   * Update breadcrumb trail based on navigation
   */
  private updateBreadcrumb(state: NavigationState, itemName?: string): void {
    switch (state.viewType) {
      case ViewType.SERVERS_LIST:
        state.breadcrumb = ["Main Menu", "MCP Servers"];
        break;
      case ViewType.SERVER_DETAIL:
        state.breadcrumb = [
          "Main Menu",
          "MCP Servers",
          itemName || "Server Detail",
        ];
        break;
      case ViewType.APPLICATIONS_LIST:
        state.breadcrumb = ["Main Menu", "Applications"];
        break;
      case ViewType.APPLICATION_DETAIL:
        state.breadcrumb = [
          "Main Menu",
          "Applications",
          itemName || "App Detail",
        ];
        break;
      case ViewType.GROUPS_LIST:
        state.breadcrumb = ["Main Menu", "Server Groups"];
        break;
      case ViewType.GROUP_DETAIL:
        state.breadcrumb = [
          "Main Menu",
          "Server Groups",
          itemName || "Group Detail",
        ];
        break;
      case ViewType.TOOLSETS_LIST:
        state.breadcrumb = ["Main Menu", "Toolsets"];
        break;
      case ViewType.TOOLSET_DETAIL:
        state.breadcrumb = [
          "Main Menu",
          "Toolsets",
          itemName || "Toolset Detail",
        ];
        break;
      case ViewType.TOOL_DETAIL:
        state.breadcrumb = [
          "Main Menu",
          "Toolsets",
          "Toolset Detail",
          itemName || "Tool Details",
        ];
        break;
    }
  }

  /**
   * Export current view data
   */
  private async exportCurrentView(
    state: NavigationState,
    format: ExportFormat
  ): Promise<void> {
    try {
      let exportData: any;
      const timestamp = new Date()
        .toISOString()
        .replace(/[:.]/g, "-")
        .slice(0, -5);
      let filename: string;

      // Determine what data to export based on current view
      switch (state.viewType) {
        case ViewType.MAIN_MENU:
          exportData = this.configData;
          filename = `hypertool-config-${timestamp}`;
          break;
        case ViewType.SERVERS_LIST:
          exportData = { servers: this.configData.servers };
          filename = `mcp-servers-${timestamp}`;
          break;
        case ViewType.SERVER_DETAIL:
          exportData = { server: state.data };
          filename = `server-${(state.data as ServerInfo).name}-${timestamp}`;
          break;
        case ViewType.APPLICATIONS_LIST:
          exportData = { applications: this.configData.applications };
          filename = `applications-${timestamp}`;
          break;
        case ViewType.TOOLSETS_LIST:
          exportData = { toolsets: this.configData.toolsets };
          filename = `toolsets-${timestamp}`;
          break;
        default:
          output.warn("Export not available for this view");
          return;
      }

      // Format the data
      let content: string;
      if (format === ExportFormat.JSON) {
        content = JSON.stringify(exportData, null, 2);
        filename += ".json";
      } else {
        content = yaml.stringify(exportData);
        filename += ".yaml";
      }

      // Write to file
      await fs.writeFile(filename, content, "utf-8");
      output.success(`✅ Exported to ${theme.primary(filename)}`);

      // Pause to show success message
      await new Promise((resolve) => setTimeout(resolve, 2000));
    } catch (error) {
      output.error(
        `Failed to export: ${error instanceof Error ? error.message : String(error)}`
      );
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
}

/**
 * Start interactive configuration display
 */
export async function showInteractive(
  options: InteractiveOptions = {},
  linkedApp?: string
): Promise<void> {
  const navigator = new InteractiveNavigator(options);
  await navigator.start(linkedApp);
}
