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
import { 
  parseEnvDotNotation, 
  hasSmitheryConfig, 
  getConfigSourceDescription,
  validateParsedConfig,
  type ParsedEnvConfig 
} from "./utils/envConfigParser.js";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

// Configuration interface for Smithery
export interface SmitheryConfig {
  mcpConfigPath?: string;
  mcpServers?: any; // Flexible object for MCP server configuration from Smithery
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
  // Create runtime options from Smithery config first for logging
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
  
  // Parse environment variables for Smithery configuration
  const envConfig = parseEnvDotNotation();
  const hasEnvConfig = hasSmitheryConfig();
  
  // Log all available configuration sources for experimentation
  logger.info("=== SMITHERY CONFIGURATION EXPERIMENT ===");
  logger.info("CLI Arguments:", process.argv.slice(2));
  logger.info("Environment Variables:", Object.keys(process.env).filter(k => 
    k.includes('MCP') || k.includes('SMITHERY') || k.includes('CONFIG') || k.includes('SERVER')
  ).reduce((acc, key) => ({ ...acc, [key]: process.env[key] }), {}));
  logger.info("Passed Config Object:", config);
  
  if (hasEnvConfig) {
    logger.info("Parsed Environment Config:", envConfig);
    logger.info("Environment Config Sources:", getConfigSourceDescription(envConfig));
    
    // Validate environment configuration
    const validation = validateParsedConfig(envConfig);
    if (!validation.valid) {
      logger.warn("Environment configuration validation issues:", validation.errors);
    }
    
    // Merge environment config (but CLI args and passed config take precedence)
    config = {
      ...envConfig,
      ...config
    };
  }
  
  // Check for JSON configuration in environment
  const jsonConfigEnv = process.env.SMITHERY_CONFIG || process.env.MCP_CONFIG || process.env.CONFIG_JSON;
  if (jsonConfigEnv) {
    try {
      const parsedJsonConfig = JSON.parse(jsonConfigEnv);
      logger.info("Parsed JSON Config from Environment:", parsedJsonConfig);
      // Merge JSON config if found (but other config takes precedence)
      config = {
        ...parsedJsonConfig,
        ...config
      };
    } catch (error) {
      logger.warn("Failed to parse JSON config from environment:", error);
    }
  }

  // Set up process warning listener
  process.on('warning', (warning) => {
    logger.warn('Node.js warning', {
      name: warning.name,
      message: warning.message,
      stack: warning.stack
    });
  });

  try {
    // Handle MCP server configuration from Smithery
    let configPath: string | null = null;
    let configSource = "unknown";
    let temporaryConfigFile: string | null = null;
    
    if (config.mcpServers && Object.keys(config.mcpServers).length > 0) {
      logger.info("Using MCP configuration from Smithery:", config.mcpServers);
      // Create a temporary file with Smithery configuration
      try {
        const tempDir = os.tmpdir();
        temporaryConfigFile = path.join(tempDir, `smithery-mcp-config-${Date.now()}.json`);
        const mcpConfig = { mcpServers: config.mcpServers };
        
        await fs.promises.writeFile(temporaryConfigFile, JSON.stringify(mcpConfig, null, 2));
        configPath = temporaryConfigFile;
        configSource = "smithery";
        
        logger.info(`Created temporary config file: ${temporaryConfigFile}`);
      } catch (error) {
        logger.error("Failed to create temporary configuration file:", error);
        process.exit(1);
      }
    } else {
      // Fallback to file-based configuration discovery
      logger.info("No MCP configuration from Smithery, using file-based discovery");
      const configResult = await discoverMcpConfig(
        runtimeOptions.configPath,
        false, // Don't update preference for Smithery installs
        runtimeOptions.linkedApp,
        runtimeOptions.profile
      );
      
      configPath = configResult.configPath;
      configSource = configResult.configSource?.type || "file";
      
      // Handle configuration discovery results
      if (!configPath) {
        logger.error("No MCP configuration found");
        if (configResult.errorMessage) {
          logger.error(configResult.errorMessage);
        }
        process.exit(1);
      }
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

      // Clean up temporary config file if created
      if (temporaryConfigFile) {
        try {
          await fs.promises.unlink(temporaryConfigFile);
          logger.debug(`Cleaned up temporary config file: ${temporaryConfigFile}`);
        } catch (error) {
          logger.warn(`Failed to clean up temporary config file: ${error}`);
        }
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
      configPath: configPath!,
      configSource: configSource,
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
  
  // Parse Smithery-style configuration from environment variables
  const parsedEnvConfig = parseEnvDotNotation();
  const hasSmitheryEnvConfig = hasSmitheryConfig();
  
  if (hasSmitheryEnvConfig) {
    console.log("Found Smithery configuration in environment:");
    console.log("Parsed config:", JSON.stringify(parsedEnvConfig, null, 2));
    console.log("Config sources:", getConfigSourceDescription(parsedEnvConfig));
    
    // Validate the parsed configuration
    const validation = validateParsedConfig(parsedEnvConfig);
    if (!validation.valid) {
      console.warn("Configuration validation warnings:", validation.errors);
    }
    
    // Merge environment configuration (CLI args take precedence)
    Object.assign(envConfig, parsedEnvConfig);
  }
  
  // Merge configurations - CLI args take precedence over env vars
  const config: SmitheryConfig = {
    ...envConfig,
    ...cliArgs,
  };

  await startServer(config);
}