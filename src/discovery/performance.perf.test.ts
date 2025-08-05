/**
 * Performance tests for large tool sets
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { MCPToolDefinition, DiscoveredTool } from "./types.js";
import { ToolCache } from "./cache.js";
import { ToolLookupManager } from "./lookup.js";
import { ToolHashUtils } from "./hashUtils.js";
import { createChildLogger } from "../utils/logging.js";

const logger = createChildLogger({ module: "discovery/performance.test" });

// Performance thresholds for tests
const PERFORMANCE_THRESHOLDS = {
  CACHE_ACCESS_TIME_MS: 100,
  LOOKUP_TIME_MS: 50,
  SEARCH_TIME_MS: 200,
  HASH_CALCULATION_TIME_MS: 100,
  MEMORY_USAGE_MB: 100,
};

describe("Tool Discovery Performance Tests", () => {
  const generateMockTools = (
    count: number,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _serverName: string = "perf-server"
  ): MCPToolDefinition[] => {
    return Array.from({ length: count }, (_, i) => ({
      name: `tool_${i}`,
      description: `Performance test tool ${i} with some description that might be longer to simulate real tools`,
      inputSchema: {
        type: "object",
        properties: {
          input: { type: "string" },
          count: { type: "number" },
          [`optional_param_${i % 10}`]: { type: "string" },
          array_param: {
            type: "array",
            items: { type: "string" },
          },
        },
        required: ["input", "count"],
      },
    }));
  };

  const generateDiscoveredTools = (
    count: number,
    serverName: string = "perf-server"
  ): DiscoveredTool[] => {
    const mcpTools = generateMockTools(count, serverName);
    return mcpTools.map((tool) =>
      ToolHashUtils.createHashedTool(
        tool,
        serverName,
        `${serverName}.${tool.name}`
      )
    );
  };

  describe("Tool Cache Performance", () => {
    let cache: ToolCache;

    beforeEach(() => {
      cache = new ToolCache({ cacheTtl: 300000 }); // 5 minutes
    });

    afterEach(() => {
      cache.destroy();
    });

    it("should handle 1000 tools efficiently", async () => {
      const toolCount = 1000;
      const tools = generateDiscoveredTools(toolCount);

      // Measure insertion time
      const insertStart = performance.now();
      const insertPromises = tools.map((tool) =>
        cache.set(tool.namespacedName, tool)
      );
      await Promise.all(insertPromises);
      const insertTime = performance.now() - insertStart;

      logger.info(
        `Cache insertion time for ${toolCount} tools: ${insertTime.toFixed(2)}ms`
      );
      expect(insertTime).toBeLessThan(
        (PERFORMANCE_THRESHOLDS.CACHE_ACCESS_TIME_MS * toolCount) / 100
      );

      // Measure retrieval time
      const retrieveStart = performance.now();
      const retrievePromises = tools.map((tool) =>
        cache.get(tool.namespacedName)
      );
      const results = await Promise.all(retrievePromises);
      const retrieveTime = performance.now() - retrieveStart;

      logger.info(
        `Cache retrieval time for ${toolCount} tools: ${retrieveTime.toFixed(2)}ms`
      );
      expect(retrieveTime).toBeLessThan(
        (PERFORMANCE_THRESHOLDS.CACHE_ACCESS_TIME_MS * toolCount) / 100
      );

      // Verify all tools were retrieved
      expect(results.filter((r) => r !== null)).toHaveLength(toolCount);

      // Test cache statistics performance
      const statsStart = performance.now();
      const stats = await cache.getStats();
      const statsTime = performance.now() - statsStart;

      logger.info(`Cache stats time: ${statsTime.toFixed(2)}ms`);
      expect(statsTime).toBeLessThan(10); // Should be very fast
      expect(stats.size).toBe(toolCount);
    });

    it("should handle concurrent access efficiently", async () => {
      const toolCount = 500;
      const tools = generateDiscoveredTools(toolCount);

      // Concurrent insertions and retrievals
      const concurrentStart = performance.now();

      const insertPromises = tools
        .slice(0, toolCount / 2)
        .map((tool) => cache.set(tool.namespacedName, tool));

      const retrievePromises = tools
        .slice(toolCount / 2)
        .map((tool) => cache.get(tool.namespacedName));

      await Promise.all([...insertPromises, ...retrievePromises]);
      const concurrentTime = performance.now() - concurrentStart;

      logger.info(`Concurrent operations time: ${concurrentTime.toFixed(2)}ms`);
      expect(concurrentTime).toBeLessThan(
        PERFORMANCE_THRESHOLDS.CACHE_ACCESS_TIME_MS * 10
      );
    });

    it("should handle server-based operations efficiently", async () => {
      const serversCount = 10;
      const toolsPerServer = 100;

      // Add tools for multiple servers
      const insertStart = performance.now();
      for (let s = 0; s < serversCount; s++) {
        const serverTools = generateDiscoveredTools(
          toolsPerServer,
          `server_${s}`
        );
        const insertPromises = serverTools.map((tool) =>
          cache.set(tool.namespacedName, tool)
        );
        await Promise.all(insertPromises);
      }
      const insertTime = performance.now() - insertStart;

      logger.info(`Multi-server insertion time: ${insertTime.toFixed(2)}ms`);

      // Test server-specific retrieval
      const retrievalStart = performance.now();
      for (let s = 0; s < serversCount; s++) {
        const serverTools = cache.getToolsByServer(`server_${s}`);
        expect(serverTools).toHaveLength(toolsPerServer);
      }
      const retrievalTime = performance.now() - retrievalStart;

      logger.info(`Multi-server retrieval time: ${retrievalTime.toFixed(2)}ms`);
      expect(retrievalTime).toBeLessThan(100); // Should be very fast

      // Test server clearing
      const clearStart = performance.now();
      await cache.clearServer("server_0");
      const clearTime = performance.now() - clearStart;

      logger.info(`Server clear time: ${clearTime.toFixed(2)}ms`);
      expect(clearTime).toBeLessThan(50);
    });
  });

  describe("Lookup Manager Performance", () => {
    let lookupManager: ToolLookupManager;

    beforeEach(() => {
      lookupManager = new ToolLookupManager();
    });

    it("should handle 1000 tools efficiently", () => {
      const toolCount = 1000;
      const tools = generateDiscoveredTools(toolCount);

      // Measure insertion time
      const insertStart = performance.now();
      tools.forEach((tool) => lookupManager.addTool(tool));
      const insertTime = performance.now() - insertStart;

      logger.info(
        `Lookup insertion time for ${toolCount} tools: ${insertTime.toFixed(2)}ms`
      );
      expect(insertTime).toBeLessThan(
        PERFORMANCE_THRESHOLDS.CACHE_ACCESS_TIME_MS * 2
      );

      // Measure search performance
      const searchStart = performance.now();
      const searchResults = lookupManager.search({
        name: "tool_1",
        fuzzy: true,
        limit: 50,
      });
      const searchTime = performance.now() - searchStart;

      logger.info(
        `Search time in ${toolCount} tools: ${searchTime.toFixed(2)}ms`
      );
      expect(searchTime).toBeLessThan(PERFORMANCE_THRESHOLDS.SEARCH_TIME_MS);
      expect(searchResults.length).toBeGreaterThan(0);

      // Measure exact lookup performance
      const exactStart = performance.now();
      for (let i = 0; i < 100; i++) {
        const tool = lookupManager.getByNamespacedName(`perf-server.tool_${i}`);
        expect(tool).toBeDefined();
      }
      const exactTime = performance.now() - exactStart;

      logger.info(`100 exact lookups time: ${exactTime.toFixed(2)}ms`);
      expect(exactTime).toBeLessThan(10); // Should be very fast
    });

    it("should handle complex search queries efficiently", () => {
      const toolCount = 1000;
      const tools = generateDiscoveredTools(toolCount);
      tools.forEach((tool) => lookupManager.addTool(tool));

      // Test various search scenarios
      const searchScenarios = [
        { name: "tool_", fuzzy: true },
        { keywords: ["performance", "test"] },
        { server: "perf-server" },
        { name: "tool_1.*", fuzzy: true },
      ];

      for (const scenario of searchScenarios) {
        const searchStart = performance.now();
        const results = lookupManager.search(scenario);
        const searchTime = performance.now() - searchStart;

        logger.info(
          `Search scenario ${JSON.stringify(scenario)}: ${searchTime.toFixed(2)}ms, ${results.length} results`
        );
        expect(searchTime).toBeLessThan(PERFORMANCE_THRESHOLDS.SEARCH_TIME_MS);
      }
    });

    it("should handle statistics calculation efficiently", () => {
      const toolCount = 1000;
      const tools = generateDiscoveredTools(toolCount);
      tools.forEach((tool) => lookupManager.addTool(tool));

      const statsStart = performance.now();
      const stats = lookupManager.getStats();
      const statsTime = performance.now() - statsStart;

      logger.info(`Lookup stats calculation time: ${statsTime.toFixed(2)}ms`);
      expect(statsTime).toBeLessThan(10); // Should be very fast
      expect(stats.totalTools).toBe(toolCount);
    });
  });

  describe("Hash Calculation Performance", () => {
    it("should calculate hashes efficiently for large tool sets", () => {
      const toolCount = 1000;
      const tools = generateDiscoveredTools(toolCount);

      // Test tool hash calculation
      const toolHashStart = performance.now();
      const toolHashes = tools.map((tool) =>
        ToolHashUtils.calculateToolHash(tool)
      );
      const toolHashTime = performance.now() - toolHashStart;

      logger.info(
        `Tool hash calculation for ${toolCount} tools: ${toolHashTime.toFixed(2)}ms`
      );
      expect(toolHashTime).toBeLessThan(
        PERFORMANCE_THRESHOLDS.HASH_CALCULATION_TIME_MS
      );
      expect(toolHashes).toHaveLength(toolCount);

      // Test server tools hash
      const serverHashStart = performance.now();
      const serverHash = ToolHashUtils.calculateServerToolsHash(tools);
      const serverHashTime = performance.now() - serverHashStart;

      logger.info(
        `Server tools hash calculation: ${serverHashTime.toFixed(2)}ms`
      );
      expect(serverHashTime).toBeLessThan(100); // Should be fast
      expect(serverHash).toBeDefined();
    });

    it("should detect changes efficiently in large tool sets", () => {
      const toolCount = 500;
      const originalTools = generateDiscoveredTools(toolCount);

      // Simple test - just add new tools
      const newTools = generateDiscoveredTools(10, "new-server");
      const finalTools = [...originalTools, ...newTools];

      const changeDetectionStart = performance.now();
      const changes = ToolHashUtils.detectToolChanges(
        originalTools,
        finalTools
      );
      const changeDetectionTime = performance.now() - changeDetectionStart;

      logger.info(
        `Change detection time for ${toolCount} tools: ${changeDetectionTime.toFixed(2)}ms`
      );
      expect(changeDetectionTime).toBeLessThan(
        PERFORMANCE_THRESHOLDS.HASH_CALCULATION_TIME_MS
      );

      const summary = ToolHashUtils.summarizeChanges(changes);
      expect(summary.added).toBe(10); // New tools
      expect(summary.unchanged).toBe(toolCount); // Original tools
    });
  });

  describe("Memory Usage", () => {
    it("should maintain reasonable memory usage with large tool sets", async () => {
      if (typeof process === "undefined" || !process.memoryUsage) {
        logger.info("Memory usage test skipped (not in Node.js environment)");
        return;
      }

      const initialMemory = process.memoryUsage().heapUsed;

      const toolCount = 1000;
      const tools = generateDiscoveredTools(toolCount);

      // Create multiple components with tools
      const cache = new ToolCache({ cacheTtl: 300000 });
      const lookupManager = new ToolLookupManager();

      // Add tools to both
      const setupPromises = tools.map(async (tool) => {
        await cache.set(tool.namespacedName, tool);
        lookupManager.addTool(tool);
      });

      return Promise.all(setupPromises).then(() => {
        const finalMemory = process.memoryUsage().heapUsed;
        const memoryIncrease = (finalMemory - initialMemory) / (1024 * 1024); // MB

        logger.info(
          `Memory increase for ${toolCount} tools: ${memoryIncrease.toFixed(2)}MB`
        );

        // This is a rough check - memory usage can vary significantly
        expect(memoryIncrease).toBeLessThan(
          PERFORMANCE_THRESHOLDS.MEMORY_USAGE_MB
        );

        // Cleanup
        cache.destroy();
        lookupManager.clear();

        // Force garbage collection if available
        if (global.gc) {
          global.gc();
        }
      });
    });
  });

  describe("Stress Testing", () => {
    it("should handle rapid tool updates", async () => {
      const cache = new ToolCache({ cacheTtl: 60000 });
      const lookupManager = new ToolLookupManager();

      const iterations = 100;
      const toolsPerIteration = 50;

      const stressStart = performance.now();

      for (let i = 0; i < iterations; i++) {
        const tools = generateDiscoveredTools(
          toolsPerIteration,
          `stress-server-${i}`
        );

        // Add tools
        const addPromises = tools.map(async (tool) => {
          await cache.set(tool.namespacedName, tool);
          lookupManager.addTool(tool);
        });
        await Promise.all(addPromises);

        // Search tools
        const searchResults = lookupManager.search({
          name: "tool_",
          fuzzy: true,
          limit: 10,
        });
        expect(searchResults.length).toBeGreaterThan(0);

        // Clear some servers to simulate turnover
        if (i > 10 && i % 10 === 0) {
          const serverToClear = `stress-server-${i - 10}`;
          await cache.clearServer(serverToClear);
          lookupManager.clearServer(serverToClear);
        }
      }

      const stressTime = performance.now() - stressStart;
      logger.info(`Stress test completed in: ${stressTime.toFixed(2)}ms`);

      // Should complete in reasonable time
      expect(stressTime).toBeLessThan(30000); // 30 seconds

      // Cleanup
      cache.destroy();
      lookupManager.clear();
    });

    it("should handle concurrent operations under load", async () => {
      const cache = new ToolCache({ cacheTtl: 60000 });
      const lookupManager = new ToolLookupManager();

      const concurrentOperations = 50;
      const toolsPerOperation = 20;

      const concurrentStart = performance.now();

      // Create many concurrent operations
      const operationPromises = Array.from(
        { length: concurrentOperations },
        async (_, i) => {
          const tools = generateDiscoveredTools(
            toolsPerOperation,
            `concurrent-server-${i}`
          );

          // Mix of operations
          const operations = tools.map(async (tool, j) => {
            if (j % 3 === 0) {
              // Set operation
              await cache.set(tool.namespacedName, tool);
              lookupManager.addTool(tool);
            } else if (j % 3 === 1) {
              // Get operation
              await cache.get(tool.namespacedName);
              lookupManager.getByNamespacedName(tool.namespacedName);
            } else {
              // Search operation
              lookupManager.search({
                name: tool.name.substring(0, 5),
                fuzzy: true,
              });
            }
          });

          return Promise.all(operations);
        }
      );

      await Promise.all(operationPromises);

      const concurrentTime = performance.now() - concurrentStart;
      logger.info(
        `Concurrent operations completed in: ${concurrentTime.toFixed(2)}ms`
      );

      // Should handle concurrent load
      expect(concurrentTime).toBeLessThan(10000); // 10 seconds

      // Cleanup
      cache.destroy();
      lookupManager.clear();
    });
  });
});
