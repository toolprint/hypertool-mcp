/**
 * Logging system interfaces and types
 */

import { RuntimeOptions } from "../../types/runtime.js";

// Type for log context - can be any serializable object, Error, or unknown value
export type LogContext =
  | Record<string, unknown>
  | string
  | number
  | boolean
  | null
  | undefined
  | Error
  | unknown;

export type LogLevel = "fatal" | "error" | "warn" | "info" | "debug" | "trace";

export interface LoggingConfig {
  level: LogLevel;
  enableConsole: boolean;
  enableFile: boolean;
  serverName: string;
  format: "json" | "pretty";
}

/**
 * Unified logger interface that both Pino and mcp-logger implementations must support
 */
export interface LoggerInterface {
  // Core logging methods
  fatal(message: string, context?: LogContext): void;
  error(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  debug(message: string, context?: LogContext): void;
  trace(message: string, context?: LogContext): void;

  // Child logger creation
  child(bindings: { module?: string; [key: string]: unknown }): LoggerInterface;

  // Configuration updates
  updateConfig(config: Partial<LoggingConfig>): void;

  // Legacy compatibility - access to underlying logger
  get pino(): any;
  get mcp(): any;
}

/**
 * Constructor interface for logger implementations
 */
export interface LoggerConstructor {
  new (
    config?: Partial<LoggingConfig>,
    runtimeOptions?: RuntimeOptions
  ): LoggerInterface;
}

/**
 * Logger factory interface
 */
export interface LoggerFactory {
  createLogger(
    config?: Partial<LoggingConfig>,
    runtimeOptions?: RuntimeOptions
  ): Promise<LoggerInterface>;
  createChildLogger(bindings: { module: string }): LoggerInterface;
}
