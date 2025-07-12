/**
 * Tests for error handling system
 */

import {
  MetaMCPError,
  ConnectionError,
  ServerUnavailableError,
  ToolError,
  ToolNotFoundError,
  ValidationError,
  RoutingError,
  HealthCheckError,
  TimeoutError,
  DiscoveryError,
  ConfigurationError,
  isRetryableError,
  getErrorCode,
  getUserFriendlyMessage,
  ERROR_CODES,
} from "./index";

describe("MetaMCPError", () => {
  test("should create base error with all properties", () => {
    const error = new ConnectionError(
      "Test connection error",
      "test-server",
      true,
      { extra: "context" }
    );

    expect(error.message).toBe("Test connection error");
    expect(error.code).toBe("CONNECTION_ERROR");
    expect(error.category).toBe("connection");
    expect(error.isRetryable).toBe(true);
    expect(error.serverName).toBe("test-server");
    expect(error.context).toEqual({ extra: "context", serverName: "test-server" });
    expect(error.timestamp).toBeInstanceOf(Date);
  });

  test("should generate proper stack trace", () => {
    const error = new ConnectionError("Test error");
    expect(error.stack).toBeDefined();
    expect(error.stack).toContain("ConnectionError");
  });

  test("should serialize to JSON properly", () => {
    const error = new ConnectionError(
      "Test error",
      "test-server",
      true,
      { extra: "data" }
    );

    const json = error.toJSON();
    expect(json).toMatchObject({
      name: "ConnectionError",
      message: "Test error",
      code: "CONNECTION_ERROR",
      category: "connection",
      isRetryable: true,
      context: { extra: "data", serverName: "test-server" },
    });
    expect(json.timestamp).toBeDefined();
    expect(json.stack).toBeDefined();
  });
});

describe("Specific Error Types", () => {
  test("ConnectionError should have correct properties", () => {
    const error = new ConnectionError("Connection failed", "server1", false);
    
    expect(error.code).toBe(ERROR_CODES.CONNECTION_ERROR);
    expect(error.category).toBe("connection");
    expect(error.serverName).toBe("server1");
    expect(error.isRetryable).toBe(false);
    expect(error.getUserMessage()).toBe("Cannot connect to server 'server1': Connection failed");
  });

  test("ServerUnavailableError should format message correctly", () => {
    const error = new ServerUnavailableError("test-server", "maintenance");
    
    expect(error.code).toBe(ERROR_CODES.SERVER_UNAVAILABLE);
    expect(error.serverName).toBe("test-server");
    expect(error.isRetryable).toBe(true);
    expect(error.getUserMessage()).toBe("Server 'test-server' is currently unavailable. Please try again later.");
  });

  test("ToolNotFoundError should provide helpful message", () => {
    const error = new ToolNotFoundError("missing-tool");
    
    expect(error.code).toBe(ERROR_CODES.TOOL_NOT_FOUND);
    expect(error.toolName).toBe("missing-tool");
    expect(error.isRetryable).toBe(false);
    expect(error.getUserMessage()).toBe("Tool 'missing-tool' is not available. Check your configuration or try a different tool.");
  });

  test("ValidationError should include field information", () => {
    const error = new ValidationError("Value is required", "username", null);
    
    expect(error.code).toBe(ERROR_CODES.VALIDATION_ERROR);
    expect(error.field).toBe("username");
    expect(error.value).toBe(null);
    expect(error.isRetryable).toBe(false);
    expect(error.getUserMessage()).toBe("Invalid username: Value is required");
  });

  test("TimeoutError should include operation details", () => {
    const error = new TimeoutError("database-query", 5000);
    
    expect(error.code).toBe(ERROR_CODES.TIMEOUT_ERROR);
    expect(error.operation).toBe("database-query");
    expect(error.timeoutMs).toBe(5000);
    expect(error.isRetryable).toBe(true);
    expect(error.getUserMessage()).toBe("Operation timed out. Please try again.");
  });

  test("ConfigurationError should not be retryable", () => {
    const error = new ConfigurationError("Invalid config format");
    
    expect(error.code).toBe(ERROR_CODES.CONFIG_ERROR);
    expect(error.isRetryable).toBe(false);
    expect(error.getUserMessage()).toBe("Configuration issue: Invalid config format");
  });
});

describe("Error Utilities", () => {
  test("isRetryableError should identify retryable errors", () => {
    const retryableError = new ConnectionError("Connection failed", "server", true);
    const nonRetryableError = new ValidationError("Invalid input");
    const regularError = new Error("Regular error");

    expect(isRetryableError(retryableError)).toBe(true);
    expect(isRetryableError(nonRetryableError)).toBe(false);
    expect(isRetryableError(regularError)).toBe(false);
  });

  test("getErrorCode should extract error codes", () => {
    const mcpError = new ToolError("Tool failed", "test-tool");
    const regularError = new Error("Regular error");

    expect(getErrorCode(mcpError)).toBe(ERROR_CODES.TOOL_ERROR);
    expect(getErrorCode(regularError)).toBe("UNKNOWN_ERROR");
  });

  test("getUserFriendlyMessage should provide user messages", () => {
    const mcpError = new ServerUnavailableError("test-server");
    const regularError = new Error("Internal system error");

    expect(getUserFriendlyMessage(mcpError)).toBe(
      "Server 'test-server' is currently unavailable. Please try again later."
    );
    expect(getUserFriendlyMessage(regularError)).toBe(
      "An unexpected error occurred. Please try again."
    );
  });
});

describe("Error Context", () => {
  test("should preserve context through error chain", () => {
    const originalContext = { requestId: "123", operation: "tool-call" };
    const error = new ToolError("Execution failed", "test-tool", "test-server", originalContext);

    expect(error.context).toMatchObject({
      ...originalContext,
      toolName: "test-tool",
      serverName: "test-server",
    });
  });

  test("should handle undefined context gracefully", () => {
    const error = new ConnectionError("Connection failed");
    
    expect(error.context).toEqual({ serverName: undefined });
  });
});

describe("Error Inheritance", () => {
  test("should maintain instanceof relationships", () => {
    const connectionError = new ConnectionError("Test");
    
    expect(connectionError instanceof MetaMCPError).toBe(true);
    expect(connectionError instanceof ConnectionError).toBe(true);
    expect(connectionError instanceof Error).toBe(true);
  });

  test("should preserve error name", () => {
    const errors = [
      new ConnectionError("test"),
      new ServerUnavailableError("server"),
      new ToolNotFoundError("tool"),
      new ValidationError("test"),
      new TimeoutError("op", 1000),
    ];

    errors.forEach(error => {
      expect(error.name).toBe(error.constructor.name);
    });
  });
});

describe("Error Messages", () => {
  test("should provide different messages for getUserMessage vs message", () => {
    const error = new ConnectionError(
      "ECONNREFUSED: Connection refused by server at localhost:3000",
      "test-server"
    );

    expect(error.message).toBe("ECONNREFUSED: Connection refused by server at localhost:3000");
    expect(error.getUserMessage()).toBe("Cannot connect to server 'test-server': ECONNREFUSED: Connection refused by server at localhost:3000");
  });

  test("should handle special cases in user messages", () => {
    const toolError = new ToolError("Tool execution failed", "calculator", "math-server");
    expect(toolError.getUserMessage()).toBe("Tool 'calculator' error: Tool execution failed");

    const routingError = new RoutingError("No route found", "unknown-tool");
    expect(routingError.getUserMessage()).toBe("Request routing failed: No route found");
  });
});