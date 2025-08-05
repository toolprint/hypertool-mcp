/**
 * MCP Logger wrapper that implements the LoggerInterface
 * Wraps the existing mcp-logger implementation for feature flag compatibility
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
import { APP_TECHNICAL_NAME, BRAND_NAME } from "../../config/appConfig.js";
import { RuntimeOptions } from "../../types/runtime.js";
import { LoggerInterface, LoggingConfig, LogContext, LogLevel } from "./interfaces.js";

export const DEFAULT_MCP_LOGGING_CONFIG: LoggingConfig = {
  level: process.env.NODE_ENV === "development" ? "debug" : "info",
  enableConsole: true,
  enableFile: true,
  serverName: APP_TECHNICAL_NAME,
  format: "pretty",
};

/**
 * Wrapper class that adapts mcp-logger to the LoggerInterface
 */
export class McpLoggerWrapper implements LoggerInterface {
  private mcpLogger: McpLogger;
  private config: LoggingConfig;
  private runtimeOptions?: RuntimeOptions;

  constructor(config: Partial<LoggingConfig> = {}, runtimeOptions?: RuntimeOptions) {
    this.config = { ...DEFAULT_MCP_LOGGING_CONFIG, ...config };
    this.runtimeOptions = runtimeOptions;
    
    // Determine format from environment variable or config
    if (process.env.LOG_FORMAT === "json") {
      this.config.format = "json";
    }

    // Override level if provided in runtime options
    if (runtimeOptions?.logLevel) {
      this.config.level = runtimeOptions.logLevel as LogLevel;
    }
    
    // Start with sync logger for immediate availability, then upgrade to async
    const options = this.configToLoggerOptions(this.config, this.runtimeOptions);
    this.mcpLogger = createLoggerSync(options);
    
    // Upgrade to async logger in background for full file transport functionality
    this.initializeAsync().catch(() => {
      // Continue with sync logger if async fails
    });
  }

  /**
   * Initialize with async logger for full functionality
   */
  private async initializeAsync(): Promise<void> {
    try {
      const options = this.configToLoggerOptions(this.config, this.runtimeOptions);
      this.mcpLogger = await createLogger(options);
    } catch (error) {
      // Continue with sync logger if async initialization fails
      this.mcpLogger.warn("Failed to initialize async logger, file transport may not work", {
        error: {
          name: (error as Error).name,
          message: (error as Error).message,
          stack: (error as Error).stack
        }
      });
    }
  }

  /**
   * Convert LoggingConfig to mcp-logger LoggerOptions with transport-aware mode
   */
  private configToLoggerOptions(config: LoggingConfig, runtimeOptions?: RuntimeOptions): LoggerOptions {
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
          path: this.getLogFilePath(config.serverName),
          mkdir: true,
          append: true
        }
      });
    }
    
    return {
      mode,
      level: config.level as InternalLogLevel,
      format: config.format,
      transports
    };
  }

  /**
   * Get the log file path for a given server name
   */
  private getLogFilePath(serverName: string): string {
    const logDir = join(
      homedir(),
      `.${BRAND_NAME.toLowerCase()}`,
      serverName,
      "logs"
    );
    return join(logDir, `${serverName}.log`);
  }

  /**
   * Format context for log messages with Error handling
   */
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
    // mcp-logger doesn't have fatal, use error with [FATAL] prefix
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

  /**
   * Create child logger using native mcp-logger functionality
   */
  child(bindings: { module?: string; [key: string]: unknown }): LoggerInterface {
    const module = bindings.module;
    const otherBindings = { ...bindings };
    delete otherBindings.module;
    
    // Create child logger with module context
    // mcp-logger 0.0.7+ handles caching natively to prevent memory leaks
    const childMcpLogger = this.mcpLogger.child({
      context: {
        module,
        ...otherBindings
      }
    });
    
    // Create new wrapper instance for the child
    const childLogger = new McpLoggerWrapper(this.config, this.runtimeOptions);
    childLogger.mcpLogger = childMcpLogger;
    
    return childLogger;
  }

  /**
   * Update configuration and reinitialize
   */
  updateConfig(config: Partial<LoggingConfig>): void {
    this.config = { ...this.config, ...config };
    const options = this.configToLoggerOptions(this.config, this.runtimeOptions);
    this.mcpLogger = createLoggerSync(options);
    
    // Try to upgrade to async logger in background
    this.initializeAsync().catch(() => {
      // Ignore errors, sync logger will continue to work
    });
  }

  /**
   * Legacy compatibility - access to underlying mcp logger as pino
   */
  get pino(): McpLogger {
    return this.mcpLogger;
  }

  /**
   * Access to underlying mcp logger
   */
  get mcp(): McpLogger {
    return this.mcpLogger;
  }
}