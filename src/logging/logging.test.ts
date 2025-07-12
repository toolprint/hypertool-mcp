/**
 * Tests for logging system
 */

import {
  Logger,
  LogLevel,
  LogEntry,
  ConsoleFormatter,
  JsonFormatter,
  LogLevelUtils,
  createLogger,
  initializeLogger,
  getLogger,
} from "./index";
import { ConnectionError } from "../errors";

// Mock console methods for testing
const originalConsole = { ...console };
beforeEach(() => {
  console.log = jest.fn();
  console.info = jest.fn();
  console.warn = jest.fn();
  console.error = jest.fn();
  console.debug = jest.fn();
});

afterEach(() => {
  Object.assign(console, originalConsole);
});

describe("LogLevel", () => {
  test("should have correct numeric values", () => {
    expect(LogLevel.ERROR).toBe(0);
    expect(LogLevel.WARN).toBe(1);
    expect(LogLevel.INFO).toBe(2);
    expect(LogLevel.DEBUG).toBe(3);
  });
});

describe("LogLevelUtils", () => {
  test("should convert string to LogLevel", () => {
    expect(LogLevelUtils.fromString("ERROR")).toBe(LogLevel.ERROR);
    expect(LogLevelUtils.fromString("error")).toBe(LogLevel.ERROR);
    expect(LogLevelUtils.fromString("WARN")).toBe(LogLevel.WARN);
    expect(LogLevelUtils.fromString("WARNING")).toBe(LogLevel.WARN);
    expect(LogLevelUtils.fromString("INFO")).toBe(LogLevel.INFO);
    expect(LogLevelUtils.fromString("DEBUG")).toBe(LogLevel.DEBUG);
    expect(LogLevelUtils.fromString("INVALID")).toBeUndefined();
  });

  test("should convert LogLevel to string", () => {
    expect(LogLevelUtils.toString(LogLevel.ERROR)).toBe("ERROR");
    expect(LogLevelUtils.toString(LogLevel.WARN)).toBe("WARN");
    expect(LogLevelUtils.toString(LogLevel.INFO)).toBe("INFO");
    expect(LogLevelUtils.toString(LogLevel.DEBUG)).toBe("DEBUG");
  });

  test("should validate log levels", () => {
    expect(LogLevelUtils.isValidLevel("ERROR")).toBe(true);
    expect(LogLevelUtils.isValidLevel("info")).toBe(true);
    expect(LogLevelUtils.isValidLevel("INVALID")).toBe(false);
  });
});

describe("ConsoleFormatter", () => {
  test("should format basic log entry", () => {
    const formatter = new ConsoleFormatter();
    const entry: LogEntry = {
      timestamp: new Date("2023-01-01T12:00:00Z"),
      level: LogLevel.INFO,
      component: "TestComponent",
      message: "Test message",
    };

    const formatted = formatter.format(entry);
    expect(formatted).toBe("2023-01-01T12:00:00.000Z INFO [TestComponent] Test message");
  });

  test("should format log entry with context", () => {
    const formatter = new ConsoleFormatter();
    const entry: LogEntry = {
      timestamp: new Date("2023-01-01T12:00:00Z"),
      level: LogLevel.ERROR,
      component: "TestComponent",
      message: "Error occurred",
      context: { userId: "123", action: "login" },
    };

    const formatted = formatter.format(entry);
    expect(formatted).toBe(
      '2023-01-01T12:00:00.000Z ERROR [TestComponent] Error occurred {"userId":"123","action":"login"}'
    );
  });

  test("should format log entry with error", () => {
    const formatter = new ConsoleFormatter();
    const error = new Error("Test error");
    error.stack = "Error: Test error\n    at test";
    
    const entry: LogEntry = {
      timestamp: new Date("2023-01-01T12:00:00Z"),
      level: LogLevel.ERROR,
      component: "TestComponent",
      message: "Operation failed",
      error,
    };

    const formatted = formatter.format(entry);
    expect(formatted).toContain("2023-01-01T12:00:00.000Z ERROR [TestComponent] Operation failed");
    expect(formatted).toContain("Error: Test error");
    expect(formatted).toContain("Stack: Error: Test error\n    at test");
  });
});

describe("JsonFormatter", () => {
  test("should format basic log entry as JSON", () => {
    const formatter = new JsonFormatter();
    const entry: LogEntry = {
      timestamp: new Date("2023-01-01T12:00:00Z"),
      level: LogLevel.INFO,
      component: "TestComponent",
      message: "Test message",
    };

    const formatted = formatter.format(entry);
    const parsed = JSON.parse(formatted);
    
    expect(parsed).toMatchObject({
      timestamp: "2023-01-01T12:00:00.000Z",
      level: "INFO",
      component: "TestComponent",
      message: "Test message",
    });
  });

  test("should format log entry with MetaMCPError", () => {
    const formatter = new JsonFormatter();
    const error = new ConnectionError("Connection failed", "test-server", true);
    
    const entry: LogEntry = {
      timestamp: new Date("2023-01-01T12:00:00Z"),
      level: LogLevel.ERROR,
      component: "TestComponent",
      message: "Connection error",
      error,
      serverName: "test-server",
    };

    const formatted = formatter.format(entry);
    const parsed = JSON.parse(formatted);
    
    expect(parsed.error).toMatchObject({
      name: "ConnectionError",
      message: "Connection failed",
      code: "CONNECTION_ERROR",
      category: "connection",
      isRetryable: true,
    });
    expect(parsed.serverName).toBe("test-server");
  });
});

describe("Logger", () => {
  test("should respect log level filtering", () => {
    const logger = new Logger({
      level: LogLevel.WARN,
      enableConsole: true,
    });

    logger.debug("Debug message");
    logger.info("Info message");
    logger.warn("Warn message");
    logger.error("Error message");

    expect(console.debug).not.toHaveBeenCalled();
    expect(console.info).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledTimes(1);
    expect(console.error).toHaveBeenCalledTimes(1);
  });

  test("should emit log events", () => {
    const logger = new Logger({ enableConsole: false });
    const logHandler = jest.fn();
    
    logger.on("log", logHandler);
    logger.info("Test message", { key: "value" });

    expect(logHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        level: LogLevel.INFO,
        message: "Test message",
        context: { key: "value" },
      })
    );
  });

  test("should create child logger with component", () => {
    const parentLogger = new Logger({ level: LogLevel.DEBUG });
    const childLogger = parentLogger.child("ChildComponent");

    const logHandler = jest.fn();
    childLogger.on("log", logHandler);
    
    childLogger.info("Child message");

    expect(logHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        component: "ChildComponent",
        message: "Child message",
      })
    );
  });

  test("should log connection events", () => {
    const logger = new Logger({ enableConsole: false });
    const logHandler = jest.fn();
    
    logger.on("log", logHandler);
    logger.logConnection("connected", "test-server", { duration: 150 });

    expect(logHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Connection connected",
        context: expect.objectContaining({
          serverName: "test-server",
          event: "connected",
          duration: 150,
        }),
      })
    );
  });

  test("should log tool call events", () => {
    const logger = new Logger({ enableConsole: false });
    const logHandler = jest.fn();
    
    logger.on("log", logHandler);
    logger.logToolCall("started", "test-tool", "test-server", "req-123", { args: {} });

    expect(logHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Tool call started",
        requestId: "req-123",
        toolName: "test-tool",
        serverName: "test-server",
      })
    );
  });

  test("should configure logger settings", () => {
    const logger = new Logger({ level: LogLevel.ERROR });
    
    expect(logger.getLevel()).toBe(LogLevel.ERROR);
    expect(logger.shouldLog(LogLevel.WARN)).toBe(false);
    expect(logger.shouldLog(LogLevel.ERROR)).toBe(true);

    logger.setLevel(LogLevel.DEBUG);
    expect(logger.getLevel()).toBe(LogLevel.DEBUG);
    expect(logger.shouldLog(LogLevel.WARN)).toBe(true);
  });

  test("should handle structured logging", () => {
    const logger = new Logger({
      enableStructured: true,
      enableConsole: true,
    });

    logger.info("Test message", { key: "value" });

    const logCall = (console.info as jest.Mock).mock.calls[0][0];
    const parsed = JSON.parse(logCall);
    
    expect(parsed).toMatchObject({
      level: "INFO",
      message: "Test message",
      context: { key: "value" },
    });
  });
});

describe("Global Logger", () => {
  test("should initialize and get global logger", () => {
    const logger = initializeLogger({ level: LogLevel.DEBUG });
    const retrievedLogger = getLogger();
    
    expect(retrievedLogger).toBe(logger);
    expect(retrievedLogger.getLevel()).toBe(LogLevel.DEBUG);
  });

  test("should create component logger", () => {
    const logger = createLogger("TestComponent", { level: LogLevel.WARN });
    const logHandler = jest.fn();
    
    logger.on("log", logHandler);
    logger.warn("Test warning");

    expect(logHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        component: "TestComponent",
        level: LogLevel.WARN,
        message: "Test warning",
      })
    );
  });

  test("should get logger without initialization", () => {
    // Reset global logger
    const logger = getLogger();
    expect(logger).toBeInstanceOf(Logger);
  });
});

describe("Log Entry Fields", () => {
  test("should extract fields from context", () => {
    const logger = new Logger({ enableConsole: false });
    const logHandler = jest.fn();
    
    logger.on("log", logHandler);
    logger.info("Test", {
      requestId: "req-123",
      serverName: "test-server",
      toolName: "test-tool",
      extra: "data",
    });

    expect(logHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: "req-123",
        serverName: "test-server", 
        toolName: "test-tool",
        context: expect.objectContaining({
          requestId: "req-123",
          serverName: "test-server",
          toolName: "test-tool",
          extra: "data",
        }),
      })
    );
  });

  test("should handle missing context fields", () => {
    const logger = new Logger({ enableConsole: false });
    const logHandler = jest.fn();
    
    logger.on("log", logHandler);
    logger.info("Test");

    const call = logHandler.mock.calls[0][0];
    expect(call.message).toBe("Test");
    expect(call.requestId).toBeUndefined();
    expect(call.serverName).toBeUndefined();
    expect(call.toolName).toBeUndefined();
  });
});