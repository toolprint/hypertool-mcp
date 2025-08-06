#!/usr/bin/env node
/**
 * Dedicated MCP server entry point for Smithery installation
 * 
 * This file provides a clean entry point focused on stdio transport
 * without the CLI scaffolding from index.ts
 */

// Set max listeners early to prevent warnings
const maxListeners = process.env.HYPERTOOL_MAX_LISTENERS 
  ? parseInt(process.env.HYPERTOOL_MAX_LISTENERS, 10) 
  : 10;
if (!isNaN(maxListeners) && maxListeners > 0) {
  process.setMaxListeners(maxListeners);
}

import { MetaMCPServerFactory } from "./server/index.js";
import { RuntimeOptions, RuntimeTransportType } from "./types/runtime.js";
import type { TransportConfig, ServerInitOptions } from "./server/types.js";
import { discoverMcpConfig } from "./config/mcpConfigLoader.js";
import { getLogger } from "./utils/logging.js";

// Configuration interface for Smithery
export interface SmitheryConfig {
  mcpConfigPath?: string;
  debug?: boolean;
  logLevel?: string;
  group?: string;
  equipToolset?: string;
  transport?: RuntimeTransportType;
  port?: number;
  host?: string;
}

/**
 * Main server entry point for Smithery
 */
async function startServer(config: SmitheryConfig = {}): Promise<void> {
  // Create runtime options from Smithery config
  const runtimeOptions: RuntimeOptions = {
    transport: config.transport || "stdio" as RuntimeTransportType,
    port: config.port,
    host: config.host,
    debug: config.debug || false,
    insecure: false, // Always secure for Smithery installs
    equipToolset: config.equipToolset,
    configPath: config.mcpConfigPath,
    logLevel: config.logLevel || "info",
    group: config.group,
  };

  // Initialize logger with transport-aware configuration
  const logger = getLogger(undefined, runtimeOptions);

  // Set up process warning listener
  process.on('warning', (warning) => {
    logger.warn('Node.js warning', {
      name: warning.name,
      message: warning.message,
      stack: warning.stack
    });
  });

  try {
    // Discover MCP configuration
    const configResult = await discoverMcpConfig(
      runtimeOptions.configPath,
      false, // Don't update preference for Smithery installs
      runtimeOptions.linkedApp,
      runtimeOptions.profile
    );

    // Handle configuration discovery results
    if (!configResult.configPath) {
      logger.error("No MCP configuration found");
      if (configResult.errorMessage) {
        logger.error(configResult.errorMessage);
      }
      process.exit(1);
    }

    // Create transport config based on runtime options
    const transportConfig: TransportConfig = {
      type: runtimeOptions.transport,
      ...(runtimeOptions.transport === "http" && {
        port: runtimeOptions.port || 3000,
        host: runtimeOptions.host || "localhost",
      }),
    };

    // Create server instance
    const server = MetaMCPServerFactory.createDefaultServer(transportConfig);

    // Setup graceful shutdown
    let isShuttingDown = false;
    const shutdown = async (signal?: string) => {
      if (isShuttingDown) {
        return;
      }
      isShuttingDown = true;

      if (runtimeOptions.debug) {
        logger.debug(`Shutting down HyperTool server... (${signal || "manual"})`);
      }

      // Set a hard timeout for graceful shutdown
      const forceExitTimeout = setTimeout(() => {
        logger.error("Forcefully exiting after timeout - graceful shutdown failed");
        process.exit(1);
      }, 5000);

      try {
        await server.stop();
        clearTimeout(forceExitTimeout);
        process.exit(0);
      } catch (error) {
        logger.error("Error during shutdown:", error);
        clearTimeout(forceExitTimeout);
        process.exit(1);
      }
    };

    // Handle signals
    process.on("SIGINT", () => setImmediate(() => shutdown("SIGINT")));
    process.on("SIGTERM", () => setImmediate(() => shutdown("SIGTERM")));
    process.on("SIGHUP", () => setImmediate(() => shutdown("SIGHUP")));

    // Handle uncaught exceptions
    process.on("uncaughtException", (error) => {
      logger.error("Uncaught exception:", error);
      shutdown("uncaughtException");
    });

    // Handle stdin end as shutdown signal only for stdio transport (and not in test environment)
    if (runtimeOptions.transport === "stdio" && process.env.NODE_ENV !== "test") {
      process.stdin.on("end", () => {
        logger.debug("stdin ended, shutting down...");
        shutdown("stdin-end");
      });
    }

    // Create initialization options
    const initOptions: ServerInitOptions = MetaMCPServerFactory.createInitOptions({
      transport: transportConfig,
      debug: runtimeOptions.debug,
      configPath: configResult.configPath,
      configSource: configResult.configSource,
    });

    // Start the server
    await server.start(initOptions, runtimeOptions);

  } catch (error) {
    logger.error("Failed to start HyperTool server:", error);
    process.exit(1);
  }
}

// For programmatic use
export { startServer };

/**
 * Simple CLI argument parser for basic flags
 */
function parseCliArgs(args: string[]): Partial<SmitheryConfig> {
  const config: Partial<SmitheryConfig> = {};
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const nextArg = args[i + 1];
    
    switch (arg) {
      case '--mcp-config':
        if (nextArg && !nextArg.startsWith('--')) {
          config.mcpConfigPath = nextArg;
          i++; // skip next arg since we consumed it
        }
        break;
      case '--debug':
        config.debug = true;
        break;
      case '--log-level':
        if (nextArg && !nextArg.startsWith('--')) {
          config.logLevel = nextArg;
          i++; // skip next arg since we consumed it
        }
        break;
      case '--group':
        if (nextArg && !nextArg.startsWith('--')) {
          config.group = nextArg;
          i++; // skip next arg since we consumed it
        }
        break;
      case '--equip-toolset':
        if (nextArg && !nextArg.startsWith('--')) {
          config.equipToolset = nextArg;
          i++; // skip next arg since we consumed it
        }
        break;
      case '--transport':
        if (nextArg && !nextArg.startsWith('--')) {
          config.transport = nextArg as RuntimeTransportType;
          i++; // skip next arg since we consumed it
        }
        break;
      case '--port':
        if (nextArg && !nextArg.startsWith('--')) {
          config.port = parseInt(nextArg, 10);
          i++; // skip next arg since we consumed it
        }
        break;
      case '--host':
        if (nextArg && !nextArg.startsWith('--')) {
          config.host = nextArg;
          i++; // skip next arg since we consumed it
        }
        break;
    }
  }
  
  return config;
}

// Auto-start if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  // Parse CLI arguments first
  const cliArgs = parseCliArgs(process.argv.slice(2));
  
  // Parse configuration from environment variables (fallback)
  const envConfig: SmitheryConfig = {
    mcpConfigPath: process.env.MCP_CONFIG_PATH,
    debug: process.env.DEBUG === "true",
    logLevel: process.env.LOG_LEVEL || "info",
    group: process.env.SERVER_GROUP,
    equipToolset: process.env.EQUIP_TOOLSET,
  };
  
  // Merge configurations - CLI args take precedence over env vars
  const config: SmitheryConfig = {
    ...envConfig,
    ...cliArgs,
  };

  await startServer(config);
}