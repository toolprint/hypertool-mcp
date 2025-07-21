/**
 * User-friendly error messages and message templates
 */

import { MetaMCPError, ERROR_CODES } from "./index.js";

/**
 * Common error scenarios and their user-friendly messages
 */
export const ERROR_MESSAGES = {
  // Configuration errors
  INVALID_CONFIG:
    "Configuration file is invalid or corrupted. Please check your .mcp.json file.",
  MISSING_CONFIG:
    "Configuration file not found. Please create a .mcp.json file with your server configurations.",
  INVALID_SERVER_CONFIG:
    "Server configuration is invalid. Please check the server settings in your configuration file.",

  // Connection errors
  SERVER_NOT_FOUND:
    "The specified server could not be found. Please check that the server name is correct.",
  CONNECTION_REFUSED:
    "Unable to connect to the server. Please ensure the server is running and accessible.",
  CONNECTION_TIMEOUT:
    "Connection attempt timed out. The server may be overloaded or unreachable.",
  CONNECTION_LOST:
    "Connection to the server was lost. The system will attempt to reconnect automatically.",

  // Server availability
  SERVER_UNAVAILABLE:
    "The server is temporarily unavailable. Please try again in a few moments.",
  SERVER_MAINTENANCE:
    "The server is currently undergoing maintenance. Please try again later.",
  SERVER_OVERLOADED:
    "The server is currently overloaded. Please try again in a few moments.",

  // Tool errors
  TOOL_NOT_FOUND:
    "The requested tool is not available. Please check the tool name or your configuration.",
  TOOL_DISABLED:
    "This tool has been disabled. Please contact your administrator for assistance.",
  TOOL_EXECUTION_FAILED:
    "The tool failed to execute. Please check your parameters and try again.",
  INVALID_TOOL_PARAMS:
    "Invalid parameters provided to the tool. Please check the tool documentation.",

  // Authentication and authorization
  UNAUTHORIZED:
    "You are not authorized to perform this action. Please check your permissions.",
  AUTHENTICATION_FAILED:
    "Authentication failed. Please check your credentials.",
  TOKEN_EXPIRED: "Your session has expired. Please log in again.",

  // Rate limiting
  RATE_LIMITED: "Too many requests. Please wait a moment before trying again.",
  QUOTA_EXCEEDED:
    "You have exceeded your usage quota. Please contact your administrator.",

  // System errors
  INTERNAL_ERROR:
    "An internal error occurred. Our team has been notified and is working to resolve the issue.",
  SERVICE_DEGRADED:
    "The service is experiencing degraded performance. Some features may be unavailable.",
  MAINTENANCE_MODE:
    "The system is currently in maintenance mode. Please try again later.",

  // Network errors
  NETWORK_ERROR:
    "A network error occurred. Please check your internet connection and try again.",
  DNS_ERROR:
    "Unable to resolve server address. Please check your network configuration.",
  SSL_ERROR: "SSL/TLS connection error. Please check your security settings.",

  // Validation errors
  MISSING_REQUIRED_FIELD:
    "A required field is missing. Please provide all necessary information.",
  INVALID_FORMAT:
    "The provided data is in an invalid format. Please check and correct your input.",
  VALUE_OUT_OF_RANGE: "The provided value is outside the acceptable range.",

  // General fallback
  UNKNOWN_ERROR:
    "An unexpected error occurred. Please try again, and contact support if the problem persists.",
} as const;

/**
 * Error message templates with parameter substitution
 */
export const ERROR_TEMPLATES = {
  SERVER_UNAVAILABLE_WITH_NAME:
    "Server '{serverName}' is currently unavailable. Please try again later.",
  TOOL_NOT_FOUND_WITH_NAME:
    "Tool '{toolName}' is not available. Please check your configuration.",
  CONNECTION_FAILED_WITH_SERVER:
    "Failed to connect to server '{serverName}'. Please ensure it is running and accessible.",
  TIMEOUT_WITH_OPERATION:
    "Operation '{operation}' timed out after {timeout}ms. Please try again.",
  VALIDATION_FAILED_WITH_FIELD: "Invalid value for field '{field}': {reason}",
  TOOL_ERROR_WITH_DETAILS: "Tool '{toolName}' failed: {error}",
  SERVER_ERROR_WITH_CODE: "Server error (code: {code}): {message}",
  RATE_LIMITED_WITH_RETRY:
    "Too many requests. Please wait {retryAfter} seconds before trying again.",
  QUOTA_EXCEEDED_WITH_LIMIT:
    "Usage quota exceeded. Limit: {limit}, Current: {current}. Resets at {resetTime}.",
  CIRCUIT_BREAKER_OPEN:
    "Service '{serviceName}' is temporarily unavailable due to repeated failures. Please try again in {recoveryTime} seconds.",
} as const;

/**
 * Suggestion messages for common errors
 */
export const ERROR_SUGGESTIONS = {
  [ERROR_CODES.CONNECTION_ERROR]: [
    "Check that the server is running and accessible",
    "Verify your network connection",
    "Ensure the server configuration is correct",
    "Try again in a few moments",
  ],
  [ERROR_CODES.SERVER_UNAVAILABLE]: [
    "Wait a few moments and try again",
    "Check if the server is undergoing maintenance",
    "Verify the server is properly configured",
    "Contact your administrator if the issue persists",
  ],
  [ERROR_CODES.TOOL_NOT_FOUND]: [
    "Check the tool name spelling",
    "Verify the tool is configured in your .mcp.json file",
    "Ensure the underlying server is connected",
    "Check if the tool has been renamed or removed",
  ],
  [ERROR_CODES.CONFIG_ERROR]: [
    "Review your .mcp.json configuration file",
    "Check for syntax errors in the configuration",
    "Verify all required fields are present",
    "Refer to the configuration documentation",
  ],
  [ERROR_CODES.VALIDATION_ERROR]: [
    "Check that all required parameters are provided",
    "Verify parameter types and formats",
    "Review the tool documentation for parameter requirements",
    "Ensure values are within acceptable ranges",
  ],
  [ERROR_CODES.TIMEOUT_ERROR]: [
    "Try the operation again",
    "Check your network connection speed",
    "Consider breaking large operations into smaller parts",
    "Contact support if timeouts persist",
  ],
} as const;

/**
 * Error category descriptions for users
 */
export const ERROR_CATEGORY_DESCRIPTIONS = {
  configuration: "Issues with server or tool configuration",
  connection: "Problems connecting to underlying servers",
  availability: "Temporary server or service unavailability",
  tool: "Issues with tool execution or availability",
  validation: "Invalid parameters or request format",
  routing: "Problems routing requests to the correct server",
  health: "Server health monitoring issues",
  timeout: "Operations that took too long to complete",
  discovery: "Issues discovering available tools",
} as const;

/**
 * Utility class for generating user-friendly error messages
 */
export class ErrorMessageGenerator {
  /**
   * Generate a user-friendly message for an error
   */
  static getUserMessage(error: Error): string {
    if (error instanceof MetaMCPError) {
      return error.getUserMessage();
    }

    // Try to map common error patterns to friendly messages
    const message = error.message.toLowerCase();

    if (
      message.includes("connection refused") ||
      message.includes("econnrefused")
    ) {
      return ERROR_MESSAGES.CONNECTION_REFUSED;
    }

    if (message.includes("timeout") || message.includes("etimedout")) {
      return ERROR_MESSAGES.CONNECTION_TIMEOUT;
    }

    if (message.includes("not found") || message.includes("404")) {
      return ERROR_MESSAGES.TOOL_NOT_FOUND;
    }

    if (message.includes("unauthorized") || message.includes("401")) {
      return ERROR_MESSAGES.UNAUTHORIZED;
    }

    if (message.includes("rate limit") || message.includes("429")) {
      return ERROR_MESSAGES.RATE_LIMITED;
    }

    if (message.includes("network") || message.includes("dns")) {
      return ERROR_MESSAGES.NETWORK_ERROR;
    }

    // Default fallback
    return ERROR_MESSAGES.UNKNOWN_ERROR;
  }

  /**
   * Generate message from template with parameter substitution
   */
  static fromTemplate(template: string, params: Record<string, any>): string {
    let message = template;

    for (const [key, value] of Object.entries(params)) {
      const placeholder = `{${key}}`;
      message = message.replace(new RegExp(placeholder, "g"), String(value));
    }

    return message;
  }

  /**
   * Get suggestions for an error
   */
  static getSuggestions(error: Error): string[] {
    if (error instanceof MetaMCPError) {
      const suggestions =
        ERROR_SUGGESTIONS[error.code as keyof typeof ERROR_SUGGESTIONS];
      return suggestions ? [...suggestions] : [];
    }

    return [];
  }

  /**
   * Generate a comprehensive error response for users
   */
  static generateErrorResponse(error: Error, includeDetails: boolean = false) {
    const userMessage = this.getUserMessage(error);
    const suggestions = this.getSuggestions(error);

    const response: any = {
      error: true,
      message: userMessage,
      timestamp: new Date().toISOString(),
    };

    if (suggestions.length > 0) {
      response.suggestions = suggestions;
    }

    if (error instanceof MetaMCPError) {
      response.category = error.category;
      response.isRetryable = error.isRetryable;

      if (includeDetails) {
        response.code = error.code;
        response.context = error.context;
      }
    }

    if (includeDetails) {
      response.details = {
        originalMessage: error.message,
        stack: error.stack,
      };
    }

    return response;
  }

  /**
   * Format error for logging (with full details)
   */
  static formatForLogging(error: Error, context?: Record<string, any>) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString(),
      ...(error instanceof MetaMCPError && {
        code: error.code,
        category: error.category,
        isRetryable: error.isRetryable,
        errorContext: error.context,
      }),
      ...(context && { context }),
    };
  }

  /**
   * Check if error should be shown to user
   */
  static shouldShowToUser(error: Error): boolean {
    // Don't show internal errors or sensitive information
    if (
      error.message.includes("INTERNAL_") ||
      error.message.includes("password") ||
      error.message.includes("token") ||
      error.message.includes("secret")
    ) {
      return false;
    }

    return true;
  }
}

/**
 * Common error scenarios with pre-built responses
 */
export const COMMON_ERROR_RESPONSES = {
  serverUnavailable: (serverName: string) => ({
    content: [
      {
        type: "text",
        text: ErrorMessageGenerator.fromTemplate(
          ERROR_TEMPLATES.SERVER_UNAVAILABLE_WITH_NAME,
          { serverName }
        ),
      },
    ],
    isError: true,
    suggestions: ERROR_SUGGESTIONS[ERROR_CODES.SERVER_UNAVAILABLE],
  }),

  toolNotFound: (toolName: string) => ({
    content: [
      {
        type: "text",
        text: ErrorMessageGenerator.fromTemplate(
          ERROR_TEMPLATES.TOOL_NOT_FOUND_WITH_NAME,
          { toolName }
        ),
      },
    ],
    isError: true,
    suggestions: ERROR_SUGGESTIONS[ERROR_CODES.TOOL_NOT_FOUND],
  }),

  connectionFailed: (serverName: string, reason?: string) => ({
    content: [
      {
        type: "text",
        text:
          ErrorMessageGenerator.fromTemplate(
            ERROR_TEMPLATES.CONNECTION_FAILED_WITH_SERVER,
            { serverName }
          ) + (reason ? ` Reason: ${reason}` : ""),
      },
    ],
    isError: true,
    suggestions: ERROR_SUGGESTIONS[ERROR_CODES.CONNECTION_ERROR],
  }),

  validationFailed: (field: string, reason: string) => ({
    content: [
      {
        type: "text",
        text: ErrorMessageGenerator.fromTemplate(
          ERROR_TEMPLATES.VALIDATION_FAILED_WITH_FIELD,
          { field, reason }
        ),
      },
    ],
    isError: true,
    suggestions: ERROR_SUGGESTIONS[ERROR_CODES.VALIDATION_ERROR],
  }),
};
