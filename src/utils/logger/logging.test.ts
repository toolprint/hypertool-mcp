/**
 * Comprehensive tests for the enhanced logging system
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Unmock the logging module for these tests to use real implementation
vi.unmock("../logging.js");

import { 
  Logger, 
  getLogger, 
  createChildLogger, 
  getLoggerDiagnostics,
  resetGlobalLogger,
  forceSetMcpLoggerEnabled 
} from "../logging.js";
import { getFeatureFlagService } from "../../config/featureFlagService.js";
import { PinoLogger } from "./pinoLogger.js";
import { McpLoggerWrapper } from "./mcpLoggerWrapper.js";

describe("Enhanced Logging System", () => {
  beforeEach(() => {
    // Reset state before each test
    resetGlobalLogger();
    getFeatureFlagService().reset();
    
    // Clear environment variables
    delete process.env.HYPERTOOL_MCP_LOGGER_ENABLED;
    delete process.env.LOG_FORMAT;
    delete process.env.NODE_ENV;
  });

  afterEach(() => {
    resetGlobalLogger();
  });

  describe("Feature Flag Integration", () => {
    it("should use PinoLogger by default", () => {
      const logger = getLogger();
      const diagnostics = getLoggerDiagnostics();
      
      expect(diagnostics.implementationType).toBe("pino");
      expect(diagnostics.hasGlobalLogger).toBe(true);
    });

    it("should use PinoLogger when feature flag is explicitly disabled", () => {
      forceSetMcpLoggerEnabled(false);
      
      const logger = getLogger();
      const diagnostics = getLoggerDiagnostics();
      
      expect(diagnostics.implementationType).toBe("pino");
    });

    it("should use McpLoggerWrapper when feature flag is enabled", () => {
      forceSetMcpLoggerEnabled(true);
      
      const logger = getLogger();
      const diagnostics = getLoggerDiagnostics();
      
      expect(diagnostics.implementationType).toBe("mcp-logger");
    });

    it("should respect environment variable for feature flag", () => {
      process.env.HYPERTOOL_MCP_LOGGER_ENABLED = "true";
      
      const logger = getLogger();
      const diagnostics = getLoggerDiagnostics();
      
      expect(diagnostics.implementationType).toBe("mcp-logger");
    });

    it("should handle various truthy values for environment variable", () => {
      const truthyValues = ["true", "1", "yes", "on"];
      
      for (const value of truthyValues) {
        resetGlobalLogger();
        process.env.HYPERTOOL_MCP_LOGGER_ENABLED = value;
        
        const logger = getLogger();
        const diagnostics = getLoggerDiagnostics();
        
        expect(diagnostics.implementationType).toBe("mcp-logger");
      }
    });

    it("should handle falsy values for environment variable", () => {
      const falsyValues = ["false", "0", "no", "off", ""];
      
      for (const value of falsyValues) {
        resetGlobalLogger();
        process.env.HYPERTOOL_MCP_LOGGER_ENABLED = value;
        
        const logger = getLogger();
        const diagnostics = getLoggerDiagnostics();
        
        expect(diagnostics.implementationType).toBe("pino");
      }
    });
  });

  describe("Memory Leak Prevention", () => {
    it("should cache child loggers to prevent EventEmitter warnings", () => {
      forceSetMcpLoggerEnabled(false); // Use Pino for cache testing
      
      const parentLogger = getLogger();
      const childLoggers: Logger[] = [];
      
      // Create many child loggers with same module name
      for (let i = 0; i < 100; i++) {
        const child = createChildLogger({ module: "TestModule" });
        childLoggers.push(child);
      }
      
      const diagnostics = getLoggerDiagnostics();
      
      // Verify we have cache stats and limited cache size
      expect(diagnostics.cacheStats).toBeDefined();
      expect(diagnostics.cacheStats.childLoggerCount).toBeLessThanOrEqual(100);
      
      // All child loggers should work
      childLoggers.forEach((child, index) => {
        expect(() => child.info(`Test message ${index}`)).not.toThrow();
      });
    });

    it("should limit cache size to prevent unbounded growth", () => {
      forceSetMcpLoggerEnabled(false); // Use Pino
      
      const parentLogger = getLogger();
      
      // Create more child loggers than cache limit
      for (let i = 0; i < 150; i++) {
        createChildLogger({ module: `Module${i}` }); // Different module for each
      }
      
      const diagnostics = getLoggerDiagnostics();
      
      // Cache should be limited
      expect(diagnostics.cacheStats.childLoggerCount).toBeLessThanOrEqual(100);
    });

    it("should reuse cached child loggers for same bindings", () => {
      forceSetMcpLoggerEnabled(false); // Use Pino
      
      const child1 = createChildLogger({ module: "SameModule" });
      const child2 = createChildLogger({ module: "SameModule" });
      
      // Should be the same instance from cache
      expect(child1).toBe(child2);
      
      const diagnostics = getLoggerDiagnostics();
      expect(diagnostics.cacheStats.childLoggerCount).toBe(1);
    });
  });

  describe("Backward Compatibility", () => {
    it("should maintain Logger class API", () => {
      const logger = getLogger();
      
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

    it("should support legacy pino property access", () => {
      forceSetMcpLoggerEnabled(false);
      const logger = getLogger();
      
      expect(logger.pino).toBeDefined();
      expect(typeof logger.pino.info).toBe("function");
    });

    it("should support legacy mcp property access", () => {
      forceSetMcpLoggerEnabled(true);
      const logger = getLogger();
      
      expect(logger.mcp).toBeDefined();
      expect(typeof logger.mcp.info).toBe("function");
    });

    it("should handle child logger creation with various bindings", () => {
      const logger = getLogger();
      
      const child1 = logger.child({ module: "TestModule" });
      const child2 = logger.child({ module: "TestModule", service: "api" });
      const child3 = logger.child({ requestId: "123", userId: "user1" });
      
      expect(child1).toBeInstanceOf(Logger);
      expect(child2).toBeInstanceOf(Logger);
      expect(child3).toBeInstanceOf(Logger);
      
      // They should all work without errors
      expect(() => {
        child1.info("Test message 1");
        child2.info("Test message 2");
        child3.info("Test message 3");
      }).not.toThrow();
    });
  });

  describe("Error Handling", () => {
    it("should handle Error objects in context properly", () => {
      const logger = getLogger();
      const testError = new Error("Test error");
      testError.stack = "Test stack trace";
      
      expect(() => {
        logger.error("Error occurred", testError);
        logger.warn("Warning with error", testError);
        logger.info("Info with error", testError);
      }).not.toThrow();
    });

    it("should handle various context types", () => {
      const logger = getLogger();
      
      expect(() => {
        logger.info("String context", "test string");
        logger.info("Number context", 42);
        logger.info("Boolean context", true);
        logger.info("Object context", { key: "value", nested: { deep: true } });
        logger.info("Null context", null);
        logger.info("Undefined context", undefined);
      }).not.toThrow();
    });

    it("should gracefully handle logger initialization failures", () => {
      // This test verifies that even if there are issues with logger setup,
      // the system continues to work without crashing
      const logger = getLogger();
      
      expect(() => {
        logger.fatal("Fatal message");
        logger.error("Error message");
        logger.warn("Warning message");
        logger.info("Info message");
        logger.debug("Debug message");
        logger.trace("Trace message");
      }).not.toThrow();
    });
  });

  describe("Configuration", () => {
    it("should support different log levels", () => {
      const config = {
        level: "debug" as const,
        enableConsole: true,
        enableFile: false,
        serverName: "test-server",
        format: "json" as const
      };
      
      const logger = getLogger(config);
      
      expect(() => {
        logger.debug("Debug message");
        logger.info("Info message");
        logger.warn("Warning message");
        logger.error("Error message");
      }).not.toThrow();
    });

    it("should support configuration updates", () => {
      const logger = getLogger();
      
      expect(() => {
        logger.updateConfig({
          level: "error",
          format: "json"
        });
        
        logger.error("Updated config test");
      }).not.toThrow();
    });

    it("should handle LOG_FORMAT environment variable", () => {
      process.env.LOG_FORMAT = "json";
      
      const logger = getLogger();
      
      expect(() => {
        logger.info("JSON format test");
      }).not.toThrow();
    });
  });

  describe("Runtime Options", () => {
    it("should support stdio transport mode", () => {
      const runtimeOptions = {
        transport: "stdio" as const,
        debug: false,
        insecure: false
      };
      
      const logger = getLogger({}, runtimeOptions);
      
      expect(() => {
        logger.info("Stdio transport test");
      }).not.toThrow();
    });

    it("should support http transport mode", () => {
      const runtimeOptions = {
        transport: "http" as const,
        debug: true,
        insecure: false
      };
      
      const logger = getLogger({}, runtimeOptions);
      
      expect(() => {
        logger.info("HTTP transport test");
      }).not.toThrow();
    });

    it("should override log level from runtime options", () => {
      const runtimeOptions = {
        logLevel: "trace",
        transport: "stdio" as const,
        debug: false,
        insecure: false
      };
      
      const logger = getLogger({}, runtimeOptions);
      
      expect(() => {
        logger.trace("Trace level test");
      }).not.toThrow();
    });
  });

  describe("Global Logger Management", () => {
    it("should maintain single global logger instance", () => {
      const logger1 = getLogger();
      const logger2 = getLogger();
      
      expect(logger1).toBe(logger2);
    });

    it("should create new global logger when config changes", () => {
      const logger1 = getLogger();
      const logger2 = getLogger({ level: "debug" });
      
      expect(logger1).not.toBe(logger2);
    });

    it("should reset global logger state", () => {
      const logger1 = getLogger();
      const diagnostics1 = getLoggerDiagnostics();
      
      expect(diagnostics1.hasGlobalLogger).toBe(true);
      
      resetGlobalLogger();
      
      const diagnostics2 = getLoggerDiagnostics();
      expect(diagnostics2.hasGlobalLogger).toBe(false);
    });
  });

  describe("Diagnostics", () => {
    it("should provide diagnostic information", () => {
      const logger = getLogger();
      const diagnostics = getLoggerDiagnostics();
      
      expect(diagnostics).toHaveProperty("hasGlobalLogger");
      expect(diagnostics).toHaveProperty("implementationType");
      expect(diagnostics.hasGlobalLogger).toBe(true);
      expect(["pino", "mcp-logger"]).toContain(diagnostics.implementationType);
    });

    it("should provide cache statistics for Pino implementation", () => {
      forceSetMcpLoggerEnabled(false);
      
      const logger = getLogger();
      createChildLogger({ module: "TestModule" });
      
      const diagnostics = getLoggerDiagnostics();
      
      expect(diagnostics.implementationType).toBe("pino");
      expect(diagnostics.cacheStats).toBeDefined();
      expect(diagnostics.cacheStats.childLoggerCount).toBeGreaterThan(0);
    });
  });
});