/**
 * Global test setup for Vitest
 * Mocks the logging module to prevent file I/O during tests
 * but still outputs to stdout for visibility using real Pino
 */

import { vi } from "vitest";
import pino from "pino";

// Mock the logging module to prevent file I/O during tests
// but use a real Pino logger configured for console output only
vi.mock("./utils/logging.js", () => {
  // Create a minimal test logger for better performance
  const testLogger = pino({
    level: process.env.TEST_VERBOSE ? "info" : "silent", // Silent unless explicitly verbose
    transport: process.env.TEST_VERBOSE ? {
      target: "pino-pretty",
      options: {
        colorize: false,
        translateTime: false,
        ignore: "pid,hostname,time",
      },
    } : undefined,
  });

  const mockLogger = {
    info: testLogger.info.bind(testLogger),
    warn: testLogger.warn.bind(testLogger),
    error: testLogger.error.bind(testLogger),
    debug: testLogger.debug.bind(testLogger),
    trace: testLogger.trace.bind(testLogger),
    child: (bindings: any) => {
      const childLogger = testLogger.child(bindings);
      return {
        info: childLogger.info.bind(childLogger),
        warn: childLogger.warn.bind(childLogger),
        error: childLogger.error.bind(childLogger),
        debug: childLogger.debug.bind(childLogger),
        trace: childLogger.trace.bind(childLogger),
        child: mockLogger.child,
        pino: childLogger,
        updateConfig: vi.fn(),
      };
    },
    pino: testLogger,
    updateConfig: vi.fn(),
  };

  return {
    Logger: vi.fn(() => mockLogger),
    getLogger: vi.fn(() => mockLogger),
    createChildLogger: vi.fn((bindings) => mockLogger.child(bindings)),
    DEFAULT_LOGGING_CONFIG: {
      level: "info",
      enableConsole: true,
      enableFile: false,
      serverName: "test",
      format: "pretty",
      colorize: false,
    },
    STDIO_LOGGING_CONFIG: {
      level: "info",
      enableConsole: false,
      enableFile: false,
      serverName: "test",
      format: "pretty",
      colorize: false,
    },
  };
});
