/**
 * Integration tests for the enhanced logging system
 * These tests bypass the global mock to test the actual implementation
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import path from "path";

// Unmock the logging module for these tests to use real implementation
vi.unmock("../logging.js");

import * as logging from "../logging.js";
import { getFeatureFlagService } from "../../config/featureFlagService.js";

describe("Enhanced Logging System - Integration Tests", () => {
  beforeEach(() => {
    // Clear environment variables
    delete process.env.HYPERTOOL_MCP_LOGGER_ENABLED;
    delete process.env.LOG_FORMAT;
    delete process.env.NODE_ENV;

    // Reset state
    logging.resetGlobalLogger();
    getFeatureFlagService().reset();
  });

  afterEach(() => {
    // Clean up environment
    delete process.env.HYPERTOOL_MCP_LOGGER_ENABLED;
    delete process.env.LOG_FORMAT;
    delete process.env.NODE_ENV;

    // Reset state
    logging.resetGlobalLogger();
  });

  describe("Feature Flag Integration", () => {
    it("should use Pino implementation by default", () => {
      logging.resetGlobalLogger();

      const logger = logging.getLogger();
      const diagnostics = logging.getLoggerDiagnostics();

      expect(diagnostics.hasGlobalLogger).toBe(true);
      expect(diagnostics.implementationType).toBe("pino");

      // Test basic functionality
      expect(() => {
        logger.info("Test message");
        logger.error("Test error");
        logger.debug("Test debug");
      }).not.toThrow();
    });

    it("should switch to mcp-logger when feature flag is enabled", () => {
      logging.resetGlobalLogger();
      logging.forceSetMcpLoggerEnabled(true);

      const logger = logging.getLogger();
      const diagnostics = logging.getLoggerDiagnostics();

      expect(diagnostics.hasGlobalLogger).toBe(true);
      expect(diagnostics.implementationType).toBe("mcp-logger");

      // Test basic functionality
      expect(() => {
        logger.info("Test message");
        logger.error("Test error");
        logger.debug("Test debug");
      }).not.toThrow();
    });

    it("should respect environment variable", () => {
      process.env.HYPERTOOL_MCP_LOGGER_ENABLED = "true";

      const logger = logging.getLogger();
      const diagnostics = logging.getLoggerDiagnostics();

      expect(diagnostics.implementationType).toBe("mcp-logger");
    });

    it("should handle falsy environment variable values", () => {
      const falsyValues = ["false", "0", "no", "off"];

      for (const value of falsyValues) {
        process.env.HYPERTOOL_MCP_LOGGER_ENABLED = value;
        logging.resetGlobalLogger();

        const logger = logging.getLogger();
        const diagnostics = logging.getLoggerDiagnostics();

        expect(diagnostics.implementationType).toBe("pino");
      }
    });
  });

  describe("Memory Leak Prevention", () => {
    it("should prevent EventEmitter warnings with many child loggers", () => {
      logging.forceSetMcpLoggerEnabled(false); // Use Pino for predictable caching

      const originalWarning = console.warn;
      const warnings: string[] = [];
      console.warn = (message: string) => {
        warnings.push(message);
        originalWarning(message);
      };

      try {
        // Create many child loggers
        for (let i = 0; i < 150; i++) {
          const child = logging.createChildLogger({ module: `TestModule${i}` });
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

        // Verify cache is working and limited
        const diagnostics = logging.getLoggerDiagnostics();
        expect(diagnostics.cacheStats).toBeDefined();
        expect(diagnostics.cacheStats.childLoggerCount).toBeLessThanOrEqual(
          100
        );
      } finally {
        console.warn = originalWarning;
      }
    });

    it("should reuse cached child loggers for identical bindings", () => {
      logging.forceSetMcpLoggerEnabled(false); // Use Pino

      const child1 = logging.createChildLogger({ module: "SameModule" });
      const child2 = logging.createChildLogger({ module: "SameModule" });

      // Should be the same cached instance for Pino
      expect(child1).toBe(child2);

      const diagnostics = logging.getLoggerDiagnostics();
      expect(diagnostics.cacheStats.childLoggerCount).toBe(1);
    });
  });

  describe("Backward Compatibility", () => {
    it("should maintain Logger class API", () => {
      logging.resetGlobalLogger();

      const logger = logging.getLogger();

      // Check all methods exist
      expect(typeof logger.fatal).toBe("function");
      expect(typeof logger.error).toBe("function");
      expect(typeof logger.warn).toBe("function");
      expect(typeof logger.info).toBe("function");
      expect(typeof logger.debug).toBe("function");
      expect(typeof logger.trace).toBe("function");
      expect(typeof logger.child).toBe("function");
      expect(typeof logger.updateConfig).toBe("function");

      // Check legacy properties
      expect(logger.pino).toBeDefined();
      expect(logger.mcp).toBeDefined();
    });

    it("should handle Error objects in context", () => {
      logging.resetGlobalLogger();

      const logger = logging.getLogger();
      const testError = new Error("Test error");
      testError.stack = "Test stack trace";

      expect(() => {
        logger.error("Error occurred", testError);
        logger.warn("Warning with error", testError);
        logger.info("Info with error", testError);
      }).not.toThrow();
    });

    it("should handle various context types", () => {
      logging.resetGlobalLogger();

      const logger = logging.getLogger();

      expect(() => {
        logger.info("String context", "test string");
        logger.info("Number context", 42);
        logger.info("Boolean context", true);
        logger.info("Object context", { key: "value", nested: { deep: true } });
        logger.info("Null context", null);
        logger.info("Undefined context", undefined);
      }).not.toThrow();
    });
  });

  describe("Configuration", () => {
    it("should support different log levels", () => {
      logging.resetGlobalLogger();

      const config = {
        level: "debug" as const,
        enableConsole: true,
        enableFile: false,
        serverName: "test-server",
        format: "json" as const,
      };

      const logger = logging.getLogger(config);

      expect(() => {
        logger.debug("Debug message");
        logger.info("Info message");
        logger.warn("Warning message");
        logger.error("Error message");
      }).not.toThrow();
    });

    it("should handle LOG_FORMAT environment variable", () => {
      process.env.LOG_FORMAT = "json";

      logging.resetGlobalLogger();

      const logger = logging.getLogger();

      expect(() => {
        logger.info("JSON format test");
      }).not.toThrow();
    });
  });

  describe("Diagnostics", () => {
    it("should provide diagnostic information", () => {
      logging.resetGlobalLogger();

      const logger = logging.getLogger();
      const diagnostics = logging.getLoggerDiagnostics();

      expect(diagnostics).toHaveProperty("hasGlobalLogger");
      expect(diagnostics).toHaveProperty("implementationType");
      expect(diagnostics.hasGlobalLogger).toBe(true);
      expect(["pino", "mcp-logger"]).toContain(diagnostics.implementationType);
    });

    it("should provide cache statistics for Pino implementation", () => {
      logging.resetGlobalLogger();
      logging.forceSetMcpLoggerEnabled(false);

      const logger = logging.getLogger();
      logging.createChildLogger({ module: "TestModule" });

      const diagnostics = logging.getLoggerDiagnostics();

      expect(diagnostics.implementationType).toBe("pino");
      expect(diagnostics.cacheStats).toBeDefined();
      expect(diagnostics.cacheStats.childLoggerCount).toBeGreaterThan(0);
    });
  });

  describe("Implementation Switching", () => {
    it("should not leak memory when switching between implementations", () => {
      const originalWarning = console.warn;
      const warnings: string[] = [];
      console.warn = (message: string) => {
        warnings.push(message);
        originalWarning(message);
      };

      try {
        // Create loggers with Pino
        logging.resetGlobalLogger();
        logging.forceSetMcpLoggerEnabled(false);
        for (let i = 0; i < 25; i++) {
          const child = logging.createChildLogger({ module: `PinoModule${i}` });
          child.info(`Pino message ${i}`);
        }

        // Switch to mcp-logger
        logging.forceSetMcpLoggerEnabled(true);
        for (let i = 0; i < 25; i++) {
          const child = logging.createChildLogger({ module: `McpModule${i}` });
          child.info(`MCP message ${i}`);
        }

        // Switch back to Pino
        logging.forceSetMcpLoggerEnabled(false);
        for (let i = 0; i < 25; i++) {
          const child = logging.createChildLogger({
            module: `PinoModule2${i}`,
          });
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
