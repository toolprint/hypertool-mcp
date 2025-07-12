/**
 * Tests for simplified toolset configuration validator
 */

import { 
  validateToolsetConfig, 
  matchesToolPattern,
  isValidToolsetName,
  getValidationSummary 
} from "./validator";
import { validateRefFormat as validateToolReferenceFormat } from "./validator";
import { ToolsetConfig, DynamicToolReference } from "./types";

describe("ToolsetValidator", () => {
  describe("validateToolsetConfig", () => {
    it("should validate a valid configuration", () => {
      const config: ToolsetConfig = {
        name: "test-toolset",
        description: "A test configuration",
        version: "1.0.0",
        createdAt: new Date(),
        tools: [
          { namespacedName: "git.status", refId: "hash123456789" },
          { namespacedName: "docker.ps", refId: "hash987654321" },
        ],
      };

      const result = validateToolsetConfig(config);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should reject configuration without name", () => {
      const config = {
        tools: [],
      } as unknown as ToolsetConfig;

      const result = validateToolsetConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Configuration must have a valid name");
    });

    it("should reject configuration with empty name", () => {
      const config: ToolsetConfig = {
        name: "  ",
        tools: [],
        version: "1.0.0",
        createdAt: new Date(),
      };

      const result = validateToolsetConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Configuration name cannot be empty");
    });

    it("should reject invalid name formats", () => {
      const config: ToolsetConfig = {
        name: "Test_Toolset", // Invalid characters
        tools: [],
        version: "1.0.0", 
        createdAt: new Date(),
      };

      const result = validateToolsetConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Configuration name must contain only lowercase letters, numbers, and hyphens");
    });

    it("should reject configuration without tools array", () => {
      const config = {
        name: "test-toolset",
      } as ToolsetConfig;

      const result = validateToolsetConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Configuration must have a tools array");
    });

    it("should reject configuration with empty tools array", () => {
      const config: ToolsetConfig = {
        name: "test-toolset",
        tools: [],
        version: "1.0.0",
        createdAt: new Date(),
      };

      const result = validateToolsetConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Configuration must specify at least one tool");
    });

    it("should validate individual tool references", () => {
      const config: ToolsetConfig = {
        name: "test-toolset",
        tools: [
          { namespacedName: "git.status" }, // Valid - has namespacedName
          { refId: "hash123456789" }, // Valid - has refId
          {} as DynamicToolReference, // Invalid - has neither
          { namespacedName: "" }, // Invalid - empty namespacedName
          { refId: "short" }, // Invalid - refId too short
        ],
        version: "1.0.0",
        createdAt: new Date(),
      };

      const result = validateToolsetConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Tool reference at index 2 must have either namespacedName or refId");
      expect(result.errors).toContain("Tool reference at index 3: namespacedName cannot be empty");
      expect(result.errors).toContain("Tool reference at index 4: refId appears too short to be a valid hash");
    });

    it("should warn about duplicate tool references", () => {
      const config: ToolsetConfig = {
        name: "test-toolset",
        tools: [
          { namespacedName: "git.status", refId: "hash1" },
          { namespacedName: "git.status", refId: "hash2" }, // Duplicate namespacedName
          { namespacedName: "docker.ps", refId: "hash1" }, // Duplicate refId
        ],
        version: "1.0.0",
        createdAt: new Date(),
      };

      const result = validateToolsetConfig(config);
      expect(result.warnings).toContain("Duplicate tool references found: git.status, hash1");
    });

    it("should validate optional fields", () => {
      const config: ToolsetConfig = {
        name: "test-toolset",
        description: 123 as any, // Invalid type
        version: 456 as any, // Invalid type
        createdAt: "not-a-date" as any, // Invalid type
        tools: [
          { namespacedName: "git.status" },
        ],
      };

      const result = validateToolsetConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Description must be a string if provided");
      expect(result.errors).toContain("Version must be a string if provided");
      expect(result.errors).toContain("createdAt must be a Date object if provided");
    });

    it("should provide suggestions for large toolsets", () => {
      const manyTools = Array.from({ length: 60 }, (_, i) => ({
        namespacedName: `server.tool${i}`,
      }));

      const config: ToolsetConfig = {
        name: "large-toolset",
        tools: manyTools,
        version: "1.0.0",
        createdAt: new Date(),
      };

      const result = validateToolsetConfig(config);
      expect(result.suggestions).toContain("Consider breaking large toolsets into smaller, focused ones for better maintainability");
    });

    it("should suggest adding refId values", () => {
      const config: ToolsetConfig = {
        name: "test-toolset",
        tools: [
          { namespacedName: "git.status" }, // No refId
          { namespacedName: "docker.ps" }, // No refId
        ],
        version: "1.0.0",
        createdAt: new Date(),
      };

      const result = validateToolsetConfig(config);
      expect(result.suggestions).toContain("Consider adding refId values to tool references for better validation and security");
    });
  });

  describe("validateToolReferenceFormat", () => {
    it("should validate tool reference with namespacedName", () => {
      const ref = { namespacedName: "git.status" };
      expect(validateToolReferenceFormat(ref)).toBe(true);
    });

    it("should validate tool reference with refId", () => {
      const ref = { refId: "hash123456789" };
      expect(validateToolReferenceFormat(ref)).toBe(true);
    });

    it("should validate tool reference with both", () => {
      const ref = { namespacedName: "git.status", refId: "hash123456789" };
      expect(validateToolReferenceFormat(ref)).toBe(true);
    });

    it.skip("should reject empty tool reference", () => {
      const ref = {};
      const result = validateToolReferenceFormat(ref);
      expect(typeof result).toBe("boolean");
      expect(result).toBe(false);
    });

    it.skip("should reject non-object reference", () => {
      expect(validateToolReferenceFormat("not-an-object")).toBe(false);
      expect(validateToolReferenceFormat(null)).toBe(false);
      expect(validateToolReferenceFormat(undefined)).toBe(false);
    });

    it.skip("should reject reference with empty strings", () => {
      const ref = { namespacedName: "", refId: "" };
      expect(validateToolReferenceFormat(ref)).toBe(false);
    });
  });

  describe("isValidToolsetName", () => {
    it("should accept valid names", () => {
      expect(isValidToolsetName("test-toolset")).toBe(true);
      expect(isValidToolsetName("my-dev-tools")).toBe(true);
      expect(isValidToolsetName("admin123")).toBe(true);
      expect(isValidToolsetName("ab")).toBe(true); // Minimum length
    });

    it("should reject invalid names", () => {
      expect(isValidToolsetName("Test_Toolset")).toBe(false); // Uppercase/underscore
      expect(isValidToolsetName("test toolset")).toBe(false); // Space
      expect(isValidToolsetName("test.toolset")).toBe(false); // Dot
      expect(isValidToolsetName("a")).toBe(false); // Too short
      expect(isValidToolsetName("a".repeat(51))).toBe(false); // Too long
      expect(isValidToolsetName("")).toBe(false); // Empty
      expect(isValidToolsetName(undefined as any)).toBe(false); // Undefined
    });
  });

  describe("matchesToolPattern", () => {
    it("should match exact patterns", () => {
      expect(matchesToolPattern("git.status", "git.status")).toBe(true);
      expect(matchesToolPattern("docker.ps", "docker.ps")).toBe(true);
    });

    it("should match wildcard pattern", () => {
      expect(matchesToolPattern("git.status", "*")).toBe(true);
      expect(matchesToolPattern("anything", "*")).toBe(true);
    });

    it("should not match different patterns", () => {
      expect(matchesToolPattern("git.status", "docker.ps")).toBe(false);
      expect(matchesToolPattern("git.status", "git.log")).toBe(false);
    });
  });

  describe("getValidationSummary", () => {
    it("should return success message for valid config", () => {
      const result = { valid: true, errors: [], warnings: [], suggestions: [] };
      const summary = getValidationSummary(result);
      expect(summary).toBe("✅ Configuration is valid with no issues");
    });

    it("should return error summary for invalid config", () => {
      const result = { 
        valid: false, 
        errors: ["Missing name", "Invalid tools"], 
        warnings: [],
        suggestions: []
      };
      const summary = getValidationSummary(result);
      expect(summary).toContain("❌ Configuration has errors");
      expect(summary).toContain("Errors (2):");
      expect(summary).toContain("• Missing name");
      expect(summary).toContain("• Invalid tools");
    });

    it("should include warnings and suggestions", () => {
      const result = { 
        valid: true, 
        errors: [], 
        warnings: ["Large toolset"],
        suggestions: ["Add refIds"]
      };
      const summary = getValidationSummary(result);
      expect(summary).toContain("✅ Configuration is valid");
      expect(summary).toContain("Warnings (1):");
      expect(summary).toContain("• Large toolset");
      expect(summary).toContain("Suggestions (1):");
      expect(summary).toContain("• Add refIds");
    });
  });
});