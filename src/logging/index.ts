/**
 * Structured logging framework with Pino
 */

import pino from "pino";
import {
  createWriteStream,
  mkdirSync,
  existsSync,
  renameSync,
  readdirSync,
  statSync,
  unlinkSync,
} from "fs";
import { join } from "path";
import { homedir } from "os";
import { APP_TECHNICAL_NAME, BRAND_NAME } from "../config/appConfig.js";

export interface LoggingConfig {
  level: pino.LevelWithSilent;
  enableConsole: boolean;
  enableFile: boolean;
  serverName: string;
  format: "json" | "pretty";
  colorize: boolean;
}

export const DEFAULT_LOGGING_CONFIG: LoggingConfig = {
  level: process.env.NODE_ENV === "development" ? "debug" : "info",
  enableConsole: true,
  enableFile: true,
  serverName: APP_TECHNICAL_NAME,
  format: "pretty", // Always use pretty format for console
  colorize: true,
};

export class Logger {
  private pinoLogger: pino.Logger;
  private config: LoggingConfig;

  constructor(config: Partial<LoggingConfig> = {}) {
    this.config = { ...DEFAULT_LOGGING_CONFIG, ...config };
    this.pinoLogger = this.createLogger();
  }

  private createLogger(): pino.Logger {
    const streams: pino.StreamEntry[] = [];

    // Console stream
    if (this.config.enableConsole) {
      streams.push({
        level: this.config.level as pino.Level,
        stream: this.createConsoleStream(),
      });
    }

    // File stream
    if (this.config.enableFile) {
      const fileStream = this.createFileStream();
      if (fileStream) {
        streams.push({
          level: this.config.level as pino.Level,
          stream: fileStream,
        });
      }
    }

    // If no streams, fallback to console
    if (streams.length === 0) {
      streams.push({
        level: this.config.level as pino.Level,
        stream: process.stdout,
      });
    }

    return pino(
      {
        level: this.config.level,
        base: {
          pid: process.pid,
          hostname: process.env.HOSTNAME || "localhost",
          serverName: this.config.serverName,
        },
        timestamp: pino.stdTimeFunctions.isoTime,
      },
      pino.multistream(streams)
    );
  }

  private createConsoleStream() {
    // Always use pino-pretty for console output for better readability
    return pino.transport({
      target: "pino-pretty",
      options: {
        colorize: this.config.colorize,
        translateTime: "SYS:standard",
        include: "level,time,msg",
        ignore: "pid,hostname", // Simplify output
      },
    });
  }

  private createFileStream() {
    try {
      const logDir = join(
        homedir(),
        `.${BRAND_NAME.toLowerCase()}`,
        this.config.serverName,
        "logs"
      );

      // Create directory synchronously on first use
      this.ensureLogDirectory(logDir);

      // Main log file (no timestamp)
      const logFile = join(logDir, `${this.config.serverName}.log`);

      // Rotate existing logs before creating new stream
      this.rotateLogFiles(logDir, logFile);

      return createWriteStream(logFile, { flags: "a" });
    } catch (error) {
      console.warn("Failed to create log file stream:", error);
      return null;
    }
  }

  private ensureLogDirectory(logDir: string): void {
    try {
      if (!existsSync(logDir)) {
        mkdirSync(logDir, { recursive: true });
      }
    } catch (error) {
      console.warn("Failed to create log directory:", error);
      // Continue anyway - logging should not fail the application
    }
  }

  /**
   * Rotate log files:
   * - Current log becomes log.1
   * - log.1 becomes log.2
   * - log.2 becomes log.3
   * - Keep up to 5 rotated logs
   * - Delete logs older than 7 days
   */
  private rotateLogFiles(logDir: string, currentLogPath: string): void {
    try {
      if (!existsSync(currentLogPath)) {
        return; // No existing log to rotate
      }

      const baseFileName = `${this.config.serverName}.log`;
      const maxRotations = 5;
      const maxAgeDays = 7;

      // First, clean up old rotated logs
      const files = readdirSync(logDir);
      const now = Date.now();
      const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;

      files.forEach((file) => {
        const filePath = join(logDir, file);
        try {
          const stats = statSync(filePath);
          // Delete files older than maxAgeDays
          if (now - stats.mtimeMs > maxAgeMs) {
            unlinkSync(filePath);
            console.info(`Deleted old log file: ${file}`);
          }
        } catch (error) {
          // Ignore errors for individual files
        }
      });

      // Rotate existing numbered logs
      for (let i = maxRotations - 1; i > 0; i--) {
        const oldPath = join(logDir, `${baseFileName}.${i}`);
        const newPath = join(logDir, `${baseFileName}.${i + 1}`);

        if (existsSync(oldPath)) {
          try {
            if (i === maxRotations - 1) {
              // Delete the oldest rotation
              unlinkSync(oldPath);
            } else {
              // Rename to next number
              renameSync(oldPath, newPath);
            }
          } catch (error) {
            // Gracefully handle file system errors during log rotation
            // This is not critical to application functionality
            console.warn(
              `Warning: Could not rotate log file ${oldPath}:`,
              error instanceof Error ? error.message : String(error)
            );
          }
        }
      }

      // Rotate current log to .1 (only if it exists)
      if (existsSync(currentLogPath)) {
        try {
          renameSync(currentLogPath, join(logDir, `${baseFileName}.1`));
        } catch (error) {
          console.warn(
            `Warning: Could not rotate current log file ${currentLogPath}:`,
            error instanceof Error ? error.message : String(error)
          );
        }
      }
    } catch (error) {
      console.warn("Failed to rotate log files:", error);
      // Continue anyway - logging should not fail the application
    }
  }

  // Public logging methods
  fatal(message: string, context?: any): void {
    this.pinoLogger.fatal(context, message);
  }

  error(message: string, context?: any): void {
    this.pinoLogger.error(context, message);
  }

  warn(message: string, context?: any): void {
    this.pinoLogger.warn(context, message);
  }

  info(message: string, context?: any): void {
    this.pinoLogger.info(context, message);
  }

  debug(message: string, context?: any): void {
    this.pinoLogger.debug(context, message);
  }

  trace(message: string, context?: any): void {
    this.pinoLogger.trace(context, message);
  }

  // Structured logging methods
  child(bindings: pino.Bindings): Logger {
    const childLogger = new Logger(this.config);
    childLogger.pinoLogger = this.pinoLogger.child(bindings);
    return childLogger;
  }

  // Access to underlying pino logger for advanced use cases
  get pino(): pino.Logger {
    return this.pinoLogger;
  }

  // Update configuration
  updateConfig(config: Partial<LoggingConfig>): void {
    this.config = { ...this.config, ...config };
    this.pinoLogger = this.createLogger();
  }
}

// Global logger instance
export const logger = new Logger();

// Convenience function to create a child logger
export function createLogger(
  context: pino.Bindings,
  config?: Partial<LoggingConfig>
): Logger {
  if (config) {
    return new Logger(config).child(context);
  }
  return logger.child(context);
}
