/**
 * Direct Pino logging implementation with proper memory management
 * Based on original implementation from hypertool-mcp commit 9340024b65482cff004a83432c254bd9d6abd939
 */

import pino from "pino";
import { join } from "path";
import { homedir } from "os";
import { createHash } from "crypto";
import { APP_TECHNICAL_NAME, BRAND_NAME } from "../../config/appConfig.js";
import { RuntimeOptions } from "../../types/runtime.js";
import {
  LoggerInterface,
  LoggingConfig,
  LogContext,
  LogLevel,
} from "./interfaces.js";

export const DEFAULT_PINO_LOGGING_CONFIG: LoggingConfig = {
  level: process.env.NODE_ENV === "development" ? "debug" : "info",
  enableConsole: true,
  enableFile: true,
  serverName: APP_TECHNICAL_NAME,
  format: "pretty",
};

// Shared transport instances to prevent memory leaks
let sharedStdoutTransport: any = null;
let sharedStderrTransport: any = null;
let sharedFileTransport: any = null;

// Cache for Pino instances by configuration hash
const pinoInstanceCache = new Map<string, pino.Logger>();

/**
 * PinoLogger class with proper child logger caching and transport management
 */
export class PinoLogger implements LoggerInterface {
  private pinoLogger: pino.Logger;
  private config: LoggingConfig;
  private runtimeOptions?: RuntimeOptions;
  private childLoggerCache = new Map<string, PinoLogger>();
  private configHash: string;

  constructor(
    config: Partial<LoggingConfig> = {},
    runtimeOptions?: RuntimeOptions
  ) {
    this.config = { ...DEFAULT_PINO_LOGGING_CONFIG, ...config };
    this.runtimeOptions = runtimeOptions;

    // Determine format from environment variable or config
    if (process.env.LOG_FORMAT === "json") {
      this.config.format = "json";
    }

    // Override level if provided in runtime options
    if (runtimeOptions?.logLevel) {
      this.config.level = runtimeOptions.logLevel as LogLevel;
    }

    // Calculate configuration hash for caching
    this.configHash = this.calculateConfigHash();

    // Get or create Pino instance
    this.pinoLogger = this.getOrCreatePinoInstance();
  }

  /**
   * Calculate a hash of the configuration for caching
   */
  private calculateConfigHash(): string {
    // Create a normalized config object for hashing
    const normalizedConfig = {
      level: this.config.level,
      enableConsole: this.config.enableConsole,
      enableFile: this.config.enableFile,
      serverName: this.config.serverName,
      format: this.config.format,
      transport: this.runtimeOptions?.transport || "stdio",
    };

    const configString = JSON.stringify(
      normalizedConfig,
      Object.keys(normalizedConfig).sort()
    );
    return createHash("sha256").update(configString).digest("hex");
  }

  /**
   * Get or create Pino instance with proper transport configuration
   */
  private getOrCreatePinoInstance(): pino.Logger {
    // Check cache first
    const cachedInstance = pinoInstanceCache.get(this.configHash);
    if (cachedInstance) {
      return cachedInstance;
    }

    // Create new instance
    const options: pino.LoggerOptions = {
      level: this.config.level,
    };

    // Configure transport based on runtime and configuration
    const transport = this.getTransportConfig();
    if (transport) {
      options.transport = transport;
    }

    const newInstance = pino(options);

    // Cache the instance
    pinoInstanceCache.set(this.configHash, newInstance);

    return newInstance;
  }

  /**
   * Get transport configuration with shared instances
   */
  private getTransportConfig():
    | pino.TransportMultiOptions
    | pino.TransportSingleOptions
    | undefined {
    const transports: pino.TransportSingleOptions[] = [];

    // Console/stderr transport based on mode
    if (this.config.enableConsole) {
      const useStderr = this.runtimeOptions?.transport === "stdio";

      if (useStderr) {
        // Use stderr for stdio mode to avoid protocol corruption
        if (!sharedStderrTransport) {
          sharedStderrTransport = this.createPrettyTransport(2); // stderr file descriptor
        }
        transports.push(sharedStderrTransport);
      } else {
        // Use stdout for http mode
        if (!sharedStdoutTransport) {
          sharedStdoutTransport = this.createPrettyTransport(1); // stdout file descriptor
        }
        transports.push(sharedStdoutTransport);
      }
    }

    // File transport
    if (this.config.enableFile) {
      if (!sharedFileTransport) {
        sharedFileTransport = this.createFileTransport();
      }
      transports.push(sharedFileTransport);
    }

    if (transports.length === 0) {
      return undefined;
    }

    if (transports.length === 1) {
      return transports[0];
    }

    return {
      targets: transports,
    };
  }

  /**
   * Create pretty transport configuration
   */
  private createPrettyTransport(
    destination: number
  ): pino.TransportSingleOptions {
    const options: any = {
      destination,
      colorize: this.config.format === "pretty",
      translateTime: "HH:MM:ss",
      ignore: "pid,hostname",
    };

    if (this.config.format === "json") {
      return {
        target: "pino/file",
        options,
      };
    } else {
      return {
        target: "pino-pretty",
        options,
      };
    }
  }

  /**
   * Create file transport configuration
   */
  private createFileTransport(): pino.TransportSingleOptions {
    const logFilePath = this.getLogFilePath();

    return {
      target: "pino/file",
      options: {
        destination: logFilePath,
        mkdir: true,
        append: true,
      },
    };
  }

  /**
   * Get the log file path for the current server
   */
  private getLogFilePath(): string {
    // Check for environment variable override first (used by daemon)
    if (process.env.HYPERTOOL_LOG_FILE) {
      return process.env.HYPERTOOL_LOG_FILE;
    }

    // Fall back to default path
    const logDir = join(
      homedir(),
      `.${BRAND_NAME.toLowerCase()}`,
      this.config.serverName,
      "logs"
    );
    return join(logDir, `${this.config.serverName}.log`);
  }

  /**
   * Format context for log messages with Error handling
   */
  private formatContext(
    context?: LogContext
  ): Record<string, unknown> | undefined {
    if (context === undefined || context === null) {
      return undefined;
    }

    if (context instanceof Error) {
      return {
        error: {
          name: context.name,
          message: context.message,
          stack: context.stack,
        },
      };
    }

    if (typeof context === "object") {
      return context as Record<string, unknown>;
    }

    // For primitive types, wrap in a context object
    return { context };
  }

  // Public logging methods
  fatal(message: string, context?: LogContext): void {
    const formattedContext = this.formatContext(context);
    if (formattedContext) {
      this.pinoLogger.fatal(formattedContext, message);
    } else {
      this.pinoLogger.fatal(message);
    }
  }

  error(message: string, context?: LogContext): void {
    const formattedContext = this.formatContext(context);
    if (formattedContext) {
      this.pinoLogger.error(formattedContext, message);
    } else {
      this.pinoLogger.error(message);
    }
  }

  warn(message: string, context?: LogContext): void {
    const formattedContext = this.formatContext(context);
    if (formattedContext) {
      this.pinoLogger.warn(formattedContext, message);
    } else {
      this.pinoLogger.warn(message);
    }
  }

  info(message: string, context?: LogContext): void {
    const formattedContext = this.formatContext(context);
    if (formattedContext) {
      this.pinoLogger.info(formattedContext, message);
    } else {
      this.pinoLogger.info(message);
    }
  }

  debug(message: string, context?: LogContext): void {
    const formattedContext = this.formatContext(context);
    if (formattedContext) {
      this.pinoLogger.debug(formattedContext, message);
    } else {
      this.pinoLogger.debug(message);
    }
  }

  trace(message: string, context?: LogContext): void {
    const formattedContext = this.formatContext(context);
    if (formattedContext) {
      this.pinoLogger.trace(formattedContext, message);
    } else {
      this.pinoLogger.trace(message);
    }
  }

  /**
   * Create child logger with caching to prevent EventEmitter memory leaks
   */
  child(bindings: {
    module?: string;
    [key: string]: unknown;
  }): LoggerInterface {
    // Create cache key from bindings
    const cacheKey = JSON.stringify(bindings);

    // Check cache first
    if (this.childLoggerCache.has(cacheKey)) {
      return this.childLoggerCache.get(cacheKey)!;
    }

    // Create new child logger using Pino's native child functionality
    // This avoids creating new transports and exit listeners
    const childPinoLogger = this.pinoLogger.child(bindings);

    // Create a wrapper that shares the parent's config but uses the child Pino instance
    // Importantly, we DON'T call the constructor which would create new transports
    const childLogger = Object.create(PinoLogger.prototype) as PinoLogger;
    childLogger.pinoLogger = childPinoLogger;
    childLogger.config = this.config;
    childLogger.runtimeOptions = this.runtimeOptions;
    childLogger.childLoggerCache = new Map<string, PinoLogger>();

    // Cache the child logger
    this.childLoggerCache.set(cacheKey, childLogger);

    // Implement cache size limit to prevent unbounded growth
    if (this.childLoggerCache.size > 100) {
      const firstKey = this.childLoggerCache.keys().next().value;
      if (firstKey) {
        this.childLoggerCache.delete(firstKey);
      }
    }

    return childLogger;
  }

  /**
   * Update configuration and reinitialize Pino instance if needed
   */
  updateConfig(config: Partial<LoggingConfig>): void {
    const oldConfigHash = this.configHash;
    this.config = { ...this.config, ...config };

    // Recalculate config hash
    this.configHash = this.calculateConfigHash();

    // Only create new instance if config actually changed
    if (oldConfigHash !== this.configHash) {
      this.pinoLogger = this.getOrCreatePinoInstance();
      // Clear child logger cache since they need to be recreated with new config
      this.childLoggerCache.clear();
    }
  }

  /**
   * Legacy compatibility - access to underlying Pino logger
   */
  get pino(): pino.Logger {
    return this.pinoLogger;
  }

  /**
   * Legacy compatibility - same as pino for backward compatibility
   */
  get mcp(): pino.Logger {
    return this.pinoLogger;
  }

  /**
   * Get diagnostic information about child logger cache
   */
  getCacheStats(): {
    childLoggerCount: number;
    cacheSize: number;
    cacheKeys: string[];
  } {
    return {
      childLoggerCount: this.childLoggerCache.size,
      cacheSize: this.childLoggerCache.size,
      cacheKeys: Array.from(this.childLoggerCache.keys()),
    };
  }

  /**
   * Clear the global Pino instance cache (mainly for testing)
   */
  static clearInstanceCache(): void {
    pinoInstanceCache.clear();
  }

  /**
   * Get diagnostic information about Pino instance cache
   */
  static getInstanceCacheStats(): {
    instanceCount: number;
    configHashes: string[];
  } {
    return {
      instanceCount: pinoInstanceCache.size,
      configHashes: Array.from(pinoInstanceCache.keys()),
    };
  }
}
