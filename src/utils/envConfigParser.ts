/**
 * Environment variable configuration parser
 *
 * Parses dot-notation environment variables into nested configuration objects
 * Examples:
 *   mcpServers.git.command=uvx → {mcpServers: {git: {command: "uvx"}}}
 *   mcpServers.git.args.0=mcp-server-git → {mcpServers: {git: {args: ["mcp-server-git"]}}}
 */

export interface ParsedEnvConfig {
  mcpServers?: Record<string, any>;
  debug?: boolean;
  logLevel?: string;
  equipToolset?: string;
  [key: string]: any;
}

/**
 * Type coercion for environment variable values
 */
function coerceValue(value: string): any {
  // Handle boolean values
  if (value === "true") return true;
  if (value === "false") return false;

  // Handle null/undefined
  if (value === "null") return null;
  if (value === "undefined") return undefined;

  // Handle numbers (but be very conservative - only coerce multi-digit numbers or decimals)
  // Single digits like "1" are often used as strings in environment variables
  if (/^\d{2,}(\.\d+)?$/.test(value) && !isNaN(Number(value))) {
    return Number(value);
  }

  // Try to parse as JSON (for objects/arrays)
  if (
    (value.startsWith("{") && value.endsWith("}")) ||
    (value.startsWith("[") && value.endsWith("]"))
  ) {
    try {
      return JSON.parse(value);
    } catch {
      // If JSON parsing fails, return as string
    }
  }

  // Return as string
  return value;
}

/**
 * Set a nested property on an object using dot notation
 */
function setNestedProperty(obj: any, path: string, value: any): void {
  const parts = path.split(".");
  let current = obj;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];

    // Handle array indices (numeric keys)
    if (!isNaN(Number(part))) {
      const index = Number(part);
      if (!Array.isArray(current)) {
        current = [];
      }
      if (!current[index]) {
        // Check if next part is numeric (array) or not (object)
        const nextPart = parts[i + 1];
        current[index] = !isNaN(Number(nextPart)) ? [] : {};
      }
      current = current[index];
    } else {
      if (!current[part]) {
        // Check if next part is numeric (array) or not (object)
        const nextPart = parts[i + 1];
        current[part] = !isNaN(Number(nextPart)) ? [] : {};
      }
      current = current[part];
    }
  }

  const lastPart = parts[parts.length - 1];
  if (!isNaN(Number(lastPart))) {
    const index = Number(lastPart);
    if (!Array.isArray(current)) {
      current = [];
    }
    current[index] = value;
  } else {
    current[lastPart] = value;
  }
}

/**
 * Parse environment variables with dot notation into nested configuration
 */
export function parseEnvDotNotation(
  envVars?: Record<string, string>
): ParsedEnvConfig {
  const env = envVars || process.env;
  const result: ParsedEnvConfig = {};

  // Find all environment variables that might be configuration
  const configKeys = Object.keys(env).filter((key) => {
    // Look for Smithery-style dot notation
    if (key.includes(".")) {
      return (
        key.startsWith("mcpServers.") ||
        key.startsWith("config.") ||
        key.startsWith("CONFIG_") ||
        // Also handle other common config patterns
        key.startsWith("debug.") ||
        key.startsWith("logLevel.") ||
        key.startsWith("equipToolset.")
      );
    }
    // Also handle simple configuration keys without dots
    return key === "debug" || key === "logLevel" || key === "equipToolset";
  });

  // Parse each configuration key
  for (const key of configKeys) {
    const value = env[key];
    if (value === undefined) continue;

    const coercedValue = coerceValue(value);

    try {
      setNestedProperty(result, key, coercedValue);
    } catch (error) {
      console.warn(
        `Failed to parse environment variable ${key}=${value}:`,
        error
      );
    }
  }

  // Also handle simple boolean/string environment variables
  if (env.DEBUG) {
    result.debug = coerceValue(env.DEBUG);
  }
  if (env.LOG_LEVEL) {
    result.logLevel = env.LOG_LEVEL;
  }
  if (env.EQUIP_TOOLSET) {
    result.equipToolset = env.EQUIP_TOOLSET;
  }

  return result;
}

/**
 * Check if environment contains Smithery-style configuration
 */
export function hasSmitheryConfig(envVars?: Record<string, string>): boolean {
  const env = envVars || process.env;
  return Object.keys(env).some(
    (key) =>
      key.startsWith("mcpServers.") ||
      key.startsWith("config.mcpServers.") ||
      key.startsWith("CONFIG_MCPSERVERS_")
  );
}

/**
 * Get configuration source description for logging
 */
export function getConfigSourceDescription(config: ParsedEnvConfig): string {
  const sources = [];

  if (config.mcpServers && Object.keys(config.mcpServers).length > 0) {
    sources.push(
      `mcpServers (${Object.keys(config.mcpServers).length} servers)`
    );
  }
  if (config.debug !== undefined) {
    sources.push("debug");
  }
  if (config.logLevel) {
    sources.push("logLevel");
  }
  if (config.equipToolset) {
    sources.push("equipToolset");
  }

  return sources.length > 0 ? sources.join(", ") : "no configuration";
}

/**
 * Validate parsed configuration for common issues
 */
export function validateParsedConfig(config: ParsedEnvConfig): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (config.mcpServers) {
    for (const [serverName, serverConfig] of Object.entries(
      config.mcpServers
    )) {
      if (!serverConfig || typeof serverConfig !== "object") {
        errors.push(`Server '${serverName}' has invalid configuration`);
        continue;
      }

      if (!serverConfig.type) {
        errors.push(
          `Server '${serverName}' is missing required 'type' property`
        );
      }

      if (!serverConfig.command && serverConfig.type === "stdio") {
        errors.push(
          `Server '${serverName}' is missing required 'command' property for stdio transport`
        );
      }
    }
  }

  if (
    config.logLevel &&
    !["trace", "debug", "info", "warn", "error", "fatal"].includes(
      config.logLevel
    )
  ) {
    errors.push(`Invalid log level: ${config.logLevel}`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
