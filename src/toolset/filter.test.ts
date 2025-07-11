/**
 * Tests for simplified toolset filtering (legacy compatibility)
 */

import {
  applyToolsetConfig,
  getAvailableToolsForConfig,
  previewToolsetConfig,
} from "./filter";
import { DiscoveredTool } from "../discovery/types";
import { ToolsetConfig } from "./types";

describe("ToolsetFilter (Legacy Compatibility)", () => {
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
  ];

  describe("applyToolsetConfig", () => {
    it("should return legacy warning and redirect to ToolsetManager", async () => {
      const config: ToolsetConfig = {
        name: "test-toolset",
        tools: [
          { namespacedName: "git.status", refId: "hash1" }
        ],
        version: "1.0.0",
        createdAt: new Date(),
      };

      // Mock console.warn to capture warning
      const consoleSpy = jest.spyOn(console, "warn").mockImplementation();

      const result = await applyToolsetConfig(mockTools, config);

      expect(result.success).toBe(false);
      expect(result.errors).toContain("Use ToolsetManager.applyConfig() instead of legacy applyToolsetConfig");
      expect(result.tools).toHaveLength(0);
      expect(consoleSpy).toHaveBeenCalledWith("applyToolsetConfig is legacy. Use ToolsetManager.applyConfig() instead.");

      consoleSpy.mockRestore();
    });

    it("should handle any config format gracefully", async () => {
      const legacyConfig = {} as ToolsetConfig;

      const result = await applyToolsetConfig(mockTools, legacyConfig);

      expect(result.success).toBe(false);
      expect(result.tools).toHaveLength(0);
    });
  });

  describe("getAvailableToolsForConfig", () => {
    it("should return empty array and warning for legacy usage", () => {
      const config: ToolsetConfig = {
        name: "test-toolset",
        tools: [
          { namespacedName: "git.status" }
        ],
        version: "1.0.0",
        createdAt: new Date(),
      };

      const consoleSpy = jest.spyOn(console, "warn").mockImplementation();

      const result = getAvailableToolsForConfig(mockTools, config);

      expect(result).toHaveLength(0);
      expect(consoleSpy).toHaveBeenCalledWith("getAvailableToolsForConfig is legacy. Use ToolsetManager instead.");

      consoleSpy.mockRestore();
    });

    it("should handle empty inputs", () => {
      const result = getAvailableToolsForConfig([], {} as ToolsetConfig);
      expect(result).toHaveLength(0);
    });
  });

  describe("previewToolsetConfig", () => {
    it("should return legacy warning and redirect to ToolsetManager", async () => {
      const config: ToolsetConfig = {
        name: "test-toolset",
        tools: [
          { namespacedName: "git.status" }
        ],
        version: "1.0.0",
        createdAt: new Date(),
      };

      const consoleSpy = jest.spyOn(console, "warn").mockImplementation();

      const result = await previewToolsetConfig(mockTools, config);

      expect(result.success).toBe(false);
      expect(result.errors).toContain("Use ToolsetManager instead of legacy preview functions");
      expect(result.tools).toHaveLength(0);
      expect(consoleSpy).toHaveBeenCalledWith("previewToolsetConfig is legacy. Use ToolsetManager instead.");

      consoleSpy.mockRestore();
    });

    it("should handle any config format gracefully", async () => {
      const config = null as any;

      const result = await previewToolsetConfig(mockTools, config);

      expect(result.success).toBe(false);
      expect(result.tools).toHaveLength(0);
    });
  });

  describe("backwards compatibility", () => {
    it("should maintain function signatures", () => {
      // Just verify the functions exist and can be called
      expect(typeof applyToolsetConfig).toBe("function");
      expect(typeof getAvailableToolsForConfig).toBe("function");
      expect(typeof previewToolsetConfig).toBe("function");
    });

    it("should handle various input types without throwing", async () => {
      // Test with various invalid inputs to ensure robustness
      await expect(applyToolsetConfig([], null as any)).resolves.toBeDefined();
      expect(getAvailableToolsForConfig([], undefined as any)).toBeDefined();
      await expect(previewToolsetConfig([], {} as any)).resolves.toBeDefined();
    });
  });
});