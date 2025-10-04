/**
 * Simplified toolset configuration validator
 */

import {
  ToolsetConfig,
  ValidationResult,
  DynamicToolReference,
} from "./types.js";

const ALIAS_PATTERN = /^[a-z0-9_]+$/;

function flattenToolName(namespacedName: string): string {
  return namespacedName.replace(/\./g, "_");
}

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
    errors.push(
      "Configuration name must contain only lowercase letters, numbers, and hyphens"
    );
  }

  // Tools validation
  if (!config.tools || !Array.isArray(config.tools)) {
    errors.push("Configuration must have a tools array");
  } else if (config.tools.length === 0) {
    errors.push("Configuration must specify at least one tool");
  } else {
    // Validate each tool reference
    const canonicalNameByIndex = new Map<number, string>();

    config.tools.forEach((toolRef, index) => {
      const toolErrors = validateToolReference(toolRef, index);
      errors.push(...toolErrors);

      if (toolRef.namespacedName) {
        canonicalNameByIndex.set(
          index,
          flattenToolName(toolRef.namespacedName)
        );
      }
    });

    // Check for duplicate tool references
    const allRefs: string[] = [];
    config.tools.forEach((ref) => {
      if (ref.namespacedName) allRefs.push(ref.namespacedName);
      if (ref.refId) allRefs.push(ref.refId);
    });

    const seenRefs = new Set<string>();
    const duplicates = new Set<string>();
    allRefs.forEach((ref) => {
      if (seenRefs.has(ref)) {
        duplicates.add(ref);
      } else {
        seenRefs.add(ref);
      }
    });

    if (duplicates.size > 0) {
      warnings.push(
        `Duplicate tool references found: ${Array.from(duplicates).join(", ")}`
      );
    }

    // Build lookup for canonical flattened names
    const canonicalNameToIndex = new Map<string, number>();
    canonicalNameByIndex.forEach((canonical, index) => {
      if (!canonicalNameToIndex.has(canonical)) {
        canonicalNameToIndex.set(canonical, index);
      }
    });

    // Validate aliases (format, uniqueness, collisions)
    const aliasToIndex = new Map<string, number>();

    config.tools.forEach((ref, index) => {
      if (ref.alias === undefined) {
        return;
      }

      if (typeof ref.alias !== "string") {
        errors.push(`Tool reference at index ${index}: alias must be a string`);
        return;
      }

      const trimmedAlias = ref.alias.trim();

      if (trimmedAlias.length === 0) {
        errors.push(`Tool reference at index ${index}: alias cannot be empty`);
        return;
      }

      if (trimmedAlias.length < 2 || trimmedAlias.length > 50) {
        errors.push(
          `Tool reference at index ${index}: alias must be between 2 and 50 characters`
        );
      }

      if (!ALIAS_PATTERN.test(trimmedAlias)) {
        errors.push(
          `Tool reference at index ${index}: alias must contain only lowercase letters, numbers, and underscores`
        );
      }

      const existingAliasIndex = aliasToIndex.get(trimmedAlias);
      if (existingAliasIndex !== undefined && existingAliasIndex !== index) {
        errors.push(
          `Tool reference at index ${index}: alias "${trimmedAlias}" is already used by another tool`
        );
      } else {
        aliasToIndex.set(trimmedAlias, index);
      }

      const canonicalOwnerIndex = canonicalNameToIndex.get(trimmedAlias);

      if (canonicalOwnerIndex !== undefined && canonicalOwnerIndex !== index) {
        errors.push(
          `Tool reference at index ${index}: alias "${trimmedAlias}" conflicts with the canonical name of another tool`
        );
      }

      if (ref.namespacedName && trimmedAlias === ref.namespacedName) {
        warnings.push(
          `Tool reference at index ${index}: alias matches the namespaced name; consider omitting the alias`
        );
      }

      // Update alias to trimmed value for downstream consumers
      if (ref.alias !== trimmedAlias) {
        ref.alias = trimmedAlias;
      }
    });
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

  if (config.createdAt) {
    if (!(config.createdAt instanceof Date)) {
      if (typeof config.createdAt === "string") {
        const parsedDate = new Date(config.createdAt);
        if (isNaN(parsedDate.getTime())) {
          errors.push(
            "createdAt must be a valid Date object or ISO string if provided"
          );
        }
      } else {
        errors.push(
          "createdAt must be a Date object or ISO string if provided"
        );
      }
    }
  }

  // Provide suggestions for improvement
  if (config.tools && config.tools.length > 50) {
    suggestions.push(
      "Consider breaking large toolsets into smaller, focused ones for better maintainability"
    );
  }

  if (config.tools && config.tools.every((ref) => !ref.refId)) {
    suggestions.push(
      "Consider adding refId values to tool references for better validation and security"
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
 * Validate a single tool reference
 */
function validateToolReference(
  ref: DynamicToolReference,
  index: number
): string[] {
  const errors: string[] = [];

  // Check if at least one valid identifier is provided
  const hasValidNamespacedName =
    ref.namespacedName &&
    typeof ref.namespacedName === "string" &&
    ref.namespacedName.trim().length > 0;
  const hasValidRefId =
    ref.refId && typeof ref.refId === "string" && ref.refId.trim().length > 0;

  if (!hasValidNamespacedName && !hasValidRefId) {
    errors.push(
      `Tool reference at index ${index} must have either namespacedName or refId`
    );
  }

  if (ref.namespacedName !== undefined) {
    if (typeof ref.namespacedName !== "string") {
      errors.push(
        `Tool reference at index ${index}: namespacedName must be a string`
      );
    } else if (ref.namespacedName.trim().length === 0) {
      errors.push(
        `Tool reference at index ${index}: namespacedName cannot be empty`
      );
    } else if (!ref.namespacedName.includes(".")) {
      errors.push(
        `Tool reference at index ${index}: namespacedName should include server namespace (e.g., "server.tool")`
      );
    }
  }

  if (ref.refId !== undefined) {
    if (typeof ref.refId !== "string") {
      errors.push(`Tool reference at index ${index}: refId must be a string`);
    } else if (ref.refId.trim().length === 0) {
      errors.push(`Tool reference at index ${index}: refId cannot be empty`);
    } else if (ref.refId.length < 10) {
      errors.push(
        `Tool reference at index ${index}: refId appears too short to be a valid hash`
      );
    }
  }

  return errors;
}
