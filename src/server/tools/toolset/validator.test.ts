/**
 * Tests for simplified toolset configuration validator
 */

import { describe, it, expect } from "vitest";
import { validateToolsetConfig } from "./validator.js";
import { ToolsetConfig, DynamicToolReference } from "./types.js";

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
      expect(result.errors).toContain(
        "Configuration name must contain only lowercase letters, numbers, and hyphens"
      );
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
      expect(result.errors).toContain(
        "Configuration must specify at least one tool"
      );
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
      expect(result.errors).toContain(
        "Tool reference at index 2 must have either namespacedName or refId"
      );
      expect(result.errors).toContain(
        "Tool reference at index 3: namespacedName cannot be empty"
      );
      expect(result.errors).toContain(
        "Tool reference at index 4: refId appears too short to be a valid hash"
      );
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
      expect(result.warnings).toContain(
        "Duplicate tool references found: git.status, hash1"
      );
    });

    it("should validate optional fields", () => {
      const config: ToolsetConfig = {
        name: "test-toolset",
        description: 123 as any, // Invalid type
        version: 456 as any, // Invalid type
        createdAt: "not-a-date" as any, // Invalid type
        tools: [{ namespacedName: "git.status" }],
      };

      const result = validateToolsetConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        "Description must be a string if provided"
      );
      expect(result.errors).toContain("Version must be a string if provided");
      expect(result.errors).toContain(
        "createdAt must be a valid Date object or ISO string if provided"
      );
    });

    it("should accept valid ISO string dates", () => {
      const config: ToolsetConfig = {
        name: "test-toolset",
        description: "Test toolset with ISO date",
        version: "1.0.0",
        createdAt: "2023-12-01T10:00:00.000Z", // Valid ISO string
        tools: [{ namespacedName: "git.status" }],
      };

      const result = validateToolsetConfig(config);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
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
      expect(result.suggestions).toContain(
        "Consider breaking large toolsets into smaller, focused ones for better maintainability"
      );
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
      expect(result.suggestions).toContain(
        "Consider adding refId values to tool references for better validation and security"
      );
    });

    it("should accept valid aliases", () => {
      const config: ToolsetConfig = {
        name: "aliased-toolset",
        tools: [
          { namespacedName: "git.status", alias: "git_status" },
          { namespacedName: "docker.ps", alias: "docker_ps" },
        ],
      };

      const result = validateToolsetConfig(config);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should reject duplicate aliases", () => {
      const config: ToolsetConfig = {
        name: "duplicate-alias",
        tools: [
          { namespacedName: "git.status", alias: "status_tool" },
          { namespacedName: "docker.ps", alias: "status_tool" },
        ],
      };

      const result = validateToolsetConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        'Tool reference at index 1: alias "status_tool" is already used by another tool'
      );
    });

    it("should reject aliases that conflict with canonical names", () => {
      const config: ToolsetConfig = {
        name: "conflicting-alias",
        tools: [
          { namespacedName: "git.status" },
          { namespacedName: "docker.ps", alias: "git_status" },
        ],
      };

      const result = validateToolsetConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        'Tool reference at index 1: alias "git_status" conflicts with the canonical name of another tool'
      );
    });

    it("should reject aliases with invalid format", () => {
      const config: ToolsetConfig = {
        name: "invalid-alias",
        tools: [
          { namespacedName: "git.status", alias: "GitStatus" },
        ],
      };

      const result = validateToolsetConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        "Tool reference at index 0: alias must contain only lowercase letters, numbers, and underscores"
      );
    });
  });
});
