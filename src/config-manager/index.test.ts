/**
 * Tests for ConfigurationManager with focus on Claude Code integration
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { vol } from "memfs";
import { join } from "path";
import { ConfigurationManager } from "./index.js";
import { TransformerRegistry } from "./transformers/base.js";

// Mock the environment to ensure test mode
vi.mock("../config/environment.js", async () => {
  const actual = await vi.importActual("../config/environment.js");
  return {
    ...actual,
    isTestMode: () => true,
    isNedbEnabled: () => false,
  };
});

describe("ConfigurationManager", () => {
  let configManager: ConfigurationManager;
  const testBasePath = "./test-config";

  beforeEach(async () => {
    // Reset memfs
    vol.reset();

    // Create test instance
    configManager = new ConfigurationManager(testBasePath);

    // Initialize directory structure
    await configManager.initialize();

    // Create test registry file
    const registryPath = join(testBasePath, "apps", "registry.json");
    await vol.promises.writeFile(
      registryPath,
      JSON.stringify({
        version: "1.0.0",
        applications: {
          "claude-code": {
            name: "Claude Code",
            enabled: true,
            platforms: {
              all: {
                configPath: "~/.claude.json",
                format: "custom",
                transformer: "claude-code",
              },
            },
            detection: {
              type: "file",
              path: "~/.claude.json",
            },
          },
          cursor: {
            name: "Cursor IDE",
            enabled: true,
            platforms: {
              all: {
                configPath: "~/.cursor/mcp.json",
                format: "standard",
              },
            },
            detection: {
              type: "directory",
              path: "~/.cursor",
            },
          },
        },
      }),
      "utf-8"
    );
  });

  afterEach(() => {
    vol.reset();
  });

  describe("linkApplication with Claude Code", () => {
    // Mock existing Claude Code config
    const mockExistingClaudeConfig = {
      numStartups: 5,
      installMethod: "brew",
      autoUpdates: true,
      tipsHistory: { "ide-hotkey": 2, "search": 1 },
      mcpServers: {
        "existing-server": {
          type: "stdio",
          command: "node",
          args: ["/path/to/existing.js"],
        },
      },
      projects: {
        "/test/project": {
          allowedTools: ["bash", "read"],
          history: [
            {
              display: "test command",
              pastedContents: {},
            },
          ],
          mcpContextUris: [],
          mcpServers: {},
          enabledMcpjsonServers: [],
          disabledMcpjsonServers: [],
          hasTrustDialogAccepted: true,
          projectOnboardingSeenCount: 3,
          hasClaudeMdExternalIncludesApproved: true,
          hasClaudeMdExternalIncludesWarningShown: true,
          lastTotalWebSearchRequests: 10,
          exampleFiles: ["main.js", "test.js"],
          exampleFilesGeneratedAt: 1234567890,
        },
      },
      userID: "test-user-id",
      firstStartTime: "2024-01-01T00:00:00.000Z",
      oauthAccount: {
        accountUuid: "test-account-uuid",
        emailAddress: "test@example.com",
        organizationUuid: "test-org-uuid",
        organizationRole: "member",
        workspaceRole: null,
        organizationName: "Test Org",
      },
      isQualifiedForDataSharing: true,
      shiftEnterKeyBindingInstalled: true,
      hasCompletedOnboarding: true,
      lastOnboardingVersion: "1.0.60",
      cachedChangelog: "# Test Changelog",
      changelogLastFetched: 1234567890,
      fallbackAvailableWarningThreshold: 0.5,
      subscriptionNoticeCount: 2,
      hasAvailableSubscription: true,
      lastReleaseNotesSeen: "1.0.60",
    };

    beforeEach(async () => {
      // Mock home directory resolution
      vi.spyOn(configManager["registry"], "resolvePath").mockImplementation(
        (path) => {
          if (path === "~/.claude.json") {
            return "./home/user/.claude.json";
          }
          if (path === "~/.cursor/mcp.json") {
            return "./home/user/.cursor/mcp.json";
          }
          return path;
        }
      );

      // Mock app installation detection
      vi.spyOn(
        configManager["registry"],
        "isApplicationInstalled"
      ).mockResolvedValue(true);

      // Create Claude Code config file
      await vol.promises.mkdir("./home/user", { recursive: true });
      await vol.promises.writeFile(
        "./home/user/.claude.json",
        JSON.stringify(mockExistingClaudeConfig, null, 2),
        "utf-8"
      );

      // Create hypertool config
      await vol.promises.writeFile(
        join(testBasePath, "mcp.json"),
        JSON.stringify({
          mcpServers: {
            "test-server": {
              type: "stdio",
              command: "test",
              args: ["arg1"],
            },
          },
        }),
        "utf-8"
      );
    });

    it("should use claude-code transformer when format is custom", async () => {
      const getTransformerSpy = vi.spyOn(TransformerRegistry, "getTransformer");

      await configManager.linkApplications([
        {
          appId: "claude-code",
          configType: "global",
        },
      ]);

      // Should be called with "claude-code" not "custom"
      expect(getTransformerSpy).toHaveBeenCalledWith("claude-code");
    });

    it("should preserve existing Claude Code configuration", async () => {
      await configManager.linkApplications([
        {
          appId: "claude-code",
          configType: "global",
        },
      ]);

      // Read the updated config
      const updatedContent = await vol.promises.readFile(
        "./home/user/.claude.json",
        "utf-8"
      );
      const updatedConfig = JSON.parse(updatedContent.toString());

      // Should preserve all existing fields
      expect(updatedConfig.numStartups).toBe(5);
      expect(updatedConfig.installMethod).toBe("brew");
      expect(updatedConfig.autoUpdates).toBe(true);
      expect(updatedConfig.tipsHistory).toEqual({ "ide-hotkey": 2, search: 1 });
      expect(updatedConfig.projects).toEqual(mockExistingClaudeConfig.projects);
      expect(updatedConfig.userID).toBe("test-user-id");
      expect(updatedConfig.oauthAccount).toEqual(
        mockExistingClaudeConfig.oauthAccount
      );
      expect(updatedConfig.isQualifiedForDataSharing).toBe(true);
      expect(updatedConfig.shiftEnterKeyBindingInstalled).toBe(true);
      expect(updatedConfig.hasCompletedOnboarding).toBe(true);
      expect(updatedConfig.lastOnboardingVersion).toBe("1.0.60");
      expect(updatedConfig.cachedChangelog).toBe("# Test Changelog");
      expect(updatedConfig.changelogLastFetched).toBe(1234567890);
      expect(updatedConfig.fallbackAvailableWarningThreshold).toBe(0.5);
      expect(updatedConfig.subscriptionNoticeCount).toBe(2);
      expect(updatedConfig.hasAvailableSubscription).toBe(true);
      expect(updatedConfig.lastReleaseNotesSeen).toBe("1.0.60");

      // Should only update mcpServers
      expect(updatedConfig.mcpServers).toHaveProperty("hypertool");
      expect(updatedConfig.mcpServers.hypertool.type).toBe("stdio");
      // In test mode, we use npx since we're not in dev mode
      expect(updatedConfig.mcpServers.hypertool.command).toBe("npx");
    });

    it("should handle missing Claude Code config file", async () => {
      // Remove the config file
      await vol.promises.unlink("./home/user/.claude.json");

      await configManager.linkApplications([
        {
          appId: "claude-code",
          configType: "global",
        },
      ]);

      // Should create new config with only mcpServers
      const content = await vol.promises.readFile(
        "./home/user/.claude.json",
        "utf-8"
      );
      const config = JSON.parse(content.toString());

      expect(config).toEqual({
        mcpServers: {
          hypertool: expect.objectContaining({
            type: "stdio",
            command: expect.any(String),
          }),
        },
      });
    });

    it("should use standard transformer for non-custom formats", async () => {
      const getTransformerSpy = vi.spyOn(TransformerRegistry, "getTransformer");

      // Create cursor directory
      await vol.promises.mkdir("/home/user/.cursor", { recursive: true });

      await configManager.linkApplications([
        {
          appId: "cursor",
          configType: "global",
        },
      ]);

      // Should be called with "standard"
      expect(getTransformerSpy).toHaveBeenCalledWith("standard");
    });
  });

  describe("unlinkApplications", () => {
    beforeEach(async () => {
      // Mock home directory resolution
      vi.spyOn(configManager["registry"], "resolvePath").mockImplementation(
        (path) => {
          if (path === "~/.claude.json") {
            return "./home/user/.claude.json";
          }
          return path;
        }
      );

      // Create Claude Code config with hypertool and other servers
      await vol.promises.mkdir("./home/user", { recursive: true });
      await vol.promises.writeFile(
        "./home/user/.claude.json",
        JSON.stringify({
          numStartups: 1,
          mcpServers: {
            hypertool: {
              type: "stdio",
              command: "node",
              args: ["hypertool.js"],
            },
            "other-server": {
              type: "stdio",
              command: "node",
              args: ["other.js"],
            },
          },
          userID: "test-user",
        }),
        "utf-8"
      );
    });

    it("should remove only hypertool from Claude Code config", async () => {
      const result = await configManager.unlinkApplications(["claude-code"]);

      expect(result.unlinked).toContain("claude-code");

      // Read updated config
      const content = await vol.promises.readFile(
        "./home/user/.claude.json",
        "utf-8"
      );
      const config = JSON.parse(content.toString());

      // Should preserve other fields
      expect(config.numStartups).toBe(1);
      expect(config.userID).toBe("test-user");

      // Should remove hypertool but keep other servers
      expect(config.mcpServers).not.toHaveProperty("hypertool");
      expect(config.mcpServers).toHaveProperty("other-server");
      expect(config.mcpServers["other-server"]).toEqual({
        type: "stdio",
        command: "node",
        args: ["other.js"],
      });
    });

    it("should handle restore from backup", async () => {
      // Create a backup first
      const backupResult = await configManager.createBackup();
      const backupId = backupResult.backupId!;
      
      expect(backupResult.success).toBe(true);

      // Modify the config to simulate linking hypertool
      await vol.promises.writeFile(
        "./home/user/.claude.json",
        JSON.stringify({
          numStartups: 1,
          mcpServers: {
            hypertool: {
              type: "stdio",
              command: "modified",
            },
            "other-server": {
              type: "stdio",
              command: "node",
              args: ["other.js"],
            },
          },
          userID: "test-user",
        }),
        "utf-8"
      );

      // Unlink with restore
      const result = await configManager.unlinkApplications(["claude-code"], {
        restore: true,
        backupId,
      });

      expect(result.unlinked).toContain("claude-code");
      
      // Log for debugging
      if (result.restoredWithHypertool) {
        console.log("Restored with hypertool:", result.restoredWithHypertool);
      }

      // Should restore original config without hypertool
      const content = await vol.promises.readFile(
        "./home/user/.claude.json",
        "utf-8"
      );
      const config = JSON.parse(content.toString());

      // Should have original values preserved
      expect(config.numStartups).toBe(1);
      expect(config.userID).toBe("test-user");
      // Should still have other-server but not hypertool
      expect(config.mcpServers).toHaveProperty("other-server");
      expect(config.mcpServers).not.toHaveProperty("hypertool");
    });
  });

  describe("importFromApplication with Claude Code", () => {
    beforeEach(async () => {
      // Mock home directory resolution
      vi.spyOn(configManager["registry"], "resolvePath").mockImplementation(
        (path) => {
          if (path === "~/.claude.json") {
            return "./home/user/.claude.json";
          }
          return path;
        }
      );

      // Mock app installation detection
      vi.spyOn(
        configManager["registry"],
        "isApplicationInstalled"
      ).mockResolvedValue(true);

      // Create Claude Code config
      await vol.promises.mkdir("./home/user", { recursive: true });
      await vol.promises.writeFile(
        "./home/user/.claude.json",
        JSON.stringify({
          numStartups: 1,
          mcpServers: {
            server1: {
              type: "stdio",
              command: "cmd1",
            },
            server2: {
              type: "sse",
              url: "https://example.com/sse",
            },
          },
          projects: {},
          userID: "test-user",
        }),
        "utf-8"
      );
    });

    it("should import servers from Claude Code", async () => {
      const result = await configManager.discoverAndImport();

      expect(result.imported).toContain("claude-code");

      // Check merged config
      const mergedContent = await vol.promises.readFile(
        join(testBasePath, "mcp.json"),
        "utf-8"
      );
      const mergedConfig = JSON.parse(mergedContent.toString());

      expect(mergedConfig.mcpServers).toHaveProperty("server1");
      expect(mergedConfig.mcpServers).toHaveProperty("server2");
      expect(mergedConfig.mcpServers.server1).toEqual({
        type: "stdio",
        command: "cmd1",
      });
      expect(mergedConfig.mcpServers.server2).toEqual({
        type: "sse",
        url: "https://example.com/sse",
      });
    });
  });

  describe("Error handling", () => {
    it("should handle invalid JSON in Claude Code config", async () => {
      vi.spyOn(configManager["registry"], "resolvePath").mockImplementation(
        (path) => {
          if (path === "~/.claude.json") {
            return "./home/user/.claude.json";
          }
          return path;
        }
      );

      vi.spyOn(
        configManager["registry"],
        "isApplicationInstalled"
      ).mockResolvedValue(true);

      // Create invalid JSON
      await vol.promises.mkdir("./home/user", { recursive: true });
      await vol.promises.writeFile(
        "./home/user/.claude.json",
        "{ invalid json",
        "utf-8"
      );

      const result = await configManager.linkApplications([
        {
          appId: "claude-code",
          configType: "global",
        },
      ]);

      // Should still succeed but create minimal config
      expect(result.linked).toContain("claude-code");

      const content = await vol.promises.readFile(
        "./home/user/.claude.json",
        "utf-8"
      );
      const config = JSON.parse(content.toString());

      // Should have created new minimal config
      expect(config.mcpServers).toHaveProperty("hypertool");
    });

    it("should handle missing transformer", async () => {
      // Register an app with non-existent transformer
      const registryPath = join(testBasePath, "apps", "registry.json");
      const registry = JSON.parse(
        (await vol.promises.readFile(registryPath, "utf-8")).toString()
      );

      registry.applications["test-app"] = {
        name: "Test App",
        enabled: true,
        platforms: {
          all: {
            configPath: "~/.test/config.json",
            format: "custom",
            transformer: "non-existent",
          },
        },
        detection: {
          type: "file",
          path: "~/.test/config.json",
        },
      };

      await vol.promises.writeFile(
        registryPath,
        JSON.stringify(registry),
        "utf-8"
      );

      // Reinitialize ConfigurationManager to reload registry
      configManager = new ConfigurationManager(testBasePath);
      await configManager.initialize();

      vi.spyOn(configManager["registry"], "resolvePath").mockImplementation(
        (path) => {
          if (path === "~/.test/config.json") {
            return "./home/user/.test/config.json";
          }
          return path;
        }
      );

      vi.spyOn(
        configManager["registry"],
        "isApplicationInstalled"
      ).mockResolvedValue(true);

      await vol.promises.mkdir("./home/user/.test", { recursive: true });

      const result = await configManager.linkApplications([
        {
          appId: "test-app",
          configType: "global",
        },
      ]);

      // Should use standard transformer as fallback
      expect(result.linked).toContain("test-app");
    });
  });
});