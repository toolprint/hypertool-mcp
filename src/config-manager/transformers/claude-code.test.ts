/**
 * Tests for Claude Code configuration transformer
 */

import { describe, it, expect } from "vitest";
import { ClaudeCodeTransformer } from "./claude-code.js";

describe("ClaudeCodeTransformer", () => {
  const transformer = new ClaudeCodeTransformer();

  // Realistic test fixture based on actual Claude Code config structure
  const mockClaudeCodeConfig = {
    numStartups: 1,
    installMethod: "unknown",
    autoUpdates: true,
    tipsHistory: { "ide-hotkey": 1 },
    mcpServers: {
      "existing-server": {
        type: "stdio",
        command: "node",
        args: ["/path/to/server.js"],
      },
    },
    projects: {
      "/path/to/project": {
        allowedTools: [],
        history: [],
        mcpContextUris: [],
        mcpServers: {},
        enabledMcpjsonServers: [],
        disabledMcpjsonServers: [],
        hasTrustDialogAccepted: true,
        projectOnboardingSeenCount: 1,
        hasClaudeMdExternalIncludesApproved: false,
        hasClaudeMdExternalIncludesWarningShown: false,
        lastTotalWebSearchRequests: 0,
        exampleFiles: ["file1.js", "file2.js"],
        exampleFilesGeneratedAt: 1234567890,
      },
    },
    userID: "anonymized-user-id",
    firstStartTime: "2025-01-01T00:00:00.000Z",
    oauthAccount: {
      accountUuid: "uuid-placeholder",
      emailAddress: "user@example.com",
      organizationUuid: "org-uuid-placeholder",
      organizationRole: "admin",
      workspaceRole: null,
      organizationName: "Test Organization",
    },
    isQualifiedForDataSharing: false,
    shiftEnterKeyBindingInstalled: true,
    hasCompletedOnboarding: true,
    lastOnboardingVersion: "1.0.61",
    cachedChangelog: "# Changelog\n\n## Latest version...",
    changelogLastFetched: 1234567890,
    fallbackAvailableWarningThreshold: 0.5,
    subscriptionNoticeCount: 0,
    hasAvailableSubscription: false,
    lastReleaseNotesSeen: "1.0.61",
  };

  describe("toStandard", () => {
    it("should extract mcpServers from Claude Code format", () => {
      const result = transformer.toStandard(mockClaudeCodeConfig);

      expect(result.mcpServers).toEqual({
        "existing-server": {
          type: "stdio",
          command: "node",
          args: ["/path/to/server.js"],
        },
      });
    });

    it("should handle config without mcpServers", () => {
      const configWithoutServers = {
        ...mockClaudeCodeConfig,
        mcpServers: undefined,
      };

      const result = transformer.toStandard(configWithoutServers);
      expect(result.mcpServers).toEqual({});
    });

    it("should handle empty mcpServers", () => {
      const configWithEmptyServers = {
        ...mockClaudeCodeConfig,
        mcpServers: {},
      };

      const result = transformer.toStandard(configWithEmptyServers);
      expect(result.mcpServers).toEqual({});
    });
  });

  describe("fromStandard", () => {
    it("should preserve existing config when provided", () => {
      const standardConfig = {
        mcpServers: {
          hypertool: {
            type: "stdio" as const,
            command: "node",
            args: ["hypertool.js"],
          },
        },
      };

      const result = transformer.fromStandard(
        standardConfig,
        mockClaudeCodeConfig
      );

      // Should preserve all existing fields
      expect(result.numStartups).toBe(1);
      expect(result.installMethod).toBe("unknown");
      expect(result.autoUpdates).toBe(true);
      expect(result.tipsHistory).toEqual({ "ide-hotkey": 1 });
      expect(result.projects).toEqual(mockClaudeCodeConfig.projects);
      expect(result.userID).toBe("anonymized-user-id");
      expect(result.oauthAccount).toEqual(mockClaudeCodeConfig.oauthAccount);
      expect(result.isQualifiedForDataSharing).toBe(false);
      expect(result.shiftEnterKeyBindingInstalled).toBe(true);
      expect(result.hasCompletedOnboarding).toBe(true);
      expect(result.lastOnboardingVersion).toBe("1.0.61");
      expect(result.cachedChangelog).toBe(
        "# Changelog\n\n## Latest version..."
      );
      expect(result.changelogLastFetched).toBe(1234567890);
      expect(result.fallbackAvailableWarningThreshold).toBe(0.5);
      expect(result.subscriptionNoticeCount).toBe(0);
      expect(result.hasAvailableSubscription).toBe(false);
      expect(result.lastReleaseNotesSeen).toBe("1.0.61");

      // Should replace mcpServers with new ones
      expect(result.mcpServers).toEqual({
        hypertool: {
          type: "stdio",
          command: "node",
          args: ["hypertool.js"],
        },
      });
    });

    it("should create minimal config when no existing config provided", () => {
      const standardConfig = {
        mcpServers: {
          hypertool: {
            type: "stdio" as const,
            command: "node",
            args: ["hypertool.js"],
          },
        },
      };

      const result = transformer.fromStandard(standardConfig);

      // Should only have mcpServers
      expect(result).toEqual({
        mcpServers: {
          hypertool: {
            type: "stdio",
            command: "node",
            args: ["hypertool.js"],
          },
        },
      });
    });

    it("should handle empty mcpServers", () => {
      const standardConfig = {
        mcpServers: {},
      };

      const result = transformer.fromStandard(
        standardConfig,
        mockClaudeCodeConfig
      );

      // Should replace with empty mcpServers when new is empty
      expect(result.mcpServers).toEqual({});
      expect(result.numStartups).toBe(1);
      expect(result.oauthAccount).toEqual(mockClaudeCodeConfig.oauthAccount);
    });

    it("should handle undefined mcpServers", () => {
      const standardConfig = {
        mcpServers: undefined,
      };

      const result = transformer.fromStandard(
        standardConfig,
        mockClaudeCodeConfig
      );

      // Should replace with empty mcpServers when new is undefined
      expect(result.mcpServers).toEqual({});
      expect(result.numStartups).toBe(1);
    });
  });

  describe("validate", () => {
    it("should validate correct Claude Code config", () => {
      const result = transformer.validate(mockClaudeCodeConfig);

      expect(result.valid).toBe(true);
      expect(result.errors).toBeUndefined();
    });

    it("should validate config without mcpServers", () => {
      const configWithoutServers = {
        ...mockClaudeCodeConfig,
        mcpServers: undefined,
      };

      const result = transformer.validate(configWithoutServers);
      expect(result.valid).toBe(true);
      expect(result.errors).toBeUndefined();
    });

    it("should reject non-object config", () => {
      const result = transformer.validate(null);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Configuration must be an object");
    });

    it("should reject invalid mcpServers type", () => {
      const invalidConfig = {
        mcpServers: "not-an-object",
      };

      const result = transformer.validate(invalidConfig);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain("mcpServers must be an object");
    });

    it("should validate minimal config", () => {
      const minimalConfig = {
        mcpServers: {
          server1: {
            type: "stdio",
            command: "test",
          },
        },
      };

      const result = transformer.validate(minimalConfig);

      expect(result.valid).toBe(true);
      expect(result.errors).toBeUndefined();
    });
  });

  describe("Server replacement", () => {
    it("should replace servers with new mcpServers", () => {
      const existingConfig = {
        ...mockClaudeCodeConfig,
        mcpServers: {
          server1: { type: "stdio", command: "cmd1" },
          server2: { type: "stdio", command: "cmd2" },
          hypertool: { type: "stdio", command: "hypertool" },
        },
      };

      // To remove hypertool, we pass a config with only the servers we want to keep
      const standardConfig = {
        mcpServers: {
          server1: { type: "stdio", command: "cmd1" },
          server2: { type: "stdio", command: "cmd2" },
        },
      };

      const result = transformer.fromStandard(standardConfig, existingConfig);

      // Should replace with new servers only
      expect(result.mcpServers).toEqual({
        server1: { type: "stdio", command: "cmd1" },
        server2: { type: "stdio", command: "cmd2" },
      });
      // hypertool should be removed
      expect(result.mcpServers).not.toHaveProperty("hypertool");
    });
  });

  describe("Edge cases", () => {
    it("should handle deeply nested config preservation", () => {
      const complexConfig = {
        ...mockClaudeCodeConfig,
        deeplyNested: {
          level1: {
            level2: {
              level3: {
                value: "should-be-preserved",
              },
            },
          },
        },
      };

      const standardConfig = {
        mcpServers: {
          newServer: {
            type: "stdio" as const,
            command: "new",
          },
        },
      };

      const result = transformer.fromStandard(standardConfig, complexConfig);

      expect(result.deeplyNested.level1.level2.level3.value).toBe(
        "should-be-preserved"
      );
      // Should replace with new servers only
      expect(result.mcpServers).toEqual({
        newServer: {
          type: "stdio",
          command: "new",
        },
      });
    });

    it("should handle arrays in existing config", () => {
      const configWithArrays = {
        ...mockClaudeCodeConfig,
        someArray: [1, 2, 3, 4, 5],
        objectArray: [{ id: 1 }, { id: 2 }],
      };

      const standardConfig = {
        mcpServers: {
          newServer: {
            type: "stdio" as const,
            command: "new",
          },
        },
      };

      const result = transformer.fromStandard(standardConfig, configWithArrays);

      expect(result.someArray).toEqual([1, 2, 3, 4, 5]);
      expect(result.objectArray).toEqual([{ id: 1 }, { id: 2 }]);
    });
  });
});
