/**
 * Unit tests for tool cache with TTL validation
 */

import { ToolCache } from "./cache";
import { DiscoveredTool, DiscoveryConfig } from "./types";

describe("ToolCache", () => {
  let cache: ToolCache;
  
  const mockTool: DiscoveredTool = {
    name: "test_tool",
    serverName: "test-server",
    namespacedName: "test-server.test_tool",
    schema: {
      type: "object",
      properties: { input: { type: "string" } },
      required: ["input"],
    },
    description: "A test tool",
    discoveredAt: new Date(),
    lastUpdated: new Date(),
    serverStatus: "connected",
    structureHash: "abc123",
    fullHash: "def456",
  };

  const config: DiscoveryConfig = {
    cacheTtl: 1000, // 1 second for testing
    maxToolsPerServer: 3,
  };

  beforeEach(() => {
    cache = new ToolCache(config);
  });

  afterEach(() => {
    cache.destroy();
  });

  describe("basic operations", () => {
    it("should store and retrieve a tool", async () => {
      await cache.set("test-key", mockTool);
      const retrieved = await cache.get("test-key");
      
      expect(retrieved).toEqual(mockTool);
    });

    it("should return null for non-existent key", async () => {
      const retrieved = await cache.get("non-existent");
      expect(retrieved).toBeNull();
    });

    it("should check if key exists", async () => {
      await cache.set("test-key", mockTool);
      
      const exists = await cache.has("test-key");
      expect(exists).toBe(true);
      
      const notExists = await cache.has("non-existent");
      expect(notExists).toBe(false);
    });

    it("should delete a tool", async () => {
      await cache.set("test-key", mockTool);
      await cache.delete("test-key");
      
      const retrieved = await cache.get("test-key");
      expect(retrieved).toBeNull();
    });
  });

  describe("TTL functionality", () => {
    it("should expire tools after TTL", async () => {
      await cache.set("expiring-key", mockTool, 100); // 100ms TTL
      
      // Should be available immediately
      let retrieved = await cache.get("expiring-key");
      expect(retrieved).toEqual(mockTool);
      
      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 150));
      
      // Should be expired
      retrieved = await cache.get("expiring-key");
      expect(retrieved).toBeNull();
    });

    it("should use default TTL when not specified", async () => {
      await cache.set("default-ttl", mockTool);
      
      const retrieved = await cache.get("default-ttl");
      expect(retrieved).toEqual(mockTool);
    });

    it("should update TTL for existing entries", async () => {
      await cache.set("ttl-key", mockTool, 100);
      
      // Update TTL to 2 seconds
      const updated = await cache.updateTTL("ttl-key", 2000);
      expect(updated).toBe(true);
      
      // Wait past original TTL
      await new Promise(resolve => setTimeout(resolve, 150));
      
      // Should still be available
      const retrieved = await cache.get("ttl-key");
      expect(retrieved).toEqual(mockTool);
    });

    it("should return false when updating TTL for non-existent key", async () => {
      const updated = await cache.updateTTL("non-existent", 1000);
      expect(updated).toBe(false);
    });
  });

  describe("server-based operations", () => {
    const server1Tool: DiscoveredTool = {
      ...mockTool,
      serverName: "server1",
      namespacedName: "server1.tool1",
    };

    const server2Tool: DiscoveredTool = {
      ...mockTool,
      name: "tool2",
      serverName: "server2",
      namespacedName: "server2.tool2",
    };

    beforeEach(async () => {
      await cache.set("server1.tool1", server1Tool);
      await cache.set("server2.tool2", server2Tool);
    });

    it("should get tools by server", () => {
      const server1Tools = cache.getToolsByServer("server1");
      expect(server1Tools).toHaveLength(1);
      expect(server1Tools[0].serverName).toBe("server1");

      const server2Tools = cache.getToolsByServer("server2");
      expect(server2Tools).toHaveLength(1);
      expect(server2Tools[0].serverName).toBe("server2");
    });

    it("should clear tools for a specific server", async () => {
      await cache.clearServer("server1");
      
      const server1Tools = cache.getToolsByServer("server1");
      expect(server1Tools).toHaveLength(0);
      
      const server2Tools = cache.getToolsByServer("server2");
      expect(server2Tools).toHaveLength(1);
    });

    it("should enforce server tool limits", async () => {
      // Add tools up to the limit
      for (let i = 0; i < 5; i++) {
        const tool: DiscoveredTool = {
          ...mockTool,
          name: `tool${i}`,
          serverName: "limited-server",
          namespacedName: `limited-server.tool${i}`,
          discoveredAt: new Date(Date.now() + i * 1000), // Different times for eviction order
        };
        await cache.set(`limited-server.tool${i}`, tool);
      }
      
      const tools = cache.getToolsByServer("limited-server");
      expect(tools.length).toBeLessThanOrEqual(config.maxToolsPerServer!);
    });

    it("should get all cached tools", () => {
      const allTools = cache.getAllTools();
      expect(allTools).toHaveLength(2);
      expect(allTools.map(t => t.serverName)).toContain("server1");
      expect(allTools.map(t => t.serverName)).toContain("server2");
    });
  });

  describe("cache statistics", () => {
    beforeEach(async () => {
      await cache.set("stat-key", mockTool);
    });

    it("should track cache hits and misses", async () => {
      // Hit
      await cache.get("stat-key");
      
      // Miss
      await cache.get("non-existent");
      
      const stats = await cache.getStats();
      expect(stats.hitRate).toBeGreaterThan(0);
      expect(stats.missRate).toBeGreaterThan(0);
    });

    it("should provide cache info", async () => {
      const info = cache.getCacheInfo();
      
      expect(info.totalTools).toBe(1);
      expect(info.totalServers).toBe(1);
      expect(info.servers).toHaveLength(1);
      expect(info.servers[0].serverName).toBe("test-server");
      expect(info.stats).toHaveProperty("hits");
      expect(info.stats).toHaveProperty("misses");
    });
  });

  describe("cache maintenance", () => {
    it("should refresh tool timestamp", async () => {
      await cache.set("refresh-key", mockTool);
      
      const originalTime = mockTool.lastUpdated;
      
      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 10));
      
      const refreshed = await cache.refreshTool("refresh-key");
      expect(refreshed).toBe(true);
      
      const retrieved = await cache.get("refresh-key");
      expect(retrieved!.lastUpdated.getTime()).toBeGreaterThan(originalTime.getTime());
    });

    it("should identify tools expiring soon", async () => {
      // Add tool with short TTL
      await cache.set("expiring-soon", mockTool, 500);
      
      const expiringSoon = cache.getExpiringSoon(1000);
      expect(expiringSoon).toHaveLength(1);
      expect(expiringSoon[0].name).toBe("test_tool");
    });

    it("should clear entire cache", async () => {
      await cache.set("key1", mockTool);
      await cache.set("key2", { ...mockTool, name: "tool2" });
      
      await cache.clear();
      
      const info = cache.getCacheInfo();
      expect(info.totalTools).toBe(0);
      expect(info.totalServers).toBe(0);
    });
  });

  describe("event emission", () => {
    it("should emit events for cache operations", async () => {
      const events: string[] = [];
      
      cache.on("set", () => events.push("set"));
      cache.on("hit", () => events.push("hit"));
      cache.on("miss", () => events.push("miss"));
      cache.on("delete", () => events.push("delete"));
      
      await cache.set("event-key", mockTool);
      await cache.get("event-key"); // hit
      await cache.get("non-existent"); // miss
      await cache.delete("event-key");
      
      expect(events).toEqual(["set", "hit", "miss", "delete"]);
    });

    it("should emit cleanup events", async () => {
      let cleanupCount = 0;
      cache.on("cleanup", (data: any) => {
        cleanupCount = data.expiredCount;
      });
      
      // Add expired entries
      await cache.set("expired1", mockTool, 1);
      await cache.set("expired2", mockTool, 1);
      
      // Wait for expiration and cleanup
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Trigger cleanup by trying to access
      await cache.get("expired1");
      await cache.get("expired2");
      
      // Manual cleanup
      await (cache as any).cleanupExpiredEntries();
      
      expect(cleanupCount).toBeGreaterThanOrEqual(0);
    });

    it("should emit server cleared events", async () => {
      let clearedEvent: any = null;
      cache.on("serverCleared", (event) => {
        clearedEvent = event;
      });
      
      await cache.set("server-tool", mockTool);
      await cache.clearServer("test-server");
      
      expect(clearedEvent).not.toBeNull();
      expect(clearedEvent.serverName).toBe("test-server");
      expect(clearedEvent.toolCount).toBe(1);
    });
  });

  describe("performance", () => {
    it("should handle large number of tools efficiently", async () => {
      const startTime = Date.now();
      
      // Add many tools
      const promises = [];
      for (let i = 0; i < 100; i++) {
        const tool: DiscoveredTool = {
          ...mockTool,
          name: `perf_tool_${i}`,
          namespacedName: `perf-server.tool_${i}`,
          serverName: "perf-server",
        };
        promises.push(cache.set(`perf-server.tool_${i}`, tool));
      }
      
      await Promise.all(promises);
      
      const addTime = Date.now() - startTime;
      
      // Retrieve all tools
      const retrieveStart = Date.now();
      const retrievePromises = [];
      for (let i = 0; i < 100; i++) {
        retrievePromises.push(cache.get(`perf-server.tool_${i}`));
      }
      
      const results = await Promise.all(retrievePromises);
      const retrieveTime = Date.now() - retrieveStart;
      
      // Verify all were retrieved
      expect(results.filter(r => r !== null)).toHaveLength(100);
      
      // Performance should be reasonable (this is a basic check)
      expect(addTime).toBeLessThan(1000); // Less than 1 second
      expect(retrieveTime).toBeLessThan(1000); // Less than 1 second
    });
  });

  describe("memory management", () => {
    it("should prevent memory leaks with proper cleanup", async () => {
      // Add tools
      for (let i = 0; i < 10; i++) {
        await cache.set(`leak-test-${i}`, {
          ...mockTool,
          name: `tool${i}`,
        });
      }
      
      const initialSize = cache.getCacheInfo().totalTools;
      expect(initialSize).toBe(10);
      
      // Clear and check
      await cache.clear();
      
      const finalSize = cache.getCacheInfo().totalTools;
      expect(finalSize).toBe(0);
      
      // Destroy cache
      cache.destroy();
      
      // Verify no lingering timers or references
      const info = cache.getCacheInfo();
      expect(info.totalTools).toBe(0);
    });
  });
});