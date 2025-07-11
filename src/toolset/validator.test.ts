/**
 * Tests for toolset configuration validator
 */

import { validateToolsetConfig, matchesToolPattern } from "./validator";
import { ToolsetConfig, ToolPattern } from "./types";

describe("ToolsetValidator", () => {
  describe("validateToolsetConfig", () => {
    it("should validate a valid configuration", () => {
      const config: ToolsetConfig = {
        name: "Test Toolset",
        description: "A test configuration",
        version: "1.0.0",
        servers: [
          {
            serverName: "git",
            tools: { includeAll: true },
            enabled: true,
          },
        ],
        options: {
          namespaceSeparator: ".",
          enableNamespacing: true,
        },
      };

      const result = validateToolsetConfig(config);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should reject configuration without name", () => {
      const config = {
        servers: [],
      } as unknown as ToolsetConfig;

      const result = validateToolsetConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Configuration must have a valid name");
    });

    it("should reject configuration with empty name", () => {
      const config: ToolsetConfig = {
        name: "  ",
        servers: [],
      };

      const result = validateToolsetConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Configuration name cannot be empty");
    });

    it("should reject configuration without servers array", () => {
      const config = {
        name: "Test",
      } as ToolsetConfig;

      const result = validateToolsetConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        "Configuration must have a servers array"
      );
    });

    it("should detect duplicate server names", () => {
      const config: ToolsetConfig = {
        name: "Test",
        servers: [
          { serverName: "git", tools: { includeAll: true } },
          { serverName: "git", tools: { includeAll: true } },
        ],
      };

      const result = validateToolsetConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Duplicate server names found: git");
    });

    it("should validate server configurations", () => {
      const config: ToolsetConfig = {
        name: "Test",
        servers: [
          { serverName: "", tools: { includeAll: true } },
          { serverName: "valid", tools: {} as any },
        ],
      };

      const result = validateToolsetConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        "Server 1: serverName is required and must be a string"
      );
      expect(result.errors).toContain(
        "Server 2: must specify includeAll, include, or includePattern"
      );
    });

    it("should validate tool patterns", () => {
      const config: ToolsetConfig = {
        name: "Test",
        servers: [
          {
            serverName: "git",
            tools: {
              includePattern: "[invalid-regex",
              excludePattern: "valid.*pattern",
            },
          },
        ],
      };

      const result = validateToolsetConfig(config);
      expect(result.valid).toBe(false);
      expect(
        result.errors.some((e) =>
          e.includes("includePattern is not a valid regex")
        )
      ).toBe(true);
    });

    it("should validate options", () => {
      const config: ToolsetConfig = {
        name: "Test",
        servers: [{ serverName: "git", tools: { includeAll: true } }],
        options: {
          namespaceSeparator: "",
          conflictResolution: "invalid" as any,
          cacheTtl: -1,
        },
      };

      const result = validateToolsetConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("namespaceSeparator cannot be empty");
      expect(result.errors).toContain(
        "conflictResolution must be one of: namespace, prefix-server, error"
      );
      expect(result.errors).toContain("cacheTtl must be non-negative");
    });

    it("should provide suggestions", () => {
      const config: ToolsetConfig = {
        name: "Test",
        servers: [],
      };

      const result = validateToolsetConfig(config);
      expect(result.suggestions).toContain(
        "Add at least one server configuration"
      );
      expect(result.suggestions).toContain(
        "Consider adding a description to document the toolset purpose"
      );
    });
  });

  describe("matchesToolPattern", () => {
    it("should match with includeAll", () => {
      const pattern: ToolPattern = { includeAll: true };
      expect(matchesToolPattern("any-tool", pattern)).toBe(true);
    });

    it("should match explicit includes", () => {
      const pattern: ToolPattern = { include: ["tool1", "tool2"] };
      expect(matchesToolPattern("tool1", pattern)).toBe(true);
      expect(matchesToolPattern("tool3", pattern)).toBe(false);
    });

    it("should match include patterns", () => {
      const pattern: ToolPattern = { includePattern: "^git-" };
      expect(matchesToolPattern("git-status", pattern)).toBe(true);
      expect(matchesToolPattern("docker-ps", pattern)).toBe(false);
    });

    it("should exclude with excludes", () => {
      const pattern: ToolPattern = {
        includeAll: true,
        exclude: ["internal-tool"],
      };
      expect(matchesToolPattern("normal-tool", pattern)).toBe(true);
      expect(matchesToolPattern("internal-tool", pattern)).toBe(false);
    });

    it("should exclude with exclude patterns", () => {
      const pattern: ToolPattern = {
        includeAll: true,
        excludePattern: ".*-debug$",
      };
      expect(matchesToolPattern("normal-tool", pattern)).toBe(true);
      expect(matchesToolPattern("tool-debug", pattern)).toBe(false);
    });

    it("should handle complex patterns", () => {
      const pattern: ToolPattern = {
        includePattern: "^git-",
        exclude: ["git-internal"],
        excludePattern: ".*-test$",
      };

      expect(matchesToolPattern("git-status", pattern)).toBe(true);
      expect(matchesToolPattern("git-internal", pattern)).toBe(false);
      expect(matchesToolPattern("git-merge-test", pattern)).toBe(false);
      expect(matchesToolPattern("docker-ps", pattern)).toBe(false);
    });

    it("should handle invalid regex gracefully", () => {
      const pattern: ToolPattern = { includePattern: "[invalid" };
      expect(matchesToolPattern("any-tool", pattern)).toBe(false);
    });

    it("should prioritize excludes over includes", () => {
      const pattern: ToolPattern = {
        include: ["tool1"],
        exclude: ["tool1"],
      };
      expect(matchesToolPattern("tool1", pattern)).toBe(false);
    });
  });
});
