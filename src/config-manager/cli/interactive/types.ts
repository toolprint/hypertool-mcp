/**
 * Type definitions for interactive configuration navigation
 */

import { ServerInfo, ApplicationStatus, ToolsetInfo } from "../show.js";
import { ServerConfigGroup } from "../../../db/interfaces.js";

/**
 * Navigation view types
 */
export enum ViewType {
  MAIN_MENU = "main_menu",
  SERVERS_LIST = "servers_list",
  SERVER_DETAIL = "server_detail",
  APPLICATIONS_LIST = "applications_list",
  APPLICATION_DETAIL = "application_detail",
  GROUPS_LIST = "groups_list",
  GROUP_DETAIL = "group_detail",
  TOOLSETS_LIST = "toolsets_list",
  TOOLSET_DETAIL = "toolset_detail",
  TOOL_DETAIL = "tool_detail",
}

/**
 * Navigation state for managing the view stack
 */
export interface NavigationState {
  viewType: ViewType;
  breadcrumb: string[];
  data?: unknown;
  selectedItem?: unknown;
}

/**
 * Configuration data collected for the interactive session
 */
export interface ConfigurationData {
  servers: ServerInfo[];
  applications: ApplicationStatus[];
  toolsets: ToolsetInfo[];
  groups?: ServerConfigGroup[];
  configPath: string;
  linkedApp?: string;
}

/**
 * Interactive menu action types
 */
export enum MenuAction {
  SELECT = "select",
  BACK = "back",
  EXIT = "exit",
  REFRESH = "refresh",
  EXPORT_JSON = "export_json",
  EXPORT_YAML = "export_yaml",
  FILTER = "filter",
  SEARCH = "search",
  NEXT_PAGE = "next_page",
  PREV_PAGE = "prev_page",
  COPY_TO_CLIPBOARD = "copy",
}

/**
 * Menu choice for inquirer
 */
export interface MenuChoice {
  name: string;
  value: unknown;
  short?: string;
  disabled?: boolean | string;
}

/**
 * Filter options for server list
 */
export interface ServerFilterOptions {
  transportType?: "all" | "stdio" | "http" | "sse" | "websocket";
  healthStatus?: "all" | "healthy" | "unhealthy";
  source?: string;
}

/**
 * Summary statistics for the main menu
 */
export interface SummaryStats {
  servers: {
    total: number;
    healthy: number;
    byType: Record<string, number>;
  };
  applications: {
    total: number;
    installed: number;
    linked: number;
  };
  groups?: {
    total: number;
    active: number;
  };
  toolsets: {
    total: number;
    inUse: number;
  };
}

/**
 * Interactive session options
 */
export interface InteractiveOptions {
  json?: boolean;
  yaml?: boolean;
  pageSize?: number;
  enableSearch?: boolean;
}

/**
 * Export format types
 */
export enum ExportFormat {
  JSON = "json",
  YAML = "yaml",
}
