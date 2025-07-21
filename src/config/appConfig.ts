import { readFileSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Read package.json to get version and other metadata
const packageJsonPath = join(__dirname, "../../package.json");
const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));

/**
 * Centralized application configuration
 * Update these values in one place to change them throughout the entire project
 */

/**
 * Converts a display name to a technical name (kebab-case)
 */
function toTechnicalName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export interface AppConfig {
  /** The main application name */
  appName: string;
  /** Technical name used for logging and internal references (computed from appName) */
  readonly technicalName: string;
  /** Application version (from package.json) */
  readonly version: string;
  /** Application description */
  description: string;
  /** Brand name (parent organization) */
  brandName: string;
}

export const APP_CONFIG: AppConfig = {
  appName: "Hypertool MCP",
  get technicalName() {
    return toTechnicalName(this.appName);
  },
  get version() {
    return packageJson.version;
  },
  description:
    "Hypertool MCP proxy server for routing requests between clients and multiple underlying MCP servers",
  brandName: "toolprint",
} as const;

// Convenience exports for common usage patterns
export const {
  appName: APP_NAME,
  technicalName: APP_TECHNICAL_NAME,
  version: APP_VERSION,
  description: APP_DESCRIPTION,
  brandName: BRAND_NAME,
} = APP_CONFIG;
