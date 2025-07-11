/**
 * Toolset configuration loader
 */

import { promises as fs } from "fs";
import path from "path";
import { ToolsetConfig, ToolsetParserOptions, ValidationResult } from "./types";
import { validateToolsetConfig } from "./validator";

/**
 * Load toolset configuration from file
 */
export async function loadToolsetConfig(
  filePath: string,
  options: ToolsetParserOptions = {}
): Promise<{
  config?: ToolsetConfig;
  validation: ValidationResult;
  error?: string;
}> {
  try {
    // Read file
    const fileContent = await fs.readFile(filePath, "utf-8");

    // Parse JSON
    let rawConfig: any;
    try {
      rawConfig = JSON.parse(fileContent);
    } catch (parseError) {
      const message =
        parseError instanceof Error ? parseError.message : String(parseError);
      return {
        validation: {
          valid: false,
          errors: [`Invalid JSON format: ${message}`],
          warnings: [],
        },
        error: `Failed to parse JSON: ${message}`,
      };
    }

    // Convert to ToolsetConfig
    const config = normalizeToolsetConfig(rawConfig);

    // Validate configuration
    let validation = validateToolsetConfig(config);

    // Apply custom validation if provided
    if (options.customValidation) {
      const customResult = options.customValidation(config);
      validation = {
        valid: validation.valid && customResult.valid,
        errors: [...validation.errors, ...customResult.errors],
        warnings: [...validation.warnings, ...customResult.warnings],
        suggestions: [
          ...(validation.suggestions || []),
          ...(customResult.suggestions || []),
        ],
      };
    }

    return {
      config,
      validation,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      validation: {
        valid: false,
        errors: [`Failed to load configuration: ${message}`],
        warnings: [],
      },
      error: message,
    };
  }
}

/**
 * Save toolset configuration to file
 */
export async function saveToolsetConfig(
  config: ToolsetConfig,
  filePath: string,
  options: { createDir?: boolean; pretty?: boolean } = {}
): Promise<{ success: boolean; error?: string }> {
  try {
    // Validate configuration before saving
    const validation = validateToolsetConfig(config);
    if (!validation.valid) {
      return {
        success: false,
        error: `Configuration validation failed: ${validation.errors.join(", ")}`,
      };
    }

    // Create directory if requested
    if (options.createDir) {
      const dir = path.dirname(filePath);
      await fs.mkdir(dir, { recursive: true });
    }

    // Normalize config before saving
    const normalizedConfig = {
      ...config,
      lastModified: new Date(),
    };

    // Convert to JSON
    const jsonContent = options.pretty
      ? JSON.stringify(normalizedConfig, null, 2)
      : JSON.stringify(normalizedConfig);

    // Write file
    await fs.writeFile(filePath, jsonContent, "utf-8");

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Load multiple toolset configurations from directory
 */
export async function loadToolsetConfigs(
  directoryPath: string,
  options: ToolsetParserOptions = {}
): Promise<{
  configs: Array<{
    filePath: string;
    config?: ToolsetConfig;
    validation: ValidationResult;
    error?: string;
  }>;
  summary: {
    total: number;
    valid: number;
    invalid: number;
  };
}> {
  const configs: Array<{
    filePath: string;
    config?: ToolsetConfig;
    validation: ValidationResult;
    error?: string;
  }> = [];

  try {
    // Read directory
    const files = await fs.readdir(directoryPath);
    const jsonFiles = files.filter((file) => file.endsWith(".json"));

    // Load each configuration
    for (const file of jsonFiles) {
      const filePath = path.join(directoryPath, file);
      const result = await loadToolsetConfig(filePath, options);

      configs.push({
        filePath,
        ...result,
      });
    }

    // Generate summary
    const summary = {
      total: configs.length,
      valid: configs.filter((c) => c.validation.valid).length,
      invalid: configs.filter((c) => !c.validation.valid).length,
    };

    return { configs, summary };
  } catch {
    return {
      configs: [],
      summary: { total: 0, valid: 0, invalid: 0 },
    };
  }
}

/**
 * Normalize raw configuration object to ToolsetConfig
 */
function normalizeToolsetConfig(rawConfig: any): ToolsetConfig {
  const config: ToolsetConfig = {
    name: rawConfig.name || "Unnamed Toolset",
    description: rawConfig.description,
    version: rawConfig.version || "1.0.0",
    createdAt: rawConfig.createdAt ? new Date(rawConfig.createdAt) : new Date(),
    lastModified: rawConfig.lastModified
      ? new Date(rawConfig.lastModified)
      : new Date(),
    servers: [],
    options: rawConfig.options || {},
  };

  // Normalize servers
  if (Array.isArray(rawConfig.servers)) {
    config.servers = rawConfig.servers.map((server: any) => ({
      serverName: server.serverName || "",
      tools: server.tools || { includeAll: true },
      enabled: server.enabled !== undefined ? server.enabled : true,
      enableNamespacing:
        server.enableNamespacing !== undefined
          ? server.enableNamespacing
          : true,
      customNamespace: server.customNamespace,
    }));
  }

  return config;
}

/**
 * Check if file exists and is readable
 */
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath, fs.constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get default toolset configuration file path
 */
export function getDefaultConfigPath(configDir?: string): string {
  const baseDir = configDir || path.join(process.cwd(), ".meta-mcp");
  return path.join(baseDir, "toolset.json");
}

/**
 * Create example toolset configuration
 */
export function createExampleConfig(): ToolsetConfig {
  return {
    name: "Example Toolset",
    description: "Example toolset configuration showing various patterns",
    version: "1.0.0",
    createdAt: new Date(),
    servers: [
      {
        serverName: "git",
        tools: {
          includeAll: true,
          exclude: ["git-internal", "git-debug"],
        },
        enabled: true,
        enableNamespacing: true,
      },
      {
        serverName: "docker",
        tools: {
          include: ["docker-ps", "docker-build", "docker-run"],
        },
        enabled: true,
        enableNamespacing: true,
      },
      {
        serverName: "context7",
        tools: {
          includePattern: "^search-",
          excludePattern: ".*-internal$",
        },
        enabled: true,
        enableNamespacing: false,
        customNamespace: "ctx",
      },
    ],
    options: {
      namespaceSeparator: ".",
      enableNamespacing: true,
      autoResolveConflicts: true,
      conflictResolution: "namespace",
      enableCaching: true,
      cacheTtl: 300000, // 5 minutes
    },
  };
}
