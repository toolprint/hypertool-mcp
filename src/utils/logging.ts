/**
 * Streamlined logging framework using @toolprint/mcp-logger 0.0.5 native features
 */

import { 
  createLogger, 
  createLoggerSync, 
  Logger as McpLogger,
  LoggerOptions,
  TransportConfig,
  ServerMode,
  InternalLogLevel
} from "@toolprint/mcp-logger";
import { join } from "path";
import { homedir } from "os";
import { APP_TECHNICAL_NAME, BRAND_NAME } from "../config/appConfig.js";
import { RuntimeOptions } from "../types/runtime.js";

// Type for log context - can be any serializable object, Error, or unknown value
type LogContext = 
  | Record<string, unknown> 
  | string 
  | number 
  | boolean 
  | null 
  | undefined 
  | Error 
  | unknown;

export interface LoggingConfig {
  level: InternalLogLevel;
  enableConsole: boolean;
  enableFile: boolean;
  serverName: string;
  format: "json" | "pretty";
}

export const DEFAULT_LOGGING_CONFIG: LoggingConfig = {
  level: process.env.NODE_ENV === "development" ? "debug" : "info",
  enableConsole: true,
  enableFile: true,
  serverName: APP_TECHNICAL_NAME,
  format: "pretty",
};

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
    level: (runtimeOptions?.logLevel as InternalLogLevel) || DEFAULT_LOGGING_CONFIG.level,
  };
}


/**
 * Get the log file path for a given server name
 */
function getLogFilePath(serverName: string): string {
  const logDir = join(
    homedir(),
    `.${BRAND_NAME.toLowerCase()}`,
    serverName,
    "logs"
  );
  return join(logDir, `${serverName}.log`);
}

/**
 * Convert LoggingConfig to mcp-logger LoggerOptions with transport-aware mode
 */
function configToLoggerOptions(config: LoggingConfig, runtimeOptions?: RuntimeOptions): LoggerOptions {
  const transports: TransportConfig[] = [];
  
  // Determine ServerMode based on runtime transport
  const mode: ServerMode = runtimeOptions?.transport === 'stdio' ? 'local' : 'remote';
  
  // Console/stderr transport - use stderr for stdio mode, console for http mode
  if (config.enableConsole) {
    if (mode === 'local') {
      // stdio mode: use stderr to avoid protocol corruption
      transports.push({
        type: 'stderr',
        enabled: true,
      });
    } else {
      // http mode: use console for visibility
      transports.push({
        type: 'console',
        enabled: true,
      });
    }
  }
  
  // File transport
  if (config.enableFile) {
    transports.push({
      type: 'file',
      enabled: true,
      options: {
        path: getLogFilePath(config.serverName),
        mkdir: true,
        append: true
      }
    });
  }
  
  return {
    mode,
    level: config.level,
    format: config.format,
    transports
  };
}

/**
 * Logger class that wraps mcp-logger with our API compatibility layer
 */
export class Logger {
  private mcpLogger: McpLogger;
  private config: LoggingConfig;
  private runtimeOptions?: RuntimeOptions;

  constructor(config: Partial<LoggingConfig> = {}, runtimeOptions?: RuntimeOptions) {
    this.config = { ...DEFAULT_LOGGING_CONFIG, ...config };
    this.runtimeOptions = runtimeOptions;
    
    // Start with sync logger for immediate availability, then upgrade to async
    const options = configToLoggerOptions(this.config, this.runtimeOptions);
    this.mcpLogger = createLoggerSync(options);
    
    // Upgrade to async logger in background for full file transport functionality
    this.initializeAsync().catch(() => {
      // Continue with sync logger if async fails
    });
  }

  /**
   * Initialize with async logger for full functionality
   * This enables file transport which only works with async logger in mcp-logger 0.0.6
   */
  private async initializeAsync(): Promise<void> {
    try {
      const options = configToLoggerOptions(this.config, this.runtimeOptions);
      this.mcpLogger = await createLogger(options);
    } catch (error) {
      // Continue with sync logger if async initialization fails
      // File transport may not work, but console/stderr will still function
      // Log this through the sync logger (stderr/console will still work)
      this.mcpLogger.warn("Failed to initialize async logger, file transport may not work", {
        error: {
          name: (error as Error).name,
          message: (error as Error).message,
          stack: (error as Error).stack
        }
      });
    }
  }

  // Helper method to format context for log messages
  private formatContext(context?: LogContext): Record<string, unknown> | undefined {
    if (context === undefined || context === null) {
      return undefined;
    }
    
    if (context instanceof Error) {
      return {
        error: {
          name: context.name,
          message: context.message,
          stack: context.stack
        }
      };
    }
    
    if (typeof context === 'object') {
      return context as Record<string, unknown>;
    }
    
    // For primitive types, wrap in a context object
    return { context };
  }

  // Public logging methods
  fatal(message: string, context?: LogContext): void {
    // mcp-logger doesn't have fatal, use error
    const formattedContext = this.formatContext(context);
    if (formattedContext) {
      this.mcpLogger.error(`[FATAL] ${message}`, formattedContext);
    } else {
      this.mcpLogger.error(`[FATAL] ${message}`);
    }
  }

  error(message: string, context?: LogContext): void {
    const formattedContext = this.formatContext(context);
    if (formattedContext) {
      this.mcpLogger.error(message, formattedContext);
    } else {
      this.mcpLogger.error(message);
    }
  }

  warn(message: string, context?: LogContext): void {
    const formattedContext = this.formatContext(context);
    if (formattedContext) {
      this.mcpLogger.warn(message, formattedContext);
    } else {
      this.mcpLogger.warn(message);
    }
  }

  info(message: string, context?: LogContext): void {
    const formattedContext = this.formatContext(context);
    if (formattedContext) {
      this.mcpLogger.info(message, formattedContext);
    } else {
      this.mcpLogger.info(message);
    }
  }

  debug(message: string, context?: LogContext): void {
    const formattedContext = this.formatContext(context);
    if (formattedContext) {
      this.mcpLogger.debug(message, formattedContext);
    } else {
      this.mcpLogger.debug(message);
    }
  }

  trace(message: string, context?: LogContext): void {
    const formattedContext = this.formatContext(context);
    if (formattedContext) {
      this.mcpLogger.trace(message, formattedContext);
    } else {
      this.mcpLogger.trace(message);
    }
  }

  // Child logger creation using native mcp-logger functionality
  child(bindings: { module?: string; [key: string]: unknown }): Logger {
    const module = bindings.module;
    const otherBindings = { ...bindings };
    delete otherBindings.module;
    
    // Create child logger with module context
    const childMcpLogger = this.mcpLogger.child({
      context: {
        module,
        ...otherBindings
      }
    });
    
    // Create new Logger instance wrapping the child
    const childLogger = new Logger(this.config, this.runtimeOptions);
    childLogger.mcpLogger = childMcpLogger;
    
    return childLogger;
  }

  // Legacy API compatibility - access to underlying logger
  get pino(): McpLogger {
    return this.mcpLogger;
  }

  get mcp(): McpLogger {
    return this.mcpLogger;
  }

  // Update configuration and reinitialize
  updateConfig(config: Partial<LoggingConfig>): void {
    this.config = { ...this.config, ...config };
    const options = configToLoggerOptions(this.config, this.runtimeOptions);
    this.mcpLogger = createLoggerSync(options);
    
    // Try to upgrade to async logger in background
    this.initializeAsync().catch(() => {
      // Ignore errors, sync logger will continue to work
    });
  }
}

// Global logger management
let globalLogger: Logger | null = null;
let selectedLoggingConfig: Partial<LoggingConfig> | null = null;

/**
 * Get or create the global logger instance
 */
export function getLogger(config?: Partial<LoggingConfig>, runtimeOptions?: RuntimeOptions): Logger {
  if (config || runtimeOptions) {
    const finalConfig = config || createLoggingConfig(runtimeOptions);
    globalLogger = new Logger(finalConfig, runtimeOptions);
    selectedLoggingConfig = finalConfig;
    return globalLogger;
  }

  if (!globalLogger) {
    globalLogger = new Logger();
  }

  return globalLogger;
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
    // This will be overridden when the main logger is properly initialized
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