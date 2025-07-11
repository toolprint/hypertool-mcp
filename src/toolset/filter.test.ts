/**
 * Tests for toolset filtering and resolution logic
 */

import {
  applyToolsetConfig,
  getAvailableToolsForConfig,
  previewToolsetConfig,
} from "./filter";
import { DiscoveredTool } from "../discovery/types";
import { ToolsetConfig } from "./types";

describe("ToolsetFilter", () => {
  const mockTools: DiscoveredTool[] = [
    {
      name: "status",
      serverName: "git",
      namespacedName: "git.status",
      schema: { type: "object" } as const,
      description: "Show git status",
      discoveredAt: new Date(),
      lastUpdated: new Date(),
      serverStatus: "connected",
      structureHash: "hash1",
      fullHash: "full1",
    },
    {
      name: "log",
      serverName: "git",
      namespacedName: "git.log",
      schema: { type: "object" } as const,
      description: "Show git log",
      discoveredAt: new Date(),
      lastUpdated: new Date(),
      serverStatus: "connected",
      structureHash: "hash2",
      fullHash: "full2",
    },
    {
      name: "ps",
      serverName: "docker",
      namespacedName: "docker.ps",
      schema: { type: "object" } as const,
      description: "List containers",
      discoveredAt: new Date(),
      lastUpdated: new Date(),
      serverStatus: "connected",
      structureHash: "hash3",
      fullHash: "full3",
    },
    {
      name: "status",
      serverName: "docker",
      namespacedName: "docker.status",
      schema: { type: "object" } as const,
      description: "Show docker status",
      discoveredAt: new Date(),
      lastUpdated: new Date(),
      serverStatus: "connected",
      structureHash: "hash4",
      fullHash: "full4",
    },
  ];

  describe("applyToolsetConfig", () => {
    it("should apply basic configuration", async () => {
      const config: ToolsetConfig = {
        name: "Basic Config",
        servers: [
          {
            serverName: "git",
            tools: { includeAll: true },
            enabled: true,
          },
        ],
      };

      const result = await applyToolsetConfig(mockTools, config);

      expect(result.success).toBe(true);
      expect(result.tools).toHaveLength(2);
      expect(result.tools.map((t) => t.originalName)).toEqual([
        "status",
        "log",
      ]);
      expect(result.tools.every((t) => t.serverName === "git")).toBe(true);
    });

    it("should apply include patterns", async () => {
      const config: ToolsetConfig = {
        name: "Pattern Config",
        servers: [
          {
            serverName: "git",
            tools: { include: ["status"] },
            enabled: true,
          },
        ],
      };

      const result = await applyToolsetConfig(mockTools, config);

      expect(result.tools).toHaveLength(1);
      expect(result.tools[0].originalName).toBe("status");
    });

    it("should apply regex patterns", async () => {
      const config: ToolsetConfig = {
        name: "Regex Config",
        servers: [
          {
            serverName: "docker",
            tools: { includePattern: "^ps$" },
            enabled: true,
          },
        ],
      };

      const result = await applyToolsetConfig(mockTools, config);

      expect(result.tools).toHaveLength(1);
      expect(result.tools[0].originalName).toBe("ps");
    });

    it("should handle exclusions", async () => {
      const config: ToolsetConfig = {
        name: "Exclusion Config",
        servers: [
          {
            serverName: "git",
            tools: {
              includeAll: true,
              exclude: ["log"],
            },
            enabled: true,
          },
        ],
      };

      const result = await applyToolsetConfig(mockTools, config);

      expect(result.tools).toHaveLength(1);
      expect(result.tools[0].originalName).toBe("status");
    });

    it("should handle namespacing", async () => {
      const config: ToolsetConfig = {
        name: "Namespace Config",
        servers: [
          {
            serverName: "git",
            tools: { includeAll: true },
            enabled: true,
            enableNamespacing: true,
          },
        ],
      };

      const result = await applyToolsetConfig(mockTools, config);

      expect(result.tools.every((t) => t.isNamespaced)).toBe(true);
      expect(result.tools[0].resolvedName).toBe("git.status");
      expect(result.tools[0].namespace).toBe("git");
    });

    it("should handle custom namespaces", async () => {
      const config: ToolsetConfig = {
        name: "Custom Namespace Config",
        servers: [
          {
            serverName: "git",
            tools: { includeAll: true },
            enabled: true,
            enableNamespacing: true,
            customNamespace: "vcs",
          },
        ],
      };

      const result = await applyToolsetConfig(mockTools, config);

      expect(result.tools[0].resolvedName).toBe("vcs.status");
      expect(result.tools[0].namespace).toBe("vcs");
    });

    it("should detect and resolve name conflicts", async () => {
      const config: ToolsetConfig = {
        name: "Conflict Config",
        servers: [
          {
            serverName: "git",
            tools: { include: ["status"] },
            enabled: true,
            enableNamespacing: false,
          },
          {
            serverName: "docker",
            tools: { include: ["status"] },
            enabled: true,
            enableNamespacing: false,
          },
        ],
        options: {
          autoResolveConflicts: true,
          conflictResolution: "namespace",
        },
      };

      const result = await applyToolsetConfig(mockTools, config);

      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts![0].toolName).toBe("status");
      expect(result.conflicts![0].resolution).toBe("namespaced");
      expect(result.tools).toHaveLength(2);
      expect(result.tools.map((t) => t.resolvedName)).toEqual([
        "git.status",
        "docker.status",
      ]);
    });

    it("should handle disabled servers", async () => {
      const config: ToolsetConfig = {
        name: "Disabled Config",
        servers: [
          {
            serverName: "git",
            tools: { includeAll: true },
            enabled: false,
          },
        ],
      };

      const result = await applyToolsetConfig(mockTools, config);

      expect(result.tools).toHaveLength(0);
    });

    it("should warn about missing servers", async () => {
      const config: ToolsetConfig = {
        name: "Missing Server Config",
        servers: [
          {
            serverName: "nonexistent",
            tools: { includeAll: true },
            enabled: true,
          },
        ],
      };

      const result = await applyToolsetConfig(mockTools, config);

      expect(result.warnings).toContain(
        'Server "nonexistent" not found in discovered tools'
      );
    });

    it("should generate statistics", async () => {
      const config: ToolsetConfig = {
        name: "Stats Config",
        servers: [
          {
            serverName: "git",
            tools: { include: ["status"] },
            enabled: true,
          },
        ],
      };

      const result = await applyToolsetConfig(mockTools, config);

      expect(result.stats).toBeDefined();
      expect(result.stats!.totalDiscovered).toBe(4);
      expect(result.stats!.totalIncluded).toBe(1);
      expect(result.stats!.totalExcluded).toBe(3);
      expect(result.stats!.toolsByServer).toEqual({ git: 1 });
    });
  });

  describe("getAvailableToolsForConfig", () => {
    it("should identify available and unavailable servers", () => {
      const config: ToolsetConfig = {
        name: "Test",
        servers: [
          { serverName: "git", tools: { includeAll: true } },
          { serverName: "missing", tools: { includeAll: true } },
        ],
      };

      const result = getAvailableToolsForConfig(config, mockTools);

      expect(result.availableServers).toEqual(["git"]);
      expect(result.unavailableServers).toEqual(["missing"]);
      expect(result.serverToolCounts).toEqual({ git: 2, missing: 0 });
    });
  });

  describe("previewToolsetConfig", () => {
    it("should preview configuration without applying", () => {
      const config: ToolsetConfig = {
        name: "Preview Test",
        servers: [
          {
            serverName: "git",
            tools: { include: ["status"] },
            enabled: true,
          },
          {
            serverName: "docker",
            tools: { includeAll: true },
            enabled: false,
          },
        ],
      };

      const result = previewToolsetConfig(config, mockTools);

      expect(result.preview).toHaveLength(2);

      const gitPreview = result.preview[0];
      expect(gitPreview.serverName).toBe("git");
      expect(gitPreview.enabled).toBe(true);
      expect(gitPreview.matchedTools).toEqual(["status"]);
      expect(gitPreview.excludedTools).toEqual(["log"]);

      const dockerPreview = result.preview[1];
      expect(dockerPreview.serverName).toBe("docker");
      expect(dockerPreview.enabled).toBe(false);
      expect(dockerPreview.matchedTools).toEqual([]);
      expect(dockerPreview.excludedTools).toEqual(["ps", "status"]);

      expect(result.summary.totalServers).toBe(2);
      expect(result.summary.enabledServers).toBe(1);
      expect(result.summary.totalToolsMatched).toBe(1);
      expect(result.summary.totalToolsExcluded).toBe(3);
    });
  });
});
