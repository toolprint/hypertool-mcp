/**
 * Tests for simplified toolset configuration generator
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
      name: "build",
      serverName: "git",
      namespacedName: "git.build",
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
      name: "analyze",
      serverName: "docker",
      namespacedName: "docker.analyze",
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
    it("should generate empty default configuration", () => {
      const config = generateDefaultToolsetConfig(mockTools);

      expect(config.name).toBe("empty-toolset");
      expect(config.description).toContain("Empty toolset");
      expect(config.description).toContain("3 available servers");
      expect(config.tools).toHaveLength(0); // Empty by design
      expect(config.version).toBe("1.0.0");
      expect(config.createdAt).toBeInstanceOf(Date);
    });

    it("should accept custom options", () => {
      const config = generateDefaultToolsetConfig(mockTools, {
        name: "custom-toolset",
        description: "Custom description",
      });

      expect(config.name).toBe("custom-toolset");
      expect(config.description).toBe("Custom description");
      expect(config.tools).toHaveLength(0); // Still empty - users must select explicitly
    });
  });

  describe("generateMinimalToolsetConfig", () => {
    it("should generate minimal configuration with limited tools per server", () => {
      const config = generateMinimalToolsetConfig(mockTools, {
        maxToolsPerServer: 2,
      });

      expect(config.name).toBe("Minimal Toolset");
      expect(config.tools.length).toBeGreaterThan(0);
      expect(config.tools.length).toBeLessThanOrEqual(6); // 2 tools per server * 3 servers

      // Check that tools have both namespacedName and refId
      config.tools.forEach((toolRef) => {
        expect(toolRef.namespacedName).toBeDefined();
        expect(toolRef.refId).toBeDefined();
      });
    });

    it("should respect maxToolsPerServer limit", () => {
      const config = generateMinimalToolsetConfig(mockTools, {
        maxToolsPerServer: 1,
      });

      // Should have at most 3 tools (1 per server)
      expect(config.tools.length).toBeLessThanOrEqual(3);
      
      // Check that we have unique servers represented
      const serverNames = config.tools.map(t => t.namespacedName?.split('.')[0]).filter(Boolean);
      const uniqueServers = new Set(serverNames);
      expect(uniqueServers.size).toBeLessThanOrEqual(3);
    });

    it("should include tools sorted by name for consistency", () => {
      const config = generateMinimalToolsetConfig(mockTools, {
        maxToolsPerServer: 1,
      });

      // Should pick alphabetically first tools (build, ps, search)
      const toolNames = config.tools.map(t => t.namespacedName?.split('.')[1]).filter(Boolean);
      expect(toolNames).toContain("build"); // git.build (first alphabetically for git)
    });

    it("should accept custom name", () => {
      const config = generateMinimalToolsetConfig(mockTools, {
        name: "My Minimal Tools",
      });

      expect(config.name).toBe("My Minimal Tools");
    });
  });

  describe("generateUseCaseToolsetConfig", () => {
    it("should generate development toolset", () => {
      const config = generateUseCaseToolsetConfig(mockTools, "development");

      expect(config.name).toBe("Development Tools");
      expect(config.description).toContain("development use case");

      // Should include build tools
      const hasBuildTool = config.tools.some(t => 
        t.namespacedName?.includes("build")
      );
      expect(hasBuildTool).toBe(true);
    });

    it("should generate administration toolset", () => {
      const config = generateUseCaseToolsetConfig(mockTools, "administration");

      expect(config.name).toBe("Administration Tools");
      expect(config.description).toContain("administration use case");

      // Should include status tools
      const hasStatusTool = config.tools.some(t => 
        t.namespacedName?.includes("status")
      );
      expect(hasStatusTool).toBe(true);
    });

    it("should generate analysis toolset", () => {
      const config = generateUseCaseToolsetConfig(mockTools, "analysis");

      expect(config.name).toBe("Analysis Tools");
      expect(config.description).toContain("analysis use case");

      // Should include analyze tools
      const hasAnalyzeTool = config.tools.some(t => 
        t.namespacedName?.includes("analyze")
      );
      expect(hasAnalyzeTool).toBe(true);
    });

    it("should accept custom name", () => {
      const config = generateUseCaseToolsetConfig(mockTools, "development", {
        name: "My Dev Tools",
      });

      expect(config.name).toBe("My Dev Tools");
    });

    it("should include relevant tools based on patterns", () => {
      const config = generateUseCaseToolsetConfig(mockTools, "development");
      
      // Development pattern includes "git", "build" - should match git tools and build tools
      expect(config.tools.length).toBeGreaterThan(0);
      
      // Should have tools with both identifiers
      config.tools.forEach((toolRef) => {
        expect(toolRef.namespacedName).toBeDefined();
        expect(toolRef.refId).toBeDefined();
      });
    });
  });

  describe("generateConflictAwareToolsetConfig", () => {
    it("should return empty toolset (simplified system)", () => {
      const config = generateConflictAwareToolsetConfig(mockTools);

      expect(config.name).toBe("empty-toolset");
      expect(config.tools).toHaveLength(0);
      // In simplified system, conflicts are handled by discovery engine, not generator
    });

    it("should accept custom name", () => {
      const config = generateConflictAwareToolsetConfig(mockTools, {
        name: "custom-conflict-aware",
      });

      expect(config.name).toBe("custom-conflict-aware");
      expect(config.tools).toHaveLength(0);
    });
  });

  describe("edge cases", () => {
    it("should handle empty tools array", () => {
      const config = generateDefaultToolsetConfig([]);

      expect(config.name).toBe("empty-toolset");
      expect(config.description).toContain("0 available servers");
      expect(config.tools).toHaveLength(0);
    });

    it("should handle tools with same name from different servers", () => {
      const conflictingTools = mockTools.filter(t => 
        t.namespacedName === "git.status" || t.namespacedName === "docker.status"
      );
      
      const config = generateMinimalToolsetConfig(conflictingTools, {
        maxToolsPerServer: 1,
      });

      // Should include both status tools (from different servers)
      expect(config.tools.length).toBe(2);
      expect(config.tools.map(t => t.namespacedName)).toContain("git.status");
      expect(config.tools.map(t => t.namespacedName)).toContain("docker.status");
    });
  });
});