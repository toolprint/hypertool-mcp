/**
 * Custom error classes
 */

/**
 * Base error class for all application errors
 */
export abstract class MetaMCPError extends Error {
  public readonly code: string;
  public readonly category: string;
  public readonly isRetryable: boolean;
  public readonly timestamp: Date;
  public readonly context?: Record<string, any>;

  constructor(
    message: string,
    code: string,
    category: string,
    isRetryable: boolean = false,
    context?: Record<string, any>
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.category = category;
    this.isRetryable = isRetryable;
    this.timestamp = new Date();
    this.context = context;

    // Maintains proper stack trace for where error was thrown
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Get error details as object
   */
  toJSON(): Record<string, any> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      category: this.category,
      isRetryable: this.isRetryable,
      timestamp: this.timestamp.toISOString(),
      context: this.context,
      stack: this.stack,
    };
  }

  /**
   * Get user-friendly error message
   */
  getUserMessage(): string {
    return this.message;
  }
}

/**
 * Configuration-related errors
 */
export class ConfigurationError extends MetaMCPError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, "CONFIG_ERROR", "configuration", false, context);
  }

  getUserMessage(): string {
    return `Configuration issue: ${this.message}`;
  }
}

/**
 * Connection-related errors
 */
export class ConnectionError extends MetaMCPError {
  public readonly serverName?: string;

  constructor(
    message: string,
    serverName?: string,
    isRetryable: boolean = true,
    context?: Record<string, any>
  ) {
    super(message, "CONNECTION_ERROR", "connection", isRetryable, {
      ...context,
      serverName,
    });
    this.serverName = serverName;
  }

  getUserMessage(): string {
    if (this.serverName) {
      return `Cannot connect to server '${this.serverName}': ${this.message}`;
    }
    return `Connection error: ${this.message}`;
  }
}

/**
 * Server unavailable errors
 */
export class ServerUnavailableError extends MetaMCPError {
  public readonly serverName: string;

  constructor(
    serverName: string,
    reason?: string,
    context?: Record<string, any>
  ) {
    const message = reason
      ? `Server '${serverName}' is unavailable: ${reason}`
      : `Server '${serverName}' is unavailable`;

    super(message, "SERVER_UNAVAILABLE", "availability", true, {
      ...context,
      serverName,
      reason,
    });
    this.serverName = serverName;
  }

  getUserMessage(): string {
    return `Server '${this.serverName}' is currently unavailable. Please try again later.`;
  }
}

/**
 * Tool-related errors
 */
export class ToolError extends MetaMCPError {
  public readonly toolName: string;
  public readonly serverName?: string;

  constructor(
    message: string,
    toolName: string,
    serverName?: string,
    context?: Record<string, any>
  ) {
    super(message, "TOOL_ERROR", "tool", false, {
      ...context,
      toolName,
      serverName,
    });
    this.toolName = toolName;
    this.serverName = serverName;
  }

  getUserMessage(): string {
    return `Tool '${this.toolName}' error: ${this.message}`;
  }
}

/**
 * Tool not found errors
 */
export class ToolNotFoundError extends MetaMCPError {
  public readonly toolName: string;

  constructor(toolName: string, context?: Record<string, any>) {
    super(`Tool '${toolName}' not found`, "TOOL_NOT_FOUND", "tool", false, {
      ...context,
      toolName,
    });
    this.toolName = toolName;
  }

  getUserMessage(): string {
    return `Tool '${this.toolName}' is not available. Check your configuration or try a different tool.`;
  }
}

/**
 * Validation errors
 */
export class ValidationError extends MetaMCPError {
  public readonly field?: string;
  public readonly value?: any;

  constructor(
    message: string,
    field?: string,
    value?: any,
    context?: Record<string, any>
  ) {
    super(message, "VALIDATION_ERROR", "validation", false, {
      ...context,
      field,
      value,
    });
    this.field = field;
    this.value = value;
  }

  getUserMessage(): string {
    if (this.field) {
      return `Invalid ${this.field}: ${this.message}`;
    }
    return `Validation error: ${this.message}`;
  }
}

/**
 * Request routing errors
 */
export class RoutingError extends MetaMCPError {
  public readonly toolName?: string;
  public readonly serverName?: string;

  constructor(
    message: string,
    toolName?: string,
    serverName?: string,
    context?: Record<string, any>
  ) {
    super(message, "ROUTING_ERROR", "routing", false, {
      ...context,
      toolName,
      serverName,
    });
    this.toolName = toolName;
    this.serverName = serverName;
  }

  getUserMessage(): string {
    return `Request routing failed: ${this.message}`;
  }
}

/**
 * Health check errors
 */
export class HealthCheckError extends MetaMCPError {
  public readonly serverName: string;

  constructor(
    message: string,
    serverName: string,
    context?: Record<string, any>
  ) {
    super(message, "HEALTH_CHECK_ERROR", "health", true, {
      ...context,
      serverName,
    });
    this.serverName = serverName;
  }

  getUserMessage(): string {
    return `Health check failed for server '${this.serverName}'`;
  }
}

/**
 * Timeout errors
 */
export class TimeoutError extends MetaMCPError {
  public readonly operation: string;
  public readonly timeoutMs: number;

  constructor(
    operation: string,
    timeoutMs: number,
    context?: Record<string, any>
  ) {
    super(
      `Operation '${operation}' timed out after ${timeoutMs}ms`,
      "TIMEOUT_ERROR",
      "timeout",
      true,
      { ...context, operation, timeoutMs }
    );
    this.operation = operation;
    this.timeoutMs = timeoutMs;
  }

  getUserMessage(): string {
    return `Operation timed out. Please try again.`;
  }
}

/**
 * Discovery errors
 */
export class DiscoveryError extends MetaMCPError {
  public readonly serverName?: string;

  constructor(
    message: string,
    serverName?: string,
    context?: Record<string, any>
  ) {
    super(message, "DISCOVERY_ERROR", "discovery", true, {
      ...context,
      serverName,
    });
    this.serverName = serverName;
  }

  getUserMessage(): string {
    return `Tool discovery failed: ${this.message}`;
  }
}

/**
 * Error codes for easy reference
 */
export const ERROR_CODES = {
  CONFIG_ERROR: "CONFIG_ERROR",
  CONNECTION_ERROR: "CONNECTION_ERROR",
  SERVER_UNAVAILABLE: "SERVER_UNAVAILABLE",
  TOOL_ERROR: "TOOL_ERROR",
  TOOL_NOT_FOUND: "TOOL_NOT_FOUND",
  VALIDATION_ERROR: "VALIDATION_ERROR",
  ROUTING_ERROR: "ROUTING_ERROR",
  HEALTH_CHECK_ERROR: "HEALTH_CHECK_ERROR",
  TIMEOUT_ERROR: "TIMEOUT_ERROR",
  DISCOVERY_ERROR: "DISCOVERY_ERROR",
} as const;

/**
 * Error categories for filtering and handling
 */
export const ERROR_CATEGORIES = {
  CONFIGURATION: "configuration",
  CONNECTION: "connection",
  AVAILABILITY: "availability",
  TOOL: "tool",
  VALIDATION: "validation",
  ROUTING: "routing",
  HEALTH: "health",
  TIMEOUT: "timeout",
  DISCOVERY: "discovery",
} as const;

/**
 * Utility function to check if error is retryable
 */
export function isRetryableError(error: Error): boolean {
  return error instanceof MetaMCPError && error.isRetryable;
}

/**
 * Utility function to extract error code
 */
export function getErrorCode(error: Error): string {
  if (error instanceof MetaMCPError) {
    return error.code;
  }
  return "UNKNOWN_ERROR";
}

/**
 * Utility function to get user-friendly message
 */
export function getUserFriendlyMessage(error: Error): string {
  if (error instanceof MetaMCPError) {
    return error.getUserMessage();
  }
  return "An unexpected error occurred. Please try again.";
}
