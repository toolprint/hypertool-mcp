/**
 * Toolset configuration validator
 */

import {
  ToolsetConfig,
  ValidationResult,
  ToolPattern,
  ServerToolConfig,
} from "./types";

/**
 * Validate a toolset configuration
 */
export function validateToolsetConfig(config: ToolsetConfig): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const suggestions: string[] = [];

  // Basic structure validation
  if (!config.name || typeof config.name !== "string") {
    errors.push("Configuration must have a valid name");
  } else if (config.name.trim().length === 0) {
    errors.push("Configuration name cannot be empty");
  }

  if (!config.servers || !Array.isArray(config.servers)) {
    errors.push("Configuration must have a servers array");
  } else {
    // Validate each server configuration
    config.servers.forEach((server, index) => {
      const serverErrors = validateServerConfig(server, index);
      errors.push(...serverErrors);
    });

    // Check for duplicate server names
    const serverNames = config.servers.map((s) => s.serverName);
    const duplicates = serverNames.filter(
      (name, index) => serverNames.indexOf(name) !== index
    );
    if (duplicates.length > 0) {
      errors.push(`Duplicate server names found: ${duplicates.join(", ")}`);
    }
  }

  // Validate version if provided
  if (config.version && typeof config.version !== "string") {
    errors.push("Version must be a string");
  }

  // Validate options if provided
  if (config.options) {
    const optionsErrors = validateToolsetOptions(config.options);
    errors.push(...optionsErrors);
  }

  // Generate suggestions
  if (config.servers && config.servers.length === 0) {
    suggestions.push("Add at least one server configuration");
  }

  if (!config.description) {
    suggestions.push(
      "Consider adding a description to document the toolset purpose"
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    suggestions,
  };
}

/**
 * Validate a server configuration
 */
function validateServerConfig(
  server: ServerToolConfig,
  index: number
): string[] {
  const errors: string[] = [];
  const prefix = `Server ${index + 1}`;

  if (!server.serverName || typeof server.serverName !== "string") {
    errors.push(`${prefix}: serverName is required and must be a string`);
  } else if (server.serverName.trim().length === 0) {
    errors.push(`${prefix}: serverName cannot be empty`);
  }

  if (!server.tools) {
    errors.push(`${prefix}: tools configuration is required`);
  } else {
    const toolErrors = validateToolPattern(server.tools, prefix);
    errors.push(...toolErrors);
  }

  if (server.enabled !== undefined && typeof server.enabled !== "boolean") {
    errors.push(`${prefix}: enabled must be a boolean`);
  }

  if (
    server.enableNamespacing !== undefined &&
    typeof server.enableNamespacing !== "boolean"
  ) {
    errors.push(`${prefix}: enableNamespacing must be a boolean`);
  }

  if (server.customNamespace !== undefined) {
    if (typeof server.customNamespace !== "string") {
      errors.push(`${prefix}: customNamespace must be a string`);
    } else if (server.customNamespace.trim().length === 0) {
      errors.push(`${prefix}: customNamespace cannot be empty`);
    }
  }

  return errors;
}

/**
 * Validate tool pattern
 */
function validateToolPattern(pattern: ToolPattern, prefix: string): string[] {
  const errors: string[] = [];


  if (pattern.exclude && !Array.isArray(pattern.exclude)) {
    errors.push(`${prefix}: exclude must be an array`);
  } else if (pattern.exclude) {
    pattern.exclude.forEach((tool, index) => {
      if (typeof tool !== "string") {
        errors.push(`${prefix}: exclude[${index}] must be a string`);
      } else if (tool.trim().length === 0) {
        errors.push(`${prefix}: exclude[${index}] cannot be empty`);
      }
    });
  }

  if (pattern.includePattern !== undefined) {
    if (typeof pattern.includePattern !== "string") {
      errors.push(`${prefix}: includePattern must be a string`);
    } else {
      try {
        new RegExp(pattern.includePattern);
      } catch (e) {
        errors.push(
          `${prefix}: includePattern is not a valid regex: ${e instanceof Error ? e.message : String(e)}`
        );
      }
    }
  }

  if (pattern.excludePattern !== undefined) {
    if (typeof pattern.excludePattern !== "string") {
      errors.push(`${prefix}: excludePattern must be a string`);
    } else {
      try {
        new RegExp(pattern.excludePattern);
      } catch (e) {
        errors.push(
          `${prefix}: excludePattern is not a valid regex: ${e instanceof Error ? e.message : String(e)}`
        );
      }
    }
  }

  if (
    pattern.includeAll !== undefined &&
    typeof pattern.includeAll !== "boolean"
  ) {
    errors.push(`${prefix}: includeAll must be a boolean`);
  }

  // Logical validation
  if (pattern.includeAll && (pattern.includeRefs || pattern.includePattern)) {
    errors.push(
      `${prefix}: includeAll cannot be used with includeRefs or includePattern`
    );
  }

  // Validate includeRefs if present
  if (pattern.includeRefs && !Array.isArray(pattern.includeRefs)) {
    errors.push(`${prefix}: includeRefs must be an array`);
  } else if (pattern.includeRefs) {
    pattern.includeRefs.forEach((ref, index) => {
      if (!ref || typeof ref !== "object") {
        errors.push(`${prefix}: includeRefs[${index}] must be an object`);
      } else {
        if (!ref.namespacedName && !ref.refId) {
          errors.push(`${prefix}: includeRefs[${index}] must have either namespacedName or refId`);
        }
        if (ref.namespacedName && typeof ref.namespacedName !== "string") {
          errors.push(`${prefix}: includeRefs[${index}].namespacedName must be a string`);
        }
        if (ref.refId && typeof ref.refId !== "string") {
          errors.push(`${prefix}: includeRefs[${index}].refId must be a string`);
        }
      }
    });
  }

  if (!pattern.includeAll && !pattern.includeRefs && !pattern.includePattern) {
    errors.push(
      `${prefix}: must specify includeAll, includeRefs, or includePattern`
    );
  }

  return errors;
}

/**
 * Validate toolset options
 */
function validateToolsetOptions(options: any): string[] {
  const errors: string[] = [];

  if (options.namespaceSeparator !== undefined) {
    if (typeof options.namespaceSeparator !== "string") {
      errors.push("namespaceSeparator must be a string");
    } else if (options.namespaceSeparator.length === 0) {
      errors.push("namespaceSeparator cannot be empty");
    }
  }

  if (
    options.enableNamespacing !== undefined &&
    typeof options.enableNamespacing !== "boolean"
  ) {
    errors.push("enableNamespacing must be a boolean");
  }

  if (
    options.autoResolveConflicts !== undefined &&
    typeof options.autoResolveConflicts !== "boolean"
  ) {
    errors.push("autoResolveConflicts must be a boolean");
  }

  if (options.conflictResolution !== undefined) {
    const validValues = ["namespace", "prefix-server", "error"];
    if (!validValues.includes(options.conflictResolution)) {
      errors.push(
        `conflictResolution must be one of: ${validValues.join(", ")}`
      );
    }
  }

  if (
    options.enableCaching !== undefined &&
    typeof options.enableCaching !== "boolean"
  ) {
    errors.push("enableCaching must be a boolean");
  }

  if (options.cacheTtl !== undefined) {
    if (typeof options.cacheTtl !== "number") {
      errors.push("cacheTtl must be a number");
    } else if (options.cacheTtl < 0) {
      errors.push("cacheTtl must be non-negative");
    }
  }

  return errors;
}

/**
 * Validate tool against pattern (requires discovered tool for refId validation)
 */
export function matchesToolPattern(
  tool: { name: string; namespacedName: string; fullHash: string },
  pattern: ToolPattern
): boolean {
  // Check includeAll
  if (pattern.includeAll) {
    return !isExcluded(tool.name, pattern);
  }


  // Check includeRefs with reconciliation
  if (pattern.includeRefs) {
    for (const ref of pattern.includeRefs) {
      // Match by namespacedName
      if (ref.namespacedName && ref.namespacedName === tool.namespacedName) {
        // If refId is also present, validate consistency
        if (ref.refId && ref.refId !== tool.fullHash) {
          console.warn(`Tool reference inconsistency: ${ref.namespacedName} has refId mismatch. Expected: ${ref.refId}, Found: ${tool.fullHash}`);
          // Still allow the match but log the inconsistency
        }
        return !isExcluded(tool.name, pattern);
      }
      
      // Match by refId
      if (ref.refId && ref.refId === tool.fullHash) {
        // If namespacedName is also present, validate consistency
        if (ref.namespacedName && ref.namespacedName !== tool.namespacedName) {
          console.warn(`Tool reference inconsistency: refId ${ref.refId} points to ${tool.namespacedName}, but expected ${ref.namespacedName}`);
          // Still allow the match but log the inconsistency
        }
        return !isExcluded(tool.name, pattern);
      }
    }
  }

  // Check include pattern
  if (pattern.includePattern) {
    try {
      const regex = new RegExp(pattern.includePattern);
      if (regex.test(tool.name)) {
        return !isExcluded(tool.name, pattern);
      }
    } catch {
      // Invalid regex, skip
    }
  }

  return false;
}

/**
 * Check if tool name is excluded by pattern
 */
function isExcluded(toolName: string, pattern: ToolPattern): boolean {
  // Check explicit excludes
  if (pattern.exclude && pattern.exclude.includes(toolName)) {
    return true;
  }

  // Check exclude pattern
  if (pattern.excludePattern) {
    try {
      const regex = new RegExp(pattern.excludePattern);
      if (regex.test(toolName)) {
        return true;
      }
    } catch {
      // Invalid regex, skip
    }
  }

  return false;
}
