/**
 * Types for the vibe setup wizard
 */

export interface WizardState {
  // Detection results
  detectedApps: DetectedApp[];
  existingConfigs: ExistingConfig[];

  // User selections
  selectedApps: string[];
  importStrategy: ImportStrategy;
  selectedExample?: ExampleConfig; // Selected example configuration
  perAppSelections: Record<string, SelectedServer[]>; // appId -> selected servers
  toolsets: ToolsetDefinition[];
  installationType: InstallationType;

  // Conflict resolution (disabled but kept for future use)
  serverNameMapping: Record<string, string>;

  // Options
  dryRun: boolean;
  nonInteractive: boolean;
  verbose: boolean;

  // State
  cancelled?: boolean;
}

export interface DetectedApp {
  id: string;
  displayName: string;
  configPath: string;
  detected: boolean;
  hasExistingConfig: boolean;
  serverCount?: number;
}

export interface ExistingConfig {
  appId: string;
  servers: ServerInfo[];
  configPath: string;
}

export interface ServerInfo {
  name: string;
  command: string;
  args?: string[];
  description?: string;
  fromApp: string;
}

/**
 * Example configuration template
 */
export interface ExampleConfig {
  id: string;
  name: string;
  description: string;
  fileName: string;
  serverCount: number;
  requiresSecrets: boolean;
  category: "zero-setup" | "specialized" | "full-featured";
}

export interface SelectedServer extends ServerInfo {
  selected: boolean;
  newName?: string; // For conflict resolution
}

export type ImportStrategy =
  | "per-app" // Configure servers per application (default)
  | "fresh" // Start with no existing configs
  | "examples" // Start from an example configuration
  | "view"; // View configs before deciding

export type InstallationType =
  | "standard" // Replace app configs with Hypertool proxy
  | "development" // Use alongside existing configs
  | "custom"; // Advanced configuration

export interface ToolsetDefinition {
  name: string;
  displayName: string;
  description: string;
  tools: string[];
  suggested: boolean;
}

export interface WizardStep {
  name: string;
  run(state: WizardState): Promise<WizardState>;
  canSkip?: boolean;
}

export interface SetupOptions {
  // CLI flags
  yes?: boolean; // Accept all defaults
  dryRun?: boolean; // Preview without changes
  apps?: string[]; // Specify apps to configure
  importAll?: boolean; // Import all configs
  standard?: boolean; // Use standard installation
  development?: boolean; // Use development installation
  skipToolsets?: boolean; // Skip toolset creation
  verbose?: boolean; // Show detailed output
  example?: string; // Use specific example config
  listExamples?: boolean; // List available examples

  // Internal
  isFirstRun?: boolean; // True when no config exists
}
