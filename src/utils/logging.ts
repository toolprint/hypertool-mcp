/**
 * Enhanced logging framework with feature flag support
 * Supports both Pino (default) and mcp-logger implementations
 */

import { RuntimeOptions } from "../types/runtime.js";
import { LoggerInterface, LoggingConfig, LogContext, LogLevel } from "./logger/interfaces.js";
import { DEFAULT_PINO_LOGGING_CONFIG } from "./logger/pinoLogger.js";
import { 
  getLoggerFactory, 
  createLoggerWithFeatureFlag, 
  createLoggerSyncWithFeatureFlag 
} from "./logger/factory.js";

// Re-export types for backward compatibility
export type { LogContext, LogLevel, LoggingConfig };

// Use Pino defaults as the main defaults
export const DEFAULT_LOGGING_CONFIG = DEFAULT_PINO_LOGGING_CONFIG;

/**
 * Create logging configuration based on runtime options and environment
 */
export function createLoggingConfig(runtimeOptions?: RuntimeOptions): LoggingConfig {
  // Determine format from environment variable or default to pretty
  const format = (process.env.LOG_FORMAT === "json" ? "json" : "pretty") as "json" | "pretty";
  
  return {
    ...DEFAULT_LOGGING_CONFIG,
    format,
    // Override level if provided in runtime options
    level: (runtimeOptions?.logLevel as LogLevel) || DEFAULT_LOGGING_CONFIG.level,
  };
}

/**
 * Logger class that wraps the feature-flag-selected implementation
 * Maintains backward compatibility with existing API
 */
export class Logger implements LoggerInterface {
  private implementation: LoggerInterface;
  private childLoggerCache = new Map<string, Logger>();

  constructor(config: Partial<LoggingConfig> = {}, runtimeOptions?: RuntimeOptions) {
    // Use synchronous factory method for immediate availability
    this.implementation = createLoggerSyncWithFeatureFlag(config, runtimeOptions);
  }

  // Delegate all methods to the underlying implementation
  fatal(message: string, context?: LogContext): void {
    this.implementation.fatal(message, context);
  }

  error(message: string, context?: LogContext): void {
    this.implementation.error(message, context);
  }

  warn(message: string, context?: LogContext): void {
    this.implementation.warn(message, context);
  }

  info(message: string, context?: LogContext): void {
    this.implementation.info(message, context);
  }

  debug(message: string, context?: LogContext): void {
    this.implementation.debug(message, context);
  }

  trace(message: string, context?: LogContext): void {
    this.implementation.trace(message, context);
  }

  child(bindings: { module?: string; [key: string]: unknown }): Logger {
    // Create cache key from bindings
    const cacheKey = JSON.stringify(bindings);
    
    // Check cache first
    if (this.childLoggerCache.has(cacheKey)) {
      return this.childLoggerCache.get(cacheKey)!;
    }
    
    // Create new child logger
    const childImplementation = this.implementation.child(bindings);
    const childLogger = new Logger();
    (childLogger as any).implementation = childImplementation;
    
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

  updateConfig(config: Partial<LoggingConfig>): void {
    this.implementation.updateConfig(config);
  }

  // Legacy API compatibility
  get pino(): any {
    return this.implementation.pino;
  }

  get mcp(): any {
    return this.implementation.mcp;
  }

  /**
   * Get cache statistics for diagnostics
   */
  getCacheStats(): {
    childLoggerCount: number;
    cacheSize: number;
    cacheKeys: string[];
  } {
    return {
      childLoggerCount: this.childLoggerCache.size,
      cacheSize: this.childLoggerCache.size,
      cacheKeys: Array.from(this.childLoggerCache.keys())
    };
  }
}

// Global logger management
let globalLogger: Logger | null = null;
let selectedLoggingConfig: Partial<LoggingConfig> | null = null;
let globalRuntimeOptions: RuntimeOptions | undefined = undefined;

/**
 * Check if two logging configurations are equivalent
 */
function areConfigsEquivalent(config1: Partial<LoggingConfig> | null, config2: Partial<LoggingConfig> | null): boolean {
  if (config1 === config2) return true;
  if (!config1 || !config2) return false;
  
  // Compare relevant config properties
  const finalConfig1 = { ...DEFAULT_LOGGING_CONFIG, ...config1 };
  const finalConfig2 = { ...DEFAULT_LOGGING_CONFIG, ...config2 };
  
  return (
    finalConfig1.level === finalConfig2.level &&
    finalConfig1.enableConsole === finalConfig2.enableConsole &&
    finalConfig1.enableFile === finalConfig2.enableFile &&
    finalConfig1.serverName === finalConfig2.serverName &&
    finalConfig1.format === finalConfig2.format
  );
}

/**
 * Check if runtime options are equivalent for logging purposes
 */
function areRuntimeOptionsEquivalent(opt1?: RuntimeOptions, opt2?: RuntimeOptions): boolean {
  if (opt1 === opt2) return true;
  if (!opt1 || !opt2) return !opt1 && !opt2;
  
  return (
    opt1.transport === opt2.transport &&
    opt1.logLevel === opt2.logLevel &&
    opt1.debug === opt2.debug
  );
}

/**
 * Get or create the global logger instance
 */
export function getLogger(config?: Partial<LoggingConfig>, runtimeOptions?: RuntimeOptions): Logger {
  const finalConfig = config || createLoggingConfig(runtimeOptions);
  
  // Check if we can reuse the existing global logger
  if (globalLogger && 
      areConfigsEquivalent(selectedLoggingConfig, finalConfig) &&
      areRuntimeOptionsEquivalent(globalRuntimeOptions, runtimeOptions)) {
    return globalLogger;
  }

  // Create new logger only if config has changed or no logger exists
  globalLogger = new Logger(finalConfig, runtimeOptions);
  selectedLoggingConfig = finalConfig;
  globalRuntimeOptions = runtimeOptions;
  
  return globalLogger;
}

/**
 * Async version of getLogger that properly initializes feature flags
 */
export async function getLoggerAsync(config?: Partial<LoggingConfig>, runtimeOptions?: RuntimeOptions): Promise<Logger> {
  const finalConfig = config || createLoggingConfig(runtimeOptions);
  const implementation = await createLoggerWithFeatureFlag(finalConfig, runtimeOptions);
  
  const logger = new Logger();
  (logger as any).implementation = implementation;
  
  if (config || runtimeOptions) {
    globalLogger = logger;
    selectedLoggingConfig = finalConfig;
  }
  
  return logger;
}

/**
 * Get the currently active logging configuration
 */
export function getActiveLoggingConfig(): Partial<LoggingConfig> | null {
  return selectedLoggingConfig;
}

/**
 * Create a child logger with module context
 * This maintains backward compatibility with the existing API
 */
export function createChildLogger(bindings: { module: string }): Logger {
  // If we don't have a global logger yet, create one with environment-aware config
  if (!globalLogger) {
    const config = createLoggingConfig();
    // For early initialization, assume stdio transport (most common case)
    const runtimeOptions: RuntimeOptions = { 
      transport: 'stdio', 
      debug: false, 
      insecure: false 
    };
    globalLogger = new Logger(config, runtimeOptions);
    selectedLoggingConfig = config;
  }
  return globalLogger.child(bindings);
}

/**
 * Async version of createChildLogger that properly initializes feature flags
 */
export async function createChildLoggerAsync(bindings: { module: string }): Promise<Logger> {
  if (!globalLogger) {
    const config = createLoggingConfig();
    const runtimeOptions: RuntimeOptions = { 
      transport: 'stdio', 
      debug: false, 
      insecure: false 
    };
    globalLogger = await getLoggerAsync(config, runtimeOptions);
    selectedLoggingConfig = config;
  }
  return globalLogger.child(bindings);
}

/**
 * Get diagnostic information about the logging system
 * Useful for debugging EventEmitter memory leaks
 */
export function getLoggerDiagnostics(): {
  hasGlobalLogger: boolean;
  implementationType: string;
  cacheStats?: any;
} {
  const result: any = {
    hasGlobalLogger: globalLogger !== null,
    implementationType: 'unknown'
  };
  
  if (globalLogger) {
    const impl = (globalLogger as any).implementation;
    
    // Detect implementation type
    if (impl.constructor.name === 'PinoLogger') {
      result.implementationType = 'pino';
    } else if (impl.constructor.name === 'McpLoggerWrapper') {
      result.implementationType = 'mcp-logger';
    }
    
    // Get cache stats from the Logger wrapper itself
    if (typeof globalLogger.getCacheStats === 'function') {
      result.cacheStats = globalLogger.getCacheStats();
    }
  }
  
  return result;
}

/**
 * Reset global logger state (mainly for testing)
 */
export function resetGlobalLogger(): void {
  globalLogger = null;
  selectedLoggingConfig = null;
  globalRuntimeOptions = undefined;
  
  // Reset factory cache
  const factory = getLoggerFactory();
  factory.resetCache();
  
  // Clear Pino instance cache
  // Dynamic import to avoid circular dependency
  import('./logger/pinoLogger.js').then(({ PinoLogger }) => {
    PinoLogger.clearInstanceCache();
  }).catch(() => {
    // Ignore errors during cache clearing
  });
}

/**
 * Force feature flag for testing
 */
export function forceSetMcpLoggerEnabled(enabled: boolean): void {
  const factory = getLoggerFactory();
  factory.forceSetMcpLoggerEnabled(enabled);
  // Reset only the global logger state, not the factory cache
  globalLogger = null;
  selectedLoggingConfig = null;
  globalRuntimeOptions = undefined;
}