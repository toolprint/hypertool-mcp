/**
 * Tests for toolset configuration generator
 */

import {
  generateDefaultToolsetConfig,
  generateMinimalToolsetConfig,
  generateUseCaseToolsetConfig,
  generateConflictAwareToolsetConfig,
} from "./generator";
import { DiscoveredTool } from "../discovery/types";

describe("ToolsetGenerator", () => {
  const mockTools: DiscoveredTool[] = [
    {
      name: "status",
      serverName: "git",
      namespacedName: "git.status",
      schema: { type: "object" },
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
      schema: { type: "object" },
      discoveredAt: new Date(),
      lastUpdated: new Date(),
      serverStatus: "connected",
      structureHash: "hash2",
      fullHash: "full2",
    },
    {
      name: "debug-internal",
      serverName: "git",
      namespacedName: "git.debug-internal",
      schema: { type: "object" },
      discoveredAt: new Date(),
      lastUpdated: new Date(),
      serverStatus: "connected",
      structureHash: "hash3",
      fullHash: "full3",
    },
    {
      name: "ps",
      serverName: "docker",
      namespacedName: "docker.ps",
      schema: { type: "object" },
      discoveredAt: new Date(),
      lastUpdated: new Date(),
      serverStatus: "connected",
      structureHash: "hash4",
      fullHash: "full4",
    },
    {
      name: "build",
      serverName: "docker",
      namespacedName: "docker.build",
      schema: { type: "object" },
      discoveredAt: new Date(),
      lastUpdated: new Date(),
      serverStatus: "connected",
      structureHash: "hash5",
      fullHash: "full5",
    },
    {
      name: "test-runner",
      serverName: "docker",
      namespacedName: "docker.test-runner",
      schema: { type: "object" },
      discoveredAt: new Date(),
      lastUpdated: new Date(),
      serverStatus: "connected",
      structureHash: "hash6",
      fullHash: "full6",
    },
    {
      name: "status",
      serverName: "docker",
      namespacedName: "docker.status",
      schema: { type: "object" },
      discoveredAt: new Date(),
      lastUpdated: new Date(),
      serverStatus: "connected",
      structureHash: "hash7",
      fullHash: "full7",
    },
    {
      name: "search",
      serverName: "context7",
      namespacedName: "context7.search",
      schema: { type: "object" },
      discoveredAt: new Date(),
      lastUpdated: new Date(),
      serverStatus: "connected",
      structureHash: "hash8",
      fullHash: "full8",
    },
  ];

  describe("generateDefaultToolsetConfig", () => {
    it("should generate basic default configuration", () => {
      const config = generateDefaultToolsetConfig(mockTools);

      expect(config.name).toBe("Auto-generated Toolset");
      expect(config.description).toContain("3 servers");
      expect(config.servers).toHaveLength(3);

      const gitServer = config.servers.find((s) => s.serverName === "git");
      expect(gitServer).toBeDefined();
      expect(gitServer!.tools.includeAll).toBe(true);
      expect(gitServer!.enabled).toBe(true);
      expect(gitServer!.enableNamespacing).toBe(true);
    });

    it("should exclude internal tools", () => {
      const config = generateDefaultToolsetConfig(mockTools);

      const gitServer = config.servers.find((s) => s.serverName === "git");
      expect(gitServer!.tools.exclude).toContain("debug-internal");

      const dockerServer = config.servers.find(
        (s) => s.serverName === "docker"
      );
      expect(dockerServer!.tools.exclude).toContain("test-runner");
    });

    it("should accept custom options", () => {
      const config = generateDefaultToolsetConfig(mockTools, {
        name: "Custom Name",
        description: "Custom description",
        enableNamespacing: false,
        conflictResolution: "prefix-server",
      });

      expect(config.name).toBe("Custom Name");
      expect(config.description).toBe("Custom description");
      expect(config.servers.every((s) => s.enableNamespacing === false)).toBe(
        true
      );
      expect(config.options!.conflictResolution).toBe("prefix-server");
    });
  });

  describe("generateMinimalToolsetConfig", () => {
    it("should generate minimal configuration", () => {
      const config = generateMinimalToolsetConfig(mockTools, {
        maxToolsPerServer: 2,
      });

      expect(config.name).toBe("Minimal Toolset");
      expect(config.servers).toHaveLength(3);

      // Check that each server has at most 2 tools
      config.servers.forEach((server) => {
        expect(server.tools.include!.length).toBeLessThanOrEqual(2);
      });
    });

    it("should prioritize common tools", () => {
      const config = generateMinimalToolsetConfig(mockTools, {
        maxToolsPerServer: 1,
        priorityPatterns: ["^status$"],
      });

      const gitServer = config.servers.find((s) => s.serverName === "git");
      const dockerServer = config.servers.find(
        (s) => s.serverName === "docker"
      );

      expect(gitServer!.tools.include).toContain("status");
      expect(dockerServer!.tools.include).toContain("status");
    });

    it("should handle servers with no priority tools", () => {
      const config = generateMinimalToolsetConfig(mockTools, {
        maxToolsPerServer: 1,
        priorityPatterns: ["^nonexistent"],
      });

      // Should still include one tool per server alphabetically
      config.servers.forEach((server) => {
        expect(server.tools.include!.length).toBe(1);
      });
    });
  });

  describe("generateUseCaseToolsetConfig", () => {
    it("should generate development toolset", () => {
      const config = generateUseCaseToolsetConfig(mockTools, "development");

      expect(config.name).toBe("Development Toolset");
      expect(config.description).toContain("development");

      const gitServer = config.servers.find((s) => s.serverName === "git");
      expect(gitServer).toBeDefined();
      expect(gitServer!.tools.includeAll).toBe(true);
      expect(gitServer!.tools.exclude).toEqual(["git-gc", "git-fsck"]);
    });

    it("should generate deployment toolset", () => {
      const config = generateUseCaseToolsetConfig(mockTools, "deployment");

      expect(config.name).toBe("Deployment Toolset");

      const gitServer = config.servers.find((s) => s.serverName === "git");
      expect(gitServer!.tools.include).toEqual([
        "git-push",
        "git-tag",
        "git-status",
      ]);

      const dockerServer = config.servers.find(
        (s) => s.serverName === "docker"
      );
      expect(dockerServer!.tools.includePattern).toContain("build");
    });

    it("should generate monitoring toolset", () => {
      const config = generateUseCaseToolsetConfig(mockTools, "monitoring");

      expect(config.name).toBe("Monitoring Toolset");

      const dockerServer = config.servers.find(
        (s) => s.serverName === "docker"
      );
      expect(dockerServer!.tools.include).toEqual([
        "docker-ps",
        "docker-logs",
        "docker-stats",
      ]);
    });

    it("should generate documentation toolset", () => {
      const config = generateUseCaseToolsetConfig(mockTools, "documentation");

      expect(config.name).toBe("Documentation Toolset");

      // Should have wildcard pattern for help/documentation tools
      config.servers.forEach((server) => {
        expect(server.tools.includePattern).toBeDefined();
      });
    });

    it("should accept custom name", () => {
      const config = generateUseCaseToolsetConfig(mockTools, "development", {
        name: "My Dev Tools",
      });

      expect(config.name).toBe("My Dev Tools");
    });
  });

  describe("generateConflictAwareToolsetConfig", () => {
    it("should detect and handle conflicts", () => {
      const config = generateConflictAwareToolsetConfig(mockTools);

      expect(config.name).toBe("Conflict-Aware Toolset");
      expect(config.description).toContain("conflicts detected");

      // Should enable namespacing for servers with conflicts
      const serversWithConflicts = config.servers.filter(
        (s) => s.enableNamespacing === true
      );
      expect(serversWithConflicts.length).toBeGreaterThan(0);
      expect(config.options!.autoResolveConflicts).toBe(true);
      expect(config.options!.conflictResolution).toBe("namespace");
    });

    it("should exclude conflicting tools if there are many", () => {
      // Create more conflicts
      const conflictTools: DiscoveredTool[] = [
        ...mockTools,
        ...Array.from({ length: 10 }, (_, i) => ({
          name: `conflict-tool-${i}`,
          serverName: "git",
          namespacedName: `git.conflict-tool-${i}`,
          schema: { type: "object" } as const,
          discoveredAt: new Date(),
          lastUpdated: new Date(),
          serverStatus: "connected" as const,
          structureHash: `hash-conflict-${i}`,
          fullHash: `full-conflict-${i}`,
        })),
        ...Array.from({ length: 10 }, (_, i) => ({
          name: `conflict-tool-${i}`,
          serverName: "docker",
          namespacedName: `docker.conflict-tool-${i}`,
          schema: { type: "object" } as const,
          discoveredAt: new Date(),
          lastUpdated: new Date(),
          serverStatus: "connected" as const,
          structureHash: `hash-conflict-docker-${i}`,
          fullHash: `full-conflict-docker-${i}`,
        })),
      ];

      const config = generateConflictAwareToolsetConfig(conflictTools);

      // Should exclude many conflicting tools
      config.servers.forEach((server) => {
        if (server.tools.exclude && server.tools.exclude.length > 5) {
          expect(server.tools.exclude.length).toBeGreaterThan(5);
        }
      });
    });

    it("should use custom namespaces for heavily conflicted servers", () => {
      // Create many conflicts
      const heavyConflictTools: DiscoveredTool[] = [
        ...mockTools,
        ...Array.from({ length: 5 }, (_, i) => ({
          name: `shared-${i}`,
          serverName: "git",
          namespacedName: `git.shared-${i}`,
          schema: { type: "object" } as const,
          discoveredAt: new Date(),
          lastUpdated: new Date(),
          serverStatus: "connected" as const,
          structureHash: `hash-git-${i}`,
          fullHash: `full-git-${i}`,
        })),
        ...Array.from({ length: 5 }, (_, i) => ({
          name: `shared-${i}`,
          serverName: "docker",
          namespacedName: `docker.shared-${i}`,
          schema: { type: "object" } as const,
          discoveredAt: new Date(),
          lastUpdated: new Date(),
          serverStatus: "connected" as const,
          structureHash: `hash-docker-${i}`,
          fullHash: `full-docker-${i}`,
        })),
      ];

      const config = generateConflictAwareToolsetConfig(heavyConflictTools);

      // Should have custom namespaces for heavily conflicted servers
      config.servers.forEach((server) => {
        if (server.customNamespace) {
          expect(server.customNamespace).toBe(server.serverName);
        }
      });
    });

    it("should accept custom name", () => {
      const config = generateConflictAwareToolsetConfig(mockTools, {
        name: "Custom Conflict Handler",
      });

      expect(config.name).toBe("Custom Conflict Handler");
    });
  });
});
