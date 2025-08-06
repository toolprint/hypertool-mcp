/**
 * Integration tests for Claude Code setup flow
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { vol } from "memfs";
import { join } from "path";
import { ConfigurationManager } from "../config-manager/index.js";

// Mock the environment to ensure test mode
vi.mock("../config/environment.js", async () => {
  const actual = await vi.importActual("../config/environment.js");
  return {
    ...actual,
    isTestMode: () => true,
    isNedbEnabled: () => false,
  };
});

describe("Claude Code Integration", () => {
  let configManager: ConfigurationManager;
  const testBasePath = "./test-integration-config";
  const homeDir = "./home/testuser";
  const claudeConfigPath = join(homeDir, ".claude.json");

  // Complete Claude Code config representing a real user's setup
  const realWorldClaudeConfig = {
    numStartups: 42,
    installMethod: "homebrew",
    autoUpdates: true,
    tipsHistory: {
      "ide-hotkey": 3,
      search: 2,
      "file-mention": 5,
      "drag-drop": 1,
    },
    mcpServers: {
      "github-mcp": {
        type: "stdio",
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-github"],
        env: {
          GITHUB_TOKEN: "placeholder",
        },
      },
      "filesystem-mcp": {
        type: "stdio",
        command: "npx",
        args: [
          "-y",
          "@modelcontextprotocol/server-filesystem",
          "/path/to/allowed/directory",
        ],
      },
    },
    projects: {
      "/home/testuser/projects/web-app": {
        allowedTools: ["bash", "read", "write", "edit"],
        history: [
          {
            display: "Implement user authentication",
            pastedContents: {},
          },
          {
            display: "Fix TypeScript errors in components",
            pastedContents: {
              "1": {
                id: 1,
                type: "text",
                content: "Error details...",
              },
            },
          },
        ],
        mcpContextUris: ["file:///home/testuser/projects/web-app/README.md"],
        mcpServers: {},
        enabledMcpjsonServers: ["local-server"],
        disabledMcpjsonServers: [],
        hasTrustDialogAccepted: true,
        projectOnboardingSeenCount: 5,
        hasClaudeMdExternalIncludesApproved: true,
        hasClaudeMdExternalIncludesWarningShown: true,
        lastTotalWebSearchRequests: 25,
        exampleFiles: [
          "src/index.ts",
          "src/App.tsx",
          "src/components/Auth.tsx",
          "package.json",
          "tsconfig.json",
        ],
        exampleFilesGeneratedAt: 1700000000000,
        ignorePatterns: ["node_modules/**", "dist/**", ".git/**"],
        hasCompletedProjectOnboarding: true,
      },
      "/home/testuser/projects/cli-tool": {
        allowedTools: ["bash", "read", "write"],
        history: [],
        mcpContextUris: [],
        mcpServers: {},
        enabledMcpjsonServers: [],
        disabledMcpjsonServers: [],
        hasTrustDialogAccepted: false,
        projectOnboardingSeenCount: 1,
        hasClaudeMdExternalIncludesApproved: false,
        hasClaudeMdExternalIncludesWarningShown: false,
        lastTotalWebSearchRequests: 0,
        exampleFiles: ["main.py", "setup.py", "README.md"],
        exampleFilesGeneratedAt: 1700000000000,
      },
    },
    userID: "hashed-user-id-12345",
    firstStartTime: "2024-06-15T10:30:00.000Z",
    oauthAccount: {
      accountUuid: "acc-uuid-12345",
      emailAddress: "developer@example.com",
      organizationUuid: "org-uuid-12345",
      organizationRole: "admin",
      workspaceRole: null,
      organizationName: "Example Corp",
    },
    isQualifiedForDataSharing: false,
    shiftEnterKeyBindingInstalled: true,
    hasCompletedOnboarding: true,
    lastOnboardingVersion: "1.0.61",
    cachedChangelog: "# Changelog\n\n## 1.0.61\n\n- Latest features...",
    changelogLastFetched: 1700000000000,
    fallbackAvailableWarningThreshold: 0.5,
    subscriptionNoticeCount: 0,
    hasAvailableSubscription: true,
    lastReleaseNotesSeen: "1.0.61",
  };

  beforeEach(async () => {
    // Reset memfs
    vol.reset();

    // Create test instance
    configManager = new ConfigurationManager(testBasePath);

    // Initialize directory structure
    await configManager.initialize();

    // Create test registry
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
        },
      }),
      "utf-8"
    );

    // Setup mocks
    vi.spyOn(configManager["registry"], "resolvePath").mockImplementation(
      (path) => {
        if (path === "~/.claude.json") {
          return claudeConfigPath;
        }
        return path;
      }
    );

    vi.spyOn(
      configManager["registry"],
      "isApplicationInstalled"
    ).mockResolvedValue(true);

    // Create home directory
    await vol.promises.mkdir(homeDir, { recursive: true });
  });

  afterEach(() => {
    vol.reset();
    vi.clearAllMocks();
  });

  describe("Full Setup Flow", () => {
    it("should complete full setup preserving all Claude Code settings", async () => {
      // 1. User has existing Claude Code config
      await vol.promises.writeFile(
        claudeConfigPath,
        JSON.stringify(realWorldClaudeConfig, null, 2),
        "utf-8"
      );

      // 2. Import servers from Claude Code
      const importResult = await configManager.discoverAndImport();

      expect(importResult.imported).toContain("claude-code");
      expect(importResult.importedDetails).toContainEqual({
        appId: "claude-code",
        configPath: claudeConfigPath,
      });

      // 3. Link HyperTool to Claude Code
      const linkResult = await configManager.linkApplications([
        {
          appId: "claude-code",
          configType: "global",
        },
      ]);

      expect(linkResult.linked).toContain("claude-code");

      // 4. Verify Claude Code config is preserved
      const finalConfig = JSON.parse(
        (await vol.promises.readFile(claudeConfigPath, "utf-8")).toString()
      );

      // All user data should be preserved
      expect(finalConfig.numStartups).toBe(42);
      expect(finalConfig.installMethod).toBe("homebrew");
      expect(finalConfig.autoUpdates).toBe(true);
      expect(finalConfig.tipsHistory).toEqual({
        "ide-hotkey": 3,
        search: 2,
        "file-mention": 5,
        "drag-drop": 1,
      });

      // Projects should be completely intact
      expect(finalConfig.projects).toEqual(realWorldClaudeConfig.projects);

      // User account info should be preserved
      expect(finalConfig.userID).toBe("hashed-user-id-12345");
      expect(finalConfig.oauthAccount).toEqual(
        realWorldClaudeConfig.oauthAccount
      );

      // All other settings preserved
      expect(finalConfig.firstStartTime).toBe("2024-06-15T10:30:00.000Z");
      expect(finalConfig.isQualifiedForDataSharing).toBe(false);
      expect(finalConfig.shiftEnterKeyBindingInstalled).toBe(true);
      expect(finalConfig.hasCompletedOnboarding).toBe(true);
      expect(finalConfig.lastOnboardingVersion).toBe("1.0.61");
      expect(finalConfig.cachedChangelog).toContain("# Changelog");
      expect(finalConfig.changelogLastFetched).toBe(1700000000000);
      expect(finalConfig.fallbackAvailableWarningThreshold).toBe(0.5);
      expect(finalConfig.subscriptionNoticeCount).toBe(0);
      expect(finalConfig.hasAvailableSubscription).toBe(true);
      expect(finalConfig.lastReleaseNotesSeen).toBe("1.0.61");

      // Only mcpServers should be updated - should have all original servers plus hypertool
      expect(finalConfig.mcpServers).toHaveProperty("hypertool");
      expect(finalConfig.mcpServers.hypertool.type).toBe("stdio");
      expect(finalConfig.mcpServers).toHaveProperty("github-mcp");
      expect(finalConfig.mcpServers).toHaveProperty("filesystem-mcp");
    });
  });

  describe("Unlink and Restore Flow", () => {
    it("should unlink and restore Claude Code config correctly", async () => {
      // Setup initial config
      await vol.promises.writeFile(
        claudeConfigPath,
        JSON.stringify(realWorldClaudeConfig, null, 2),
        "utf-8"
      );

      // Create backup BEFORE any operations to capture original state
      const backupResult = await configManager.createBackup();
      const backupId = backupResult.backupId!;

      // Import servers (this doesn't modify Claude Code config)
      await configManager.discoverAndImport();

      // Now link hypertool
      await configManager.linkApplications([
        {
          appId: "claude-code",
          configType: "global",
        },
      ]);

      // Verify hypertool was added
      const linkedConfig = JSON.parse(
        (await vol.promises.readFile(claudeConfigPath, "utf-8")).toString()
      );
      expect(linkedConfig.mcpServers).toHaveProperty("hypertool");
      // Original servers should still be there too
      expect(linkedConfig.mcpServers).toHaveProperty("github-mcp");
      expect(linkedConfig.mcpServers).toHaveProperty("filesystem-mcp");

      // Unlink with restore
      const unlinkResult = await configManager.unlinkApplications(
        ["claude-code"],
        {
          restore: true,
          backupId,
        }
      );

      expect(unlinkResult.unlinked).toContain("claude-code");

      // Verify original config is restored exactly as it was
      const restoredConfig = JSON.parse(
        (await vol.promises.readFile(claudeConfigPath, "utf-8")).toString()
      );

      // Should match the original config exactly
      expect(restoredConfig).toEqual(realWorldClaudeConfig);

      // Specific checks
      expect(restoredConfig.mcpServers).toHaveProperty("github-mcp");
      expect(restoredConfig.mcpServers).toHaveProperty("filesystem-mcp");
      expect(restoredConfig.mcpServers).not.toHaveProperty("hypertool");

      // All other data preserved
      expect(restoredConfig.projects).toEqual(realWorldClaudeConfig.projects);
      expect(restoredConfig.oauthAccount).toEqual(
        realWorldClaudeConfig.oauthAccount
      );
      expect(restoredConfig.numStartups).toBe(42);
    });

    it("should handle unlink without restore", async () => {
      // Setup config with hypertool
      const configWithHypertool = {
        ...realWorldClaudeConfig,
        mcpServers: {
          ...realWorldClaudeConfig.mcpServers,
          hypertool: {
            type: "stdio",
            command: "node",
            args: ["hypertool.js"],
          },
        },
      };

      await vol.promises.writeFile(
        claudeConfigPath,
        JSON.stringify(configWithHypertool, null, 2),
        "utf-8"
      );

      // Unlink without restore
      const unlinkResult = await configManager.unlinkApplications([
        "claude-code",
      ]);

      expect(unlinkResult.unlinked).toContain("claude-code");

      // Verify only hypertool removed
      const finalConfig = JSON.parse(
        (await vol.promises.readFile(claudeConfigPath, "utf-8")).toString()
      );

      expect(finalConfig.mcpServers).not.toHaveProperty("hypertool");
      expect(finalConfig.mcpServers).toHaveProperty("github-mcp");
      expect(finalConfig.mcpServers).toHaveProperty("filesystem-mcp");

      // Everything else preserved
      expect(finalConfig.projects).toEqual(realWorldClaudeConfig.projects);
      expect(finalConfig.numStartups).toBe(42);
    });
  });

  describe("Error Scenarios", () => {
    it("should recover from corrupted Claude Code config", async () => {
      // Write corrupted JSON
      await vol.promises.writeFile(
        claudeConfigPath,
        '{ "numStartups": 5, "mcpServers": { broken json',
        "utf-8"
      );

      // Should still be able to link
      const linkResult = await configManager.linkApplications([
        {
          appId: "claude-code",
          configType: "global",
        },
      ]);

      expect(linkResult.linked).toContain("claude-code");

      // Should create valid minimal config
      const newConfig = JSON.parse(
        (await vol.promises.readFile(claudeConfigPath, "utf-8")).toString()
      );

      expect(newConfig.mcpServers).toHaveProperty("hypertool");
    });

    it("should handle missing Claude Code installation", async () => {
      // Mock Claude Code as not installed
      vi.spyOn(
        configManager["registry"],
        "isApplicationInstalled"
      ).mockResolvedValue(false);

      const importResult = await configManager.discoverAndImport();

      expect(importResult.imported).not.toContain("claude-code");

      // Should not create any Claude Code config
      await expect(vol.promises.access(claudeConfigPath)).rejects.toThrow();
    });

    it("should handle permission errors gracefully", async () => {
      // Create read-only config
      await vol.promises.writeFile(
        claudeConfigPath,
        JSON.stringify(realWorldClaudeConfig, null, 2),
        "utf-8"
      );

      // Mock write failure
      const originalWriteFile = vol.promises.writeFile;
      vol.promises.writeFile = vi
        .fn()
        .mockRejectedValue(new Error("EACCES: Permission denied"));

      const linkResult = await configManager.linkApplications([
        {
          appId: "claude-code",
          configType: "global",
        },
      ]);

      expect(linkResult.failed).toContain("claude-code");

      // Restore mock
      vol.promises.writeFile = originalWriteFile;
    });
  });

  describe("Development Mode", () => {
    it("should use local development binary when in dev mode", async () => {
      // Mock being in development directory
      const packageJsonPath = join(process.cwd(), "package.json");
      const binPath = join(process.cwd(), "dist", "bin.js");

      await vol.promises.mkdir(join(process.cwd(), "dist"), {
        recursive: true,
      });
      await vol.promises.writeFile(
        packageJsonPath,
        JSON.stringify({
          name: "@toolprint/hypertool-mcp",
          version: "1.0.0",
        }),
        "utf-8"
      );
      await vol.promises.writeFile(binPath, "// bin.js", "utf-8");

      // Create Claude Code config
      await vol.promises.writeFile(
        claudeConfigPath,
        JSON.stringify(realWorldClaudeConfig, null, 2),
        "utf-8"
      );

      // Link in dev mode
      await configManager.linkApplications([
        {
          appId: "claude-code",
          configType: "global",
        },
      ]);

      const config = JSON.parse(
        (await vol.promises.readFile(claudeConfigPath, "utf-8")).toString()
      );

      // Should use local binary
      expect(config.mcpServers.hypertool.command).toBe("node");
      expect(config.mcpServers.hypertool.args[0]).toContain("/dist/bin.js");
      expect(config.mcpServers.hypertool.args).toContain("--debug");
    });

    it("should use NPM package when not in dev mode", async () => {
      // Create Claude Code config
      await vol.promises.writeFile(
        claudeConfigPath,
        JSON.stringify(realWorldClaudeConfig, null, 2),
        "utf-8"
      );

      // Link in production mode
      await configManager.linkApplications([
        {
          appId: "claude-code",
          configType: "global",
        },
      ]);

      const config = JSON.parse(
        (await vol.promises.readFile(claudeConfigPath, "utf-8")).toString()
      );

      // Should use npx
      expect(config.mcpServers.hypertool.command).toBe("npx");
      expect(config.mcpServers.hypertool.args).toContain("-y");
      expect(config.mcpServers.hypertool.args).toContain(
        "@toolprint/hypertool-mcp@latest"
      );
    });
  });
});
