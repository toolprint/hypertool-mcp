/**
 * Structured logging framework
 */

import { EventEmitter } from "events";
import { MetaMCPError } from "../errors/index.js";

/**
 * Log levels
 */
export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3,
}

/**
 * Log level strings
 */
export const LOG_LEVEL_NAMES = {
  [LogLevel.ERROR]: "ERROR",
  [LogLevel.WARN]: "WARN",
  [LogLevel.INFO]: "INFO",
  [LogLevel.DEBUG]: "DEBUG",
} as const;

/**
 * Log entry interface
 */
export interface LogEntry {
  timestamp: Date;
  level: LogLevel;
  component: string;
  message: string;
  context?: Record<string, any>;
  error?: Error;
  requestId?: string;
  serverName?: string;
  toolName?: string;
}

/**
 * Logger configuration
 */
export interface LoggerConfig {
  level: LogLevel;
  enableConsole: boolean;
  enableFile: boolean;
  filePath?: string;
  enableStructured: boolean;
  component?: string;
  maxFileSize?: number;
  maxFiles?: number;
}

/**
 * Log formatter interface
 */
export interface LogFormatter {
  format(entry: LogEntry): string;
}

/**
 * Console log formatter
 */
export class ConsoleFormatter implements LogFormatter {
  format(entry: LogEntry): string {
    const timestamp = entry.timestamp.toISOString();
    const level = LOG_LEVEL_NAMES[entry.level];
    const component = entry.component ? `[${entry.component}]` : "";
    
    let message = `${timestamp} ${level} ${component} ${entry.message}`;
    
    if (entry.context && Object.keys(entry.context).length > 0) {
      message += ` ${JSON.stringify(entry.context)}`;
    }
    
    if (entry.error) {
      message += `\nError: ${entry.error.message}`;
      if (entry.error.stack) {
        message += `\nStack: ${entry.error.stack}`;
      }
    }
    
    return message;
  }
}

/**
 * Structured JSON formatter
 */
export class JsonFormatter implements LogFormatter {
  format(entry: LogEntry): string {
    const logObject = {
      timestamp: entry.timestamp.toISOString(),
      level: LOG_LEVEL_NAMES[entry.level],
      component: entry.component,
      message: entry.message,
      ...(entry.context && { context: entry.context }),
      ...(entry.requestId && { requestId: entry.requestId }),
      ...(entry.serverName && { serverName: entry.serverName }),
      ...(entry.toolName && { toolName: entry.toolName }),
      ...(entry.error && {
        error: {
          name: entry.error.name,
          message: entry.error.message,
          stack: entry.error.stack,
          ...(entry.error instanceof MetaMCPError && {
            code: entry.error.code,
            category: entry.error.category,
            isRetryable: entry.error.isRetryable,
          }),
        },
      }),
    };
    
    return JSON.stringify(logObject);
  }
}

/**
 * Logger implementation
 */
export class Logger extends EventEmitter {
  private config: LoggerConfig;
  private formatter: LogFormatter;

  constructor(config: Partial<LoggerConfig> = {}) {
    super();
    
    this.config = {
      level: LogLevel.INFO,
      enableConsole: true,
      enableFile: false,
      enableStructured: false,
      ...config,
    };

    this.formatter = this.config.enableStructured
      ? new JsonFormatter()
      : new ConsoleFormatter();
  }

  /**
   * Update logger configuration
   */
  configure(config: Partial<LoggerConfig>): void {
    this.config = { ...this.config, ...config };
    
    this.formatter = this.config.enableStructured
      ? new JsonFormatter()
      : new ConsoleFormatter();
  }

  /**
   * Set log level
   */
  setLevel(level: LogLevel): void {
    this.config.level = level;
  }

  /**
   * Get current log level
   */
  getLevel(): LogLevel {
    return this.config.level;
  }

  /**
   * Check if level should be logged
   */
  shouldLog(level: LogLevel): boolean {
    return level <= this.config.level;
  }

  /**
   * Create child logger with component context
   */
  child(component: string): Logger {
    const childLogger = new Logger({
      ...this.config,
      component,
    });
    return childLogger;
  }

  /**
   * Log an error
   */
  error(message: string, context?: Record<string, any>, error?: Error): void {
    this.log(LogLevel.ERROR, message, context, error);
  }

  /**
   * Log a warning
   */
  warn(message: string, context?: Record<string, any>): void {
    this.log(LogLevel.WARN, message, context);
  }

  /**
   * Log info
   */
  info(message: string, context?: Record<string, any>): void {
    this.log(LogLevel.INFO, message, context);
  }

  /**
   * Log debug
   */
  debug(message: string, context?: Record<string, any>): void {
    this.log(LogLevel.DEBUG, message, context);
  }

  /**
   * Log connection events
   */
  logConnection(
    event: string,
    serverName: string,
    context?: Record<string, any>
  ): void {
    this.info(`Connection ${event}`, {
      ...context,
      serverName,
      event,
    });
  }

  /**
   * Log tool call events
   */
  logToolCall(
    event: string,
    toolName: string,
    serverName?: string,
    requestId?: string,
    context?: Record<string, any>
  ): void {
    this.info(`Tool call ${event}`, {
      ...context,
      toolName,
      serverName,
      requestId,
      event,
    });
  }

  /**
   * Log health check events
   */
  logHealthCheck(
    serverName: string,
    state: string,
    context?: Record<string, any>
  ): void {
    this.info("Health check result", {
      ...context,
      serverName,
      state,
    });
  }

  /**
   * Log discovery events
   */
  logDiscovery(
    event: string,
    serverName?: string,
    toolCount?: number,
    context?: Record<string, any>
  ): void {
    this.info(`Discovery ${event}`, {
      ...context,
      serverName,
      toolCount,
      event,
    });
  }

  /**
   * Log server lifecycle events
   */
  logServerLifecycle(
    event: string,
    context?: Record<string, any>
  ): void {
    this.info(`Server ${event}`, {
      ...context,
      event,
    });
  }

  /**
   * Core logging method
   */
  private log(
    level: LogLevel,
    message: string,
    context?: Record<string, any>,
    error?: Error
  ): void {
    if (!this.shouldLog(level)) {
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date(),
      level,
      component: this.config.component || "MetaMCP",
      message,
      context,
      error,
    };

    // Extract common fields from context
    if (context) {
      if (context.requestId) {
        entry.requestId = context.requestId;
      }
      if (context.serverName) {
        entry.serverName = context.serverName;
      }
      if (context.toolName) {
        entry.toolName = context.toolName;
      }
    }

    this.emit("log", entry);
    this.writeLog(entry);
  }

  /**
   * Write log entry to outputs
   */
  private writeLog(entry: LogEntry): void {
    const formatted = this.formatter.format(entry);

    // Console output
    if (this.config.enableConsole) {
      switch (entry.level) {
        case LogLevel.ERROR:
          console.error(formatted);
          break;
        case LogLevel.WARN:
          console.warn(formatted);
          break;
        case LogLevel.INFO:
          console.info(formatted);
          break;
        case LogLevel.DEBUG:
          console.debug(formatted);
          break;
      }
    }

    // File output (simplified - in production would use proper file rotation)
    if (this.config.enableFile && this.config.filePath) {
      // Note: In a real implementation, this would use async file writes
      // and proper file rotation. For now, it's a placeholder.
      this.emit("fileLog", { path: this.config.filePath, content: formatted });
    }
  }
}

/**
 * Global logger instance
 */
let globalLogger: Logger | null = null;

/**
 * Initialize global logger
 */
export function initializeLogger(config?: Partial<LoggerConfig>): Logger {
  globalLogger = new Logger(config);
  return globalLogger;
}

/**
 * Get global logger instance
 */
export function getLogger(): Logger {
  if (!globalLogger) {
    globalLogger = new Logger();
  }
  return globalLogger;
}

/**
 * Create component-specific logger
 */
export function createLogger(component: string, config?: Partial<LoggerConfig>): Logger {
  return new Logger({ ...config, component });
}

/**
 * Log level utilities
 */
export const LogLevelUtils = {
  fromString(level: string): LogLevel | undefined {
    switch (level.toUpperCase()) {
      case "ERROR":
        return LogLevel.ERROR;
      case "WARN":
      case "WARNING":
        return LogLevel.WARN;
      case "INFO":
        return LogLevel.INFO;
      case "DEBUG":
        return LogLevel.DEBUG;
      default:
        return undefined;
    }
  },

  toString(level: LogLevel): string {
    return LOG_LEVEL_NAMES[level];
  },

  isValidLevel(level: string): boolean {
    return this.fromString(level) !== undefined;
  },
};