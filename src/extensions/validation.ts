/**
 * Extension Configuration Validation Service
 * Validates user settings against manifest user_config schemas
 */

import {
  DxtManifest,
  UserConfigParam,
  ExtensionUserConfig,
  ValidationResult,
} from "../config/dxt-config.js";

/**
 * Extension validation service
 */
export class ExtensionValidationService {
  /**
   * Validate extension configuration against manifest user_config schema
   */
  validateExtensionConfig(
    manifest: DxtManifest,
    userSettings?: ExtensionUserConfig
  ): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // If no user_config in manifest, everything is valid
    if (!manifest.user_config) {
      return { isValid: true, errors, warnings };
    }

    const userConfig = userSettings?.userConfig || {};

    // Validate each parameter defined in manifest
    for (const [key, paramDef] of Object.entries(manifest.user_config)) {
      const value = userConfig[key];

      // Check required fields
      if (paramDef.required && (value === undefined || value === null)) {
        errors.push(`Missing required config: ${key}`);
        continue;
      }

      // Skip further validation if value is not provided and not required
      if (value === undefined || value === null) {
        continue;
      }

      // Type validation
      const typeValidation = this.validateParameterType(value, paramDef);
      if (!typeValidation.isValid) {
        errors.push(
          `Invalid type for ${key}. Expected ${paramDef.type}, got ${typeof value}`
        );
        continue;
      }

      // Range validation for numbers
      if (paramDef.type === "number" && typeof value === "number") {
        if (paramDef.min !== undefined && value < paramDef.min) {
          errors.push(`Value for ${key} must be >= ${paramDef.min}`);
        }
        if (paramDef.max !== undefined && value > paramDef.max) {
          errors.push(`Value for ${key} must be <= ${paramDef.max}`);
        }
      }

      // Multiple value validation
      if (paramDef.multiple && !Array.isArray(value)) {
        errors.push(`Value for ${key} must be an array (multiple: true)`);
      }
      if (!paramDef.multiple && Array.isArray(value)) {
        errors.push(`Value for ${key} must not be an array (multiple: false)`);
      }

      // Directory/file existence validation
      if (paramDef.type === "directory" || paramDef.type === "file") {
        const pathValidation = this.validatePathExists(value, paramDef.type);
        if (!pathValidation.isValid) {
          warnings.push(`${key}: ${pathValidation.message}`);
        }
      }
    }

    // Check for unknown config keys
    for (const key of Object.keys(userConfig)) {
      if (!manifest.user_config[key]) {
        warnings.push(
          `Unknown config key: ${key} (not defined in manifest user_config)`
        );
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Validate parameter type including array handling
   */
  private validateParameterType(
    value: any,
    paramDef: UserConfigParam
  ): { isValid: boolean; message?: string } {
    if (paramDef.multiple) {
      if (!Array.isArray(value)) {
        return {
          isValid: false,
          message: "Expected array for multiple values",
        };
      }

      // Validate each array element
      for (let i = 0; i < value.length; i++) {
        const elementValidation = this.validateSingleType(
          value[i],
          paramDef.type
        );
        if (!elementValidation.isValid) {
          return {
            isValid: false,
            message: `Array element ${i}: ${elementValidation.message}`,
          };
        }
      }
      return { isValid: true };
    } else {
      return this.validateSingleType(value, paramDef.type);
    }
  }

  /**
   * Validate single value type
   */
  private validateSingleType(
    value: any,
    type: string
  ): { isValid: boolean; message?: string } {
    switch (type) {
      case "string":
        if (typeof value !== "string") {
          return {
            isValid: false,
            message: `Expected string, got ${typeof value}`,
          };
        }
        return { isValid: true };

      case "number":
        if (typeof value !== "number") {
          return {
            isValid: false,
            message: `Expected number, got ${typeof value}`,
          };
        }
        if (isNaN(value) || !isFinite(value)) {
          return { isValid: false, message: "Expected finite number" };
        }
        return { isValid: true };

      case "boolean":
        if (typeof value !== "boolean") {
          return {
            isValid: false,
            message: `Expected boolean, got ${typeof value}`,
          };
        }
        return { isValid: true };

      case "directory":
      case "file":
        if (typeof value !== "string") {
          return {
            isValid: false,
            message: `Expected string path, got ${typeof value}`,
          };
        }
        if (value.trim() === "") {
          return { isValid: false, message: "Path cannot be empty" };
        }
        return { isValid: true };

      default:
        return { isValid: false, message: `Unknown type: ${type}` };
    }
  }

  /**
   * Validate path exists (non-blocking, returns warning if not found)
   */
  private validatePathExists(
    path: string,
    type: "directory" | "file"
  ): { isValid: boolean; message?: string } {
    try {
      const fs = require("fs");
      const stats = fs.statSync(path);

      if (type === "directory" && !stats.isDirectory()) {
        return {
          isValid: false,
          message: `Path exists but is not a directory: ${path}`,
        };
      }

      if (type === "file" && !stats.isFile()) {
        return {
          isValid: false,
          message: `Path exists but is not a file: ${path}`,
        };
      }

      return { isValid: true };
    } catch (error) {
      const code = (error as any)?.code;
      if (code === "ENOENT") {
        return { isValid: false, message: `Path does not exist: ${path}` };
      }
      return {
        isValid: false,
        message: `Cannot access path: ${path} (${code})`,
      };
    }
  }

  /**
   * Get validation summary for logging
   */
  getValidationSummary(
    extensionName: string,
    validationResult: ValidationResult
  ): string {
    if (validationResult.isValid) {
      if (validationResult.warnings.length > 0) {
        return `Extension '${extensionName}' is valid with warnings: ${validationResult.warnings.join(", ")}`;
      }
      return `Extension '${extensionName}' is valid`;
    } else {
      return `Extension '${extensionName}' is invalid: ${validationResult.errors.join(", ")}`;
    }
  }

  /**
   * Create detailed validation report
   */
  createValidationReport(
    extensionName: string,
    manifest: DxtManifest,
    userSettings: ExtensionUserConfig | undefined,
    validationResult: ValidationResult
  ): string {
    const lines: string[] = [];

    lines.push(`Validation Report for Extension: ${extensionName}`);
    lines.push(`Status: ${validationResult.isValid ? "VALID" : "INVALID"}`);

    if (validationResult.errors.length > 0) {
      lines.push("");
      lines.push("Errors:");
      validationResult.errors.forEach((error) => lines.push(`  - ${error}`));
    }

    if (validationResult.warnings.length > 0) {
      lines.push("");
      lines.push("Warnings:");
      validationResult.warnings.forEach((warning) =>
        lines.push(`  - ${warning}`)
      );
    }

    if (manifest.user_config) {
      lines.push("");
      lines.push("Available Configuration Parameters:");
      Object.entries(manifest.user_config).forEach(([key, param]) => {
        const required = param.required ? " (required)" : "";
        const multiple = param.multiple ? " (multiple)" : "";
        const range =
          param.type === "number" && (param.min || param.max)
            ? ` (${param.min || "min"}-${param.max || "max"})`
            : "";

        lines.push(`  ${key}: ${param.type}${required}${multiple}${range}`);
        if (param.description) {
          lines.push(`    ${param.description}`);
        }
        if (param.default !== undefined) {
          lines.push(`    Default: ${JSON.stringify(param.default)}`);
        }

        const currentValue = userSettings?.userConfig?.[key];
        if (currentValue !== undefined) {
          lines.push(`    Current: ${JSON.stringify(currentValue)}`);
        }
      });
    }

    return lines.join("\n");
  }

  /**
   * Suggest fixes for validation errors
   */
  suggestFixes(
    extensionName: string,
    manifest: DxtManifest,
    validationResult: ValidationResult
  ): string[] {
    const suggestions: string[] = [];

    if (!validationResult.isValid) {
      suggestions.push(
        `To fix extension '${extensionName}', update your config.json:`
      );
      suggestions.push(`{`);
      suggestions.push(`  "extensions": {`);
      suggestions.push(`    "settings": {`);
      suggestions.push(`      "${extensionName}": {`);
      suggestions.push(`        "isEnabled": true,`);
      suggestions.push(`        "userConfig": {`);

      // Suggest required fields
      if (manifest.user_config) {
        Object.entries(manifest.user_config).forEach(([key, param]) => {
          if (param.required) {
            const defaultValue =
              param.default !== undefined
                ? JSON.stringify(param.default)
                : this.getExampleValue(param);
            suggestions.push(`          "${key}": ${defaultValue},`);
          }
        });
      }

      suggestions.push(`        }`);
      suggestions.push(`      }`);
      suggestions.push(`    }`);
      suggestions.push(`  }`);
      suggestions.push(`}`);
    }

    return suggestions;
  }

  /**
   * Get example value for a parameter type
   */
  private getExampleValue(param: UserConfigParam): string {
    switch (param.type) {
      case "string":
        return '"example_value"';
      case "number":
        return param.min !== undefined ? param.min.toString() : "1";
      case "boolean":
        return "true";
      case "directory":
        return '"/path/to/directory"';
      case "file":
        return '"/path/to/file"';
      default:
        return '"value"';
    }
  }
}
