/**
 * Memory leak prevention tests for the logging system
 * These tests specifically focus on preventing EventEmitter memory leaks
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Unmock the logging module for these tests to use real implementation
vi.unmock("../logging.js");

import {
  getLogger,
  createChildLogger,
  getLoggerDiagnostics,
  resetGlobalLogger,
  forceSetMcpLoggerEnabled,
} from "../logging.js";

describe("Memory Leak Prevention", () => {
  beforeEach(() => {
    resetGlobalLogger();
    delete process.env.HYPERTOOL_MCP_LOGGER_ENABLED;
  });

  afterEach(() => {
    resetGlobalLogger();
  });

  describe("Child Logger Caching", () => {
    it("should prevent EventEmitter memory leaks with many child loggers (Pino)", () => {
      forceSetMcpLoggerEnabled(false);

      const originalWarning = console.warn;
      const warnings: string[] = [];
      console.warn = (message: string) => {
        warnings.push(message);
        originalWarning(message);
      };

      try {
        // Create many child loggers - this would normally trigger EventEmitter warnings
        const childLoggers = [];
        for (let i = 0; i < 200; i++) {
          const child = createChildLogger({ module: `TestModule${i}` });
          childLoggers.push(child);

          // Actually use the logger to ensure it's fully initialized
          child.info(`Test message ${i}`);
        }

        // Check that no EventEmitter warnings were emitted
        const emitterWarnings = warnings.filter(
          (w) =>
            w.includes("MaxListenersExceededWarning") ||
            w.includes("EventEmitter") ||
            w.includes("memory leak")
        );

        expect(emitterWarnings.length).toBe(0);

        // Verify cache is working
        const diagnostics = getLoggerDiagnostics();
        expect(diagnostics.cacheStats).toBeDefined();
        expect(diagnostics.cacheStats.childLoggerCount).toBeLessThanOrEqual(
          100
        );
      } finally {
        console.warn = originalWarning;
      }
    });

    it("should prevent EventEmitter memory leaks with many child loggers (mcp-logger)", () => {
      forceSetMcpLoggerEnabled(true);

      const originalWarning = console.warn;
      const warnings: string[] = [];
      console.warn = (message: string) => {
        warnings.push(message);
        originalWarning(message);
      };

      try {
        // Create many child loggers
        const childLoggers = [];
        for (let i = 0; i < 100; i++) {
          const child = createChildLogger({ module: `TestModule${i}` });
          childLoggers.push(child);

          // Use the logger
          child.info(`Test message ${i}`);
        }

        // Check that no EventEmitter warnings were emitted
        const emitterWarnings = warnings.filter(
          (w) =>
            w.includes("MaxListenersExceededWarning") ||
            w.includes("EventEmitter") ||
            w.includes("memory leak")
        );

        expect(emitterWarnings.length).toBe(0);
      } finally {
        console.warn = originalWarning;
      }
    });

    it("should reuse cached child loggers for identical bindings", () => {
      forceSetMcpLoggerEnabled(false);

      const bindings = { module: "SameModule", service: "api" };

      const child1 = createChildLogger(bindings);
      const child2 = createChildLogger(bindings);
      const child3 = createChildLogger(bindings);

      // All should be the same cached instance
      expect(child1).toBe(child2);
      expect(child2).toBe(child3);

      const diagnostics = getLoggerDiagnostics();
      expect(diagnostics.cacheStats.childLoggerCount).toBe(1);
    });

    it("should create different cached instances for different bindings", () => {
      forceSetMcpLoggerEnabled(false);

      const child1 = createChildLogger({ module: "Module1" });
      const child2 = createChildLogger({ module: "Module2" });
      const child3 = createChildLogger({ module: "Module1", service: "api" });

      expect(child1).not.toBe(child2);
      expect(child1).not.toBe(child3);
      expect(child2).not.toBe(child3);

      const diagnostics = getLoggerDiagnostics();
      expect(diagnostics.cacheStats.childLoggerCount).toBe(3);
    });

    it("should handle cache size limits gracefully", () => {
      forceSetMcpLoggerEnabled(false);

      // Create more loggers than the cache limit (100)
      const childLoggers = [];
      for (let i = 0; i < 150; i++) {
        const child = createChildLogger({ module: `Module${i}` });
        childLoggers.push(child);
      }

      const diagnostics = getLoggerDiagnostics();

      // Cache should not exceed limit
      expect(diagnostics.cacheStats.childLoggerCount).toBeLessThanOrEqual(100);

      // All loggers should still work
      childLoggers.forEach((child, index) => {
        expect(() => child.info(`Message ${index}`)).not.toThrow();
      });
    });
  });

  describe("Transport Management", () => {
    it("should reuse shared transports to prevent resource leaks", () => {
      forceSetMcpLoggerEnabled(false);

      // Create multiple loggers with same configuration
      const logger1 = getLogger({ enableConsole: true, enableFile: true });
      resetGlobalLogger();
      const logger2 = getLogger({ enableConsole: true, enableFile: true });
      resetGlobalLogger();
      const logger3 = getLogger({ enableConsole: true, enableFile: true });

      // All should work without creating excessive resources
      expect(() => {
        logger1.info("Message 1");
        logger2.info("Message 2");
        logger3.info("Message 3");
      }).not.toThrow();
    });

    it("should handle stdio vs http transport modes without leaks", () => {
      forceSetMcpLoggerEnabled(false);

      const stdioLogger = getLogger(
        {},
        { transport: "stdio", debug: false, insecure: false }
      );
      resetGlobalLogger();
      const httpLogger = getLogger(
        {},
        { transport: "http", debug: false, insecure: false }
      );

      expect(() => {
        stdioLogger.info("Stdio message");
        httpLogger.info("HTTP message");
      }).not.toThrow();
    });
  });

  describe("Memory Usage Pattern Testing", () => {
    it("should maintain stable memory usage with repeated child logger creation", () => {
      forceSetMcpLoggerEnabled(false);

      const initialDiagnostics = getLoggerDiagnostics();

      // Create and use many child loggers in batches
      for (let batch = 0; batch < 10; batch++) {
        const batchLoggers = [];

        for (let i = 0; i < 20; i++) {
          const child = createChildLogger({
            module: `Batch${batch}Module${i}`,
          });
          batchLoggers.push(child);
          child.info(`Batch ${batch} message ${i}`);
        }

        // Clear batch loggers (they should still be cached)
        batchLoggers.length = 0;
      }

      const finalDiagnostics = getLoggerDiagnostics();

      // Cache should be limited even after many operations
      expect(finalDiagnostics.cacheStats.childLoggerCount).toBeLessThanOrEqual(
        100
      );
    });

    it("should handle rapid child logger creation and destruction", () => {
      forceSetMcpLoggerEnabled(false);

      const originalWarning = console.warn;
      const warnings: string[] = [];
      console.warn = (message: string) => {
        warnings.push(message);
        originalWarning(message);
      };

      try {
        // Rapidly create and use child loggers
        for (let i = 0; i < 1000; i++) {
          const child = createChildLogger({ module: `RapidModule${i % 10}` }); // Cycle through 10 modules
          child.debug(`Rapid message ${i}`);

          if (i % 100 === 0) {
            // Check diagnostics periodically
            const diagnostics = getLoggerDiagnostics();
            expect(diagnostics.cacheStats.childLoggerCount).toBeLessThanOrEqual(
              100
            );
          }
        }

        // No memory leak warnings should have been emitted
        const memoryWarnings = warnings.filter(
          (w) =>
            w.toLowerCase().includes("memory") ||
            w.toLowerCase().includes("leak") ||
            w.includes("MaxListenersExceededWarning")
        );

        expect(memoryWarnings.length).toBe(0);
      } finally {
        console.warn = originalWarning;
      }
    });
  });

  describe("Feature Flag Switching", () => {
    it("should not leak memory when switching between implementations", () => {
      const originalWarning = console.warn;
      const warnings: string[] = [];
      console.warn = (message: string) => {
        warnings.push(message);
        originalWarning(message);
      };

      try {
        // Create loggers with Pino
        forceSetMcpLoggerEnabled(false);
        for (let i = 0; i < 50; i++) {
          const child = createChildLogger({ module: `PinoModule${i}` });
          child.info(`Pino message ${i}`);
        }

        // Switch to mcp-logger
        forceSetMcpLoggerEnabled(true);
        for (let i = 0; i < 50; i++) {
          const child = createChildLogger({ module: `McpModule${i}` });
          child.info(`MCP message ${i}`);
        }

        // Switch back to Pino
        forceSetMcpLoggerEnabled(false);
        for (let i = 0; i < 50; i++) {
          const child = createChildLogger({ module: `PinoModule2${i}` });
          child.info(`Pino2 message ${i}`);
        }

        // No memory warnings should have been emitted
        const memoryWarnings = warnings.filter(
          (w) =>
            w.toLowerCase().includes("memory") ||
            w.toLowerCase().includes("leak") ||
            w.includes("MaxListenersExceededWarning")
        );

        expect(memoryWarnings.length).toBe(0);
      } finally {
        console.warn = originalWarning;
      }
    });
  });
});
