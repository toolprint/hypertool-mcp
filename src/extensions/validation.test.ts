/**
 * Extension Validation Service Tests
 */

import { describe, it, expect } from "vitest";
import { ExtensionValidationService } from "./validation.js";
import { DxtManifest, ExtensionUserConfig } from "../config/dxt-config.js";

describe("ExtensionValidationService", () => {
  const validationService = new ExtensionValidationService();

  describe("validateExtensionConfig", () => {
    it("should validate successfully when no user_config in manifest", () => {
      const manifest: DxtManifest = {
        dxt_version: "0.1",
        name: "test-extension",
        version: "1.0.0",
        server: {
          type: "node",
          mcp_config: {
            command: "node",
            args: ["server.js"],
          },
        },
      };

      const result = validationService.validateExtensionConfig(manifest);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });

    it("should validate required string parameter", () => {
      const manifest: DxtManifest = {
        dxt_version: "0.1",
        name: "test-extension",
        version: "1.0.0",
        server: {
          type: "node",
          mcp_config: {
            command: "node",
            args: ["server.js"],
          },
        },
        user_config: {
          api_key: {
            type: "string",
            required: true,
            title: "API Key",
          },
        },
      };

      // Missing required parameter
      const resultMissing = validationService.validateExtensionConfig(manifest);
      expect(resultMissing.isValid).toBe(false);
      expect(resultMissing.errors).toContain(
        "Missing required config: api_key"
      );

      // Valid parameter
      const userSettings: ExtensionUserConfig = {
        isEnabled: true,
        userConfig: {
          api_key: "test-key",
        },
      };
      const resultValid = validationService.validateExtensionConfig(
        manifest,
        userSettings
      );
      expect(resultValid.isValid).toBe(true);

      // Invalid type
      const userSettingsInvalid: ExtensionUserConfig = {
        isEnabled: true,
        userConfig: {
          api_key: 123,
        },
      };
      const resultInvalid = validationService.validateExtensionConfig(
        manifest,
        userSettingsInvalid
      );
      expect(resultInvalid.isValid).toBe(false);
      expect(resultInvalid.errors).toContain(
        "Invalid type for api_key. Expected string, got number"
      );
    });

    it("should validate number parameter with range", () => {
      const manifest: DxtManifest = {
        dxt_version: "0.1",
        name: "test-extension",
        version: "1.0.0",
        server: {
          type: "node",
          mcp_config: {
            command: "node",
            args: ["server.js"],
          },
        },
        user_config: {
          timeout: {
            type: "number",
            min: 1,
            max: 300,
            default: 30,
          },
        },
      };

      // Valid value
      const userSettingsValid: ExtensionUserConfig = {
        isEnabled: true,
        userConfig: {
          timeout: 60,
        },
      };
      const resultValid = validationService.validateExtensionConfig(
        manifest,
        userSettingsValid
      );
      expect(resultValid.isValid).toBe(true);

      // Below minimum
      const userSettingsLow: ExtensionUserConfig = {
        isEnabled: true,
        userConfig: {
          timeout: 0,
        },
      };
      const resultLow = validationService.validateExtensionConfig(
        manifest,
        userSettingsLow
      );
      expect(resultLow.isValid).toBe(false);
      expect(resultLow.errors).toContain("Value for timeout must be >= 1");

      // Above maximum
      const userSettingsHigh: ExtensionUserConfig = {
        isEnabled: true,
        userConfig: {
          timeout: 400,
        },
      };
      const resultHigh = validationService.validateExtensionConfig(
        manifest,
        userSettingsHigh
      );
      expect(resultHigh.isValid).toBe(false);
      expect(resultHigh.errors).toContain("Value for timeout must be <= 300");
    });

    it("should validate multiple values", () => {
      const manifest: DxtManifest = {
        dxt_version: "0.1",
        name: "test-extension",
        version: "1.0.0",
        server: {
          type: "node",
          mcp_config: {
            command: "node",
            args: ["server.js"],
          },
        },
        user_config: {
          directories: {
            type: "directory",
            multiple: true,
            required: true,
          },
          single_dir: {
            type: "directory",
            multiple: false,
          },
        },
      };

      // Valid multiple values
      const userSettingsValid: ExtensionUserConfig = {
        isEnabled: true,
        userConfig: {
          directories: ["/path/one", "/path/two"],
          single_dir: "/single/path",
        },
      };
      const resultValid = validationService.validateExtensionConfig(
        manifest,
        userSettingsValid
      );
      expect(resultValid.isValid).toBe(true);

      // Invalid: array for non-multiple
      const userSettingsInvalid: ExtensionUserConfig = {
        isEnabled: true,
        userConfig: {
          directories: ["/path/one", "/path/two"],
          single_dir: ["/single/path"],
        },
      };
      const resultInvalid = validationService.validateExtensionConfig(
        manifest,
        userSettingsInvalid
      );
      expect(resultInvalid.isValid).toBe(false);
      expect(
        resultInvalid.errors.some(
          (error) =>
            error.includes("got object") || error.includes("not be an array")
        )
      ).toBe(true);

      // Invalid: non-array for multiple
      const userSettingsInvalid2: ExtensionUserConfig = {
        isEnabled: true,
        userConfig: {
          directories: "/single/path",
        },
      };
      const resultInvalid2 = validationService.validateExtensionConfig(
        manifest,
        userSettingsInvalid2
      );
      expect(resultInvalid2.isValid).toBe(false);
      expect(
        resultInvalid2.errors.some(
          (error) =>
            error.includes("must be an array") ||
            error.includes("Expected directory")
        )
      ).toBe(true);
    });

    it("should warn about unknown config keys", () => {
      const manifest: DxtManifest = {
        dxt_version: "0.1",
        name: "test-extension",
        version: "1.0.0",
        server: {
          type: "node",
          mcp_config: {
            command: "node",
            args: ["server.js"],
          },
        },
        user_config: {
          known_param: {
            type: "string",
          },
        },
      };

      const userSettings: ExtensionUserConfig = {
        isEnabled: true,
        userConfig: {
          known_param: "value",
          unknown_param: "unknown",
        },
      };

      const result = validationService.validateExtensionConfig(
        manifest,
        userSettings
      );
      expect(result.isValid).toBe(true);
      expect(result.warnings).toContain(
        "Unknown config key: unknown_param (not defined in manifest user_config)"
      );
    });

    it("should validate boolean parameters", () => {
      const manifest: DxtManifest = {
        dxt_version: "0.1",
        name: "test-extension",
        version: "1.0.0",
        server: {
          type: "node",
          mcp_config: {
            command: "node",
            args: ["server.js"],
          },
        },
        user_config: {
          enabled: {
            type: "boolean",
            default: false,
          },
        },
      };

      // Valid boolean
      const userSettingsValid: ExtensionUserConfig = {
        isEnabled: true,
        userConfig: {
          enabled: true,
        },
      };
      const resultValid = validationService.validateExtensionConfig(
        manifest,
        userSettingsValid
      );
      expect(resultValid.isValid).toBe(true);

      // Invalid type
      const userSettingsInvalid: ExtensionUserConfig = {
        isEnabled: true,
        userConfig: {
          enabled: "true",
        },
      };
      const resultInvalid = validationService.validateExtensionConfig(
        manifest,
        userSettingsInvalid
      );
      expect(resultInvalid.isValid).toBe(false);
      expect(resultInvalid.errors).toContain(
        "Invalid type for enabled. Expected boolean, got string"
      );
    });
  });

  describe("getValidationSummary", () => {
    it("should generate correct summary for valid extension", () => {
      const result = {
        isValid: true,
        errors: [],
        warnings: [],
      };
      const summary = validationService.getValidationSummary(
        "test-ext",
        result
      );
      expect(summary).toBe("Extension 'test-ext' is valid");
    });

    it("should generate correct summary for valid extension with warnings", () => {
      const result = {
        isValid: true,
        errors: [],
        warnings: ["Unknown config key: test"],
      };
      const summary = validationService.getValidationSummary(
        "test-ext",
        result
      );
      expect(summary).toBe(
        "Extension 'test-ext' is valid with warnings: Unknown config key: test"
      );
    });

    it("should generate correct summary for invalid extension", () => {
      const result = {
        isValid: false,
        errors: ["Missing required config: api_key"],
        warnings: [],
      };
      const summary = validationService.getValidationSummary(
        "test-ext",
        result
      );
      expect(summary).toBe(
        "Extension 'test-ext' is invalid: Missing required config: api_key"
      );
    });
  });

  describe("createValidationReport", () => {
    it("should create detailed validation report", () => {
      const manifest: DxtManifest = {
        dxt_version: "0.1",
        name: "test-extension",
        version: "1.0.0",
        server: {
          type: "node",
          mcp_config: {
            command: "node",
            args: ["server.js"],
          },
        },
        user_config: {
          api_key: {
            type: "string",
            required: true,
            title: "API Key",
            description: "Your API key for authentication",
          },
          timeout: {
            type: "number",
            min: 1,
            max: 300,
            default: 30,
            title: "Timeout",
            description: "Request timeout in seconds",
          },
        },
      };

      const userSettings: ExtensionUserConfig = {
        isEnabled: true,
        userConfig: {
          timeout: 60,
        },
      };

      const validationResult = {
        isValid: false,
        errors: ["Missing required config: api_key"],
        warnings: [],
      };

      const report = validationService.createValidationReport(
        "test-ext",
        manifest,
        userSettings,
        validationResult
      );

      expect(report).toContain("Validation Report for Extension: test-ext");
      expect(report).toContain("Status: INVALID");
      expect(report).toContain("Missing required config: api_key");
      expect(report).toContain("api_key: string (required)");
      expect(report).toContain("Your API key for authentication");
      expect(report).toContain("timeout: number (1-300)");
      expect(report).toContain("Current: 60");
    });
  });
});
