/**
 * Simplified toolset configuration validator
 */

import {
  ToolsetConfig,
  ValidationResult,
  DynamicToolReference,
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
  } else if (config.name.length < 2 || config.name.length > 50) {
    errors.push("Configuration name must be between 2 and 50 characters");
  } else if (!/^[a-z0-9-]+$/.test(config.name)) {
    errors.push("Configuration name must contain only lowercase letters, numbers, and hyphens");
  }

  // Tools validation
  if (!config.tools || !Array.isArray(config.tools)) {
    errors.push("Configuration must have a tools array");
  } else if (config.tools.length === 0) {
    errors.push("Configuration must specify at least one tool");
  } else {
    // Validate each tool reference
    config.tools.forEach((toolRef, index) => {
      const toolErrors = validateToolReference(toolRef, index);
      errors.push(...toolErrors);
    });

    // Check for duplicate tool references
    const refs = config.tools.map(ref => ref.namespacedName || ref.refId);
    const duplicates = refs.filter((ref, index) => refs.indexOf(ref) !== index);
    if (duplicates.length > 0) {
      warnings.push(`Duplicate tool references found: ${duplicates.join(', ')}`);
    }
  }

  // Optional fields validation
  if (config.description && typeof config.description !== "string") {
    errors.push("Description must be a string if provided");
  } else if (config.description && config.description.length > 500) {
    warnings.push("Description is quite long, consider shortening it");
  }

  if (config.version && typeof config.version !== "string") {
    errors.push("Version must be a string if provided");
  }

  if (config.createdAt && !(config.createdAt instanceof Date)) {
    errors.push("createdAt must be a Date object if provided");
  }

  // Provide suggestions for improvement
  if (config.tools && config.tools.length > 50) {
    suggestions.push("Consider breaking large toolsets into smaller, focused ones for better maintainability");
  }

  if (config.tools && config.tools.every(ref => !ref.refId)) {
    suggestions.push("Consider adding refId values to tool references for better validation and security");
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    suggestions,
  };
}

/**
 * Validate a single tool reference
 */
function validateToolReference(ref: DynamicToolReference, index: number): string[] {
  const errors: string[] = [];

  if (!ref.namespacedName && !ref.refId) {
    errors.push(`Tool reference at index ${index} must have either namespacedName or refId`);
  }

  if (ref.namespacedName) {
    if (typeof ref.namespacedName !== "string") {
      errors.push(`Tool reference at index ${index}: namespacedName must be a string`);
    } else if (ref.namespacedName.trim().length === 0) {
      errors.push(`Tool reference at index ${index}: namespacedName cannot be empty`);
    } else if (!ref.namespacedName.includes('.')) {
      errors.push(`Tool reference at index ${index}: namespacedName should include server namespace (e.g., "server.tool")`);
    }
  }

  if (ref.refId) {
    if (typeof ref.refId !== "string") {
      errors.push(`Tool reference at index ${index}: refId must be a string`);
    } else if (ref.refId.trim().length === 0) {
      errors.push(`Tool reference at index ${index}: refId cannot be empty`);
    } else if (ref.refId.length < 10) {
      errors.push(`Tool reference at index ${index}: refId appears too short to be a valid hash`);
    }
  }

  return errors;
}

/**
 * Check if a tool name matches a pattern (simplified - no complex patterns in new system)
 * Kept for backward compatibility
 */
export function matchesToolPattern(toolName: string, pattern: string): boolean {
  // Simple exact match in the simplified system
  return toolName === pattern || pattern === "*";
}

/**
 * Validate tool reference format
 */
export function validateToolReferenceFormat(ref: any): ref is DynamicToolReference {
  if (!ref || typeof ref !== "object") {
    return false;
  }

  const hasNamespacedName = ref.namespacedName && typeof ref.namespacedName === "string" && ref.namespacedName.trim().length > 0;
  const hasRefId = ref.refId && typeof ref.refId === "string" && ref.refId.trim().length > 0;

  return hasNamespacedName || hasRefId;
}

/**
 * Check if toolset name follows naming conventions
 */
export function isValidToolsetName(name: string): boolean {
  if (!name || typeof name !== "string") {
    return false;
  }

  // Must be between 2-50 characters, lowercase with hyphens only
  return /^[a-z0-9-]{2,50}$/.test(name);
}

/**
 * Get validation summary for display
 */
export function getValidationSummary(result: ValidationResult): string {
  const { valid, errors, warnings, suggestions } = result;
  
  if (valid && warnings.length === 0 && (suggestions?.length || 0) === 0) {
    return "✅ Configuration is valid with no issues";
  }

  let summary = valid ? "✅ Configuration is valid" : "❌ Configuration has errors";
  
  if (errors.length > 0) {
    summary += `\n\nErrors (${errors.length}):\n${errors.map(e => `  • ${e}`).join('\n')}`;
  }
  
  if (warnings.length > 0) {
    summary += `\n\nWarnings (${warnings.length}):\n${warnings.map(w => `  • ${w}`).join('\n')}`;
  }
  
  if (suggestions && suggestions.length > 0) {
    summary += `\n\nSuggestions (${suggestions.length}):\n${suggestions.map(s => `  • ${s}`).join('\n')}`;
  }
  
  return summary;
}