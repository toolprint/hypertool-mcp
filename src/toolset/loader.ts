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
 * Normalize raw configuration object to ToolsetConfig
 */
function normalizeToolsetConfig(rawConfig: any): ToolsetConfig {
  const config: ToolsetConfig = {
    name: rawConfig.name || "Unnamed Toolset",
    description: rawConfig.description,
    version: rawConfig.version || "1.0.0",
    createdAt: rawConfig.createdAt ? new Date(rawConfig.createdAt) : new Date(),
    tools: [],
  };

  // Normalize tools array
  if (Array.isArray(rawConfig.tools)) {
    config.tools = rawConfig.tools.filter((tool: any) => {
      return (tool.namespacedName && typeof tool.namespacedName === 'string') ||
             (tool.refId && typeof tool.refId === 'string');
    });
  }

  return config;
}
