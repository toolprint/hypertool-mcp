/**
 * Logger factory that selects implementation based on feature flags
 */

import { isMcpLoggerEnabledViaService } from "../../config/featureFlagService.js";
import { RuntimeOptions } from "../../types/runtime.js";
import { LoggerInterface, LoggingConfig, LoggerFactory } from "./interfaces.js";
import { PinoLogger } from "./pinoLogger.js";
import { McpLoggerWrapper } from "./mcpLoggerWrapper.js";

/**
 * Logger factory implementation that selects between Pino and mcp-logger
 * based on feature flag configuration
 */
export class HypertoolLoggerFactory implements LoggerFactory {
  private static instance: HypertoolLoggerFactory;
  private mcpLoggerEnabled: boolean | null = null;

  private constructor() {}

  /**
   * Get singleton instance
   */
  static getInstance(): HypertoolLoggerFactory {
    if (!HypertoolLoggerFactory.instance) {
      HypertoolLoggerFactory.instance = new HypertoolLoggerFactory();
    }
    return HypertoolLoggerFactory.instance;
  }

  /**
   * Check feature flag status (with caching)
   */
  private async checkMcpLoggerEnabled(): Promise<boolean> {
    if (this.mcpLoggerEnabled === null) {
      try {
        this.mcpLoggerEnabled = await isMcpLoggerEnabledViaService();
      } catch (error) {
        // If feature flag service fails, default to Pino (false)
        console.error("Failed to check MCP Logger feature flag, defaulting to Pino:", error);
        this.mcpLoggerEnabled = false;
      }
    }
    return this.mcpLoggerEnabled;
  }

  /**
   * Create logger instance based on feature flag
   */
  async createLogger(config?: Partial<LoggingConfig>, runtimeOptions?: RuntimeOptions): Promise<LoggerInterface> {
    const useMcpLogger = await this.checkMcpLoggerEnabled();
    
    if (useMcpLogger) {
      return new McpLoggerWrapper(config, runtimeOptions);
    } else {
      return new PinoLogger(config, runtimeOptions);
    }
  }

  /**
   * Create child logger - delegates to existing global logger
   */
  createChildLogger(bindings: { module: string }): LoggerInterface {
    // This method will be implemented by the main logging module
    // since it needs access to the global logger instance
    throw new Error("createChildLogger should be called on the main logging module, not the factory directly");
  }

  /**
   * Synchronous logger creation for cases where async is not possible
   * Uses forced value first, then environment variable as fallback
   */
  createLoggerSync(config?: Partial<LoggingConfig>, runtimeOptions?: RuntimeOptions): LoggerInterface {
    let useMcpLogger = false;
    
    // First check if value was forced (for testing)
    if (this.mcpLoggerEnabled !== null) {
      useMcpLogger = this.mcpLoggerEnabled;
    } else {
      // Check environment variable as fallback
      const envMcpLogger = process.env.HYPERTOOL_MCP_LOGGER_ENABLED;
      useMcpLogger = envMcpLogger ? ["true", "1", "yes", "on"].includes(envMcpLogger.toLowerCase()) : false;
    }
    
    if (useMcpLogger) {
      return new McpLoggerWrapper(config, runtimeOptions);
    } else {
      return new PinoLogger(config, runtimeOptions);
    }
  }

  /**
   * Reset feature flag cache (mainly for testing)
   */
  resetCache(): void {
    this.mcpLoggerEnabled = null;
  }

  /**
   * Force set feature flag (for testing)
   */
  forceSetMcpLoggerEnabled(enabled: boolean): void {
    this.mcpLoggerEnabled = enabled;
  }
}

/**
 * Get the singleton factory instance
 */
export function getLoggerFactory(): HypertoolLoggerFactory {
  return HypertoolLoggerFactory.getInstance();
}

/**
 * Convenience function to create a logger with feature flag selection
 */
export async function createLoggerWithFeatureFlag(
  config?: Partial<LoggingConfig>, 
  runtimeOptions?: RuntimeOptions
): Promise<LoggerInterface> {
  const factory = getLoggerFactory();
  return factory.createLogger(config, runtimeOptions);
}

/**
 * Synchronous convenience function for cases where async is not possible
 */
export function createLoggerSyncWithFeatureFlag(
  config?: Partial<LoggingConfig>, 
  runtimeOptions?: RuntimeOptions
): LoggerInterface {
  const factory = getLoggerFactory();
  return factory.createLoggerSync(config, runtimeOptions);
}