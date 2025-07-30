#!/usr/bin/env node
/**
 * HyperTool MCP server main entry point
 */

import { Command } from "commander";
import { RuntimeOptions, RuntimeTransportType } from "./types/runtime.js";
import {
  APP_DESCRIPTION,
  APP_VERSION,
  APP_TECHNICAL_NAME,
  APP_NAME,
} from "./config/appConfig.js";
import type { TransportConfig } from "./server/types.js";
import { theme, semantic } from "./utils/theme.js";

async function handleInstallOption(installArgs: string[], isDryRun: boolean) {
  // Default to 'all' if no option provided
  const option = installArgs && installArgs.length > 0 ? installArgs[0] : "all";

  // Normalize option aliases
  const normalizedOption = (() => {
    switch (option.toLowerCase()) {
      case "all":
        return "all";
      case "claude-desktop":
      case "cd":
        return "claude-desktop";
      case "cursor":
        return "cursor";
      case "claude-code":
      case "cc":
        return "claude-code";
      default:
        return null;
    }
  })();

  if (!normalizedOption) {
    console.error(semantic.messageError("❌ Invalid install option: " + option));
    console.error(
      theme.warning(
        "   Valid options: all (default), claude-desktop (cd), cursor, claude-code (cc)"
      )
    );
    throw new Error("Invalid install option");
  }

  try {
    switch (normalizedOption) {
      case "all":
        const { GlobalSetup } = await import("./scripts/global/setup.js");
        const globalSetup = new GlobalSetup();
        await globalSetup.run(isDryRun);
        break;
      case "claude-desktop":
        const { ClaudeDesktopSetup } = await import(
          "./scripts/claude-desktop/setup.js"
        );
        const setup = new ClaudeDesktopSetup();
        await setup.run(isDryRun);
        break;
      case "cursor":
        const { CursorSetup } = await import("./scripts/cursor/setup.js");
        const cursorSetup = new CursorSetup();
        await cursorSetup.run(isDryRun);
        break;
      case "claude-code":
        const { installClaudeCodeCommands } = await import(
          "./scripts/claude-code/setup.js"
        );
        await installClaudeCodeCommands({ dryRun: isDryRun });
        break;
      default:
        throw new Error(semantic.messageError("❌ Invalid install option: " + option));
    }
  } catch (error) {
    throw new Error(
      semantic.messageError(`❌ Failed to run ${normalizedOption} setup:`),
      error as Error
    );
  }
}

// Define MCP server run options in a reusable way
const mcpServerRunOptions = [
  {
    flags: "--transport <type>",
    description: theme.info("Transport protocol to use") + " (http, stdio)",
    defaultValue: "stdio"
  },
  {
    flags: "--port <number>",
    description: theme.info("Port number for HTTP transport") + " (only valid with --transport http)"
  },
  {
    flags: "--debug",
    description: theme.info("Enable debug mode with verbose logging"),
    defaultValue: false
  },
  {
    flags: "--insecure",
    description: theme.warning("Allow tools with changed reference hashes") + semantic.messageError(" (insecure mode)"),
    defaultValue: false
  },
  {
    flags: "--equip-toolset <name>",
    description: theme.info("Toolset name to equip on startup")
  },
  {
    flags: "--mcp-config <path>",
    description: theme.info("Path to MCP configuration file") + " (.mcp.json)"
  },
  {
    flags: "--log-level <level>",
    description: theme.info("Log level") + " (trace, debug, info, warn, error, fatal)",
    defaultValue: "info"
  }
];

/**
 * Add MCP server run options to a command
 */
function addMcpServerOptions(command: Command): Command {
  mcpServerRunOptions.forEach(opt => {
    if (opt.defaultValue !== undefined) {
      command.option(opt.flags, opt.description, opt.defaultValue);
    } else {
      command.option(opt.flags, opt.description);
    }
  });
  return command;
}

/**
 * Run the MCP server with the given options
 */
async function runMcpServer(options: any): Promise<void> {
  // Validate transport type
  const transport = options.transport as RuntimeTransportType;
  if (!["http", "stdio"].includes(transport)) {
    console.error(semantic.messageError(`❌ Invalid transport type: ${transport}`));
    console.error(theme.warning("   Valid options: http, stdio"));
    process.exit(1);
  }

  // Validate port is only used with http transport
  if (options.port && transport !== "http") {
    console.error(
      semantic.messageError("❌ --port flag can only be used with --transport http")
    );
    process.exit(1);
  }

  const port = options.port ? parseInt(options.port) : 3000;
  if (isNaN(port) || port < 1 || port > 65535) {
    console.error(semantic.messageError(`❌ Invalid port number: ${options.port}`));
    console.error(theme.warning("   Port must be between 1 and 65535"));
    process.exit(1);
  }

  // Validate log level
  const logLevel = options.logLevel;
  const validLogLevels = ["trace", "debug", "info", "warn", "error", "fatal"];
  if (!validLogLevels.includes(logLevel)) {
    console.error(semantic.messageError(`❌ Invalid log level: ${logLevel}`));
    console.error(
      theme.warning(`   Valid options: ${validLogLevels.join(", ")}`)
    );
    process.exit(1);
  }

  const runtimeOptions: RuntimeOptions = {
    transport,
    port: transport === "http" ? port : undefined,
    debug: options.debug || false,
    insecure: options.insecure || false,
    equipToolset: options.equipToolset,
    configPath: options.mcpConfig,
    logLevel,
  };

  // ! We use dynamic imports to ensure that the transport and logging configuration is initialized
  // ! in the correct order.
  // Initialize logger based on transport type
  const { getLogger, STDIO_LOGGING_CONFIG } = await import("./utils/logging.js");
  const logger = runtimeOptions.transport === 'stdio'
    ? getLogger(STDIO_LOGGING_CONFIG)  // stderr + file logging for stdio transport
    : getLogger();

  // Dynamic imports for all modules that might create worker threads
  const { displayBanner, displayServerRuntimeInfo, output } = await import("./utils/output.js");
  const { discoverMcpConfig } = await import("./config/mcpConfigLoader.js");

  // Update logger configuration
  logger.updateConfig({
    level: (runtimeOptions.logLevel ||
      (runtimeOptions.debug ? "debug" : "info")) as any,
  });

  // Discover MCP configuration
  const configResult = await discoverMcpConfig(
    runtimeOptions.configPath,
    true // Update preference when CLI path is provided
  );

  // Handle configuration discovery results
  if (!configResult.configPath) {
    console.error(semantic.messageError("❌ No MCP configuration found"));
    console.error("");
    console.error(
      theme.warning(configResult.errorMessage || "Unknown configuration error")
    );
    console.error("");
    console.error(
      theme.info("💡 Use --mcp-config <path> to specify a configuration file")
    );
    process.exit(1);
  }

  // Display config source info in debug mode
  if (runtimeOptions.debug) {
    const sourceText = {
      cli: "command line argument",
      preference: "user preference",
      discovered: "automatic discovery",
      none: "unknown source",
    }[configResult.source];
    logger.debug(`Config source: ${sourceText}`);
  }

  // Create transport config from runtime options
  const { MetaMCPServerFactory } = await import("./server/index.js");

  const transportConfig: TransportConfig = {
    type: runtimeOptions.transport,
    ...(runtimeOptions.transport === "http" && {
      port: runtimeOptions.port || 3000,
      host: "localhost",
    }),
  };

  // Create server instance
  const server = MetaMCPServerFactory.createDefaultServer(transportConfig);

  // Setup graceful shutdown
  let isShuttingDown = false;
  const shutdown = async (signal?: string) => {
    // Prevent multiple shutdown attempts
    if (isShuttingDown) {
      return;
    }
    isShuttingDown = true;
    
    if (runtimeOptions.debug) {
      console.log(theme.warning(`🛑 Shutting down HyperTool server... (${signal || 'manual'})`));
    }
    
    // Set a hard timeout to force exit if graceful shutdown fails
    const forceExitTimeout = setTimeout(() => {
      console.error(semantic.messageError('⚠️  Forcefully exiting after timeout...'));
      process.exit(1);
    }, 5000); // 5 second timeout
    
    try {
      await server.stop();
      clearTimeout(forceExitTimeout);
      process.exit(0);
    } catch (error) {
      logger.error('Error during shutdown:', error);
      clearTimeout(forceExitTimeout);
      process.exit(1);
    }
  };

  // Handle signals - use setImmediate to ensure signal is processed immediately
  process.on("SIGINT", () => {
    setImmediate(() => shutdown("SIGINT"));
  });
  process.on("SIGTERM", () => {
    setImmediate(() => shutdown("SIGTERM"));
  });
  
  // For stdio mode, also handle SIGHUP which can occur when terminal closes
  if (runtimeOptions.transport === 'stdio') {
    process.on("SIGHUP", () => {
      setImmediate(() => shutdown("SIGHUP"));
    });
    
    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught exception:', error);
      shutdown('uncaughtException');
    });
    
    // In production, handle stdin end as a shutdown signal
    // Skip this in test environment to avoid premature shutdown
    if (process.env.NODE_ENV !== 'test') {
      process.stdin.on('end', () => {
        logger.debug('stdin ended, shutting down...');
        shutdown('stdin-end');
      });
    }
  }

  // Only show banner and clear terminal for HTTP transport
  // For stdio, any output to stdout will interfere with MCP protocol
  if (runtimeOptions.transport === 'http') {
    output.clearTerminal();
    displayBanner(APP_NAME);
    displayServerRuntimeInfo(runtimeOptions.transport, runtimeOptions.port, "localhost");
  }

  // Start server
  const initOptions = MetaMCPServerFactory.createInitOptions({
    transport: transportConfig,
    debug: runtimeOptions.debug,
    configPath: configResult.configPath,
  });

  await server.start(initOptions, runtimeOptions);

  // Only show warnings and separator for HTTP transport
  if (runtimeOptions.transport === 'http') {
    if (runtimeOptions.insecure) {
      logger.warn(
        semantic.messageError(
          "⚠️  INSECURE MODE: Tools with changed reference hashes are allowed"
        )
      );
    }
    output.displaySeparator();
  }
}

async function getMcpCommand(): Promise<Command> {
  const mcpCommand = new Command('mcp')
    .description('MCP server operations and management');
  
  // Add 'run' subcommand for running the MCP server
  const runCommand = new Command('run')
    .description('Run the MCP server (default if no subcommand specified)');
  
  // Add all MCP server options to the run command
  addMcpServerOptions(runCommand);
  
  runCommand.action(async (options) => {
    // Run the MCP server with the given options
    await runMcpServer(options);
  });
  
  mcpCommand.addCommand(runCommand);
  
  // Add MCP server management commands directly
  const { createListCommand, createGetCommand, createAddCommand, createRemoveCommand } = await import("./mcp-manager/cli/index.js");
  mcpCommand.addCommand(createListCommand());
  mcpCommand.addCommand(createGetCommand());
  mcpCommand.addCommand(createAddCommand());
  mcpCommand.addCommand(createRemoveCommand());
  
  return mcpCommand;
}

/**
 * Parse CLI arguments and return runtime options
 */
async function parseCliArguments(): Promise<RuntimeOptions> {
  const program = new Command();

  program
    .name(APP_TECHNICAL_NAME)
    .description(theme.info(APP_DESCRIPTION))
    .version(APP_VERSION);

  // Add all MCP server options at the root level
  addMcpServerOptions(program);

  // Add install-specific options
  program
    .option(
      "--dry-run",
      theme.info("Show what would be done without making changes") +
      theme.warning(" (only valid with --install)"),
      false
    )
    .option(
      "--install [app]",
      theme.info("Install and configure integrations.\n") +
      theme.label(
        "Options: all (default), claude-desktop (cd), cursor, claude-code (cc)\n"
      ) +
      theme.warning("Examples:\n") +
      theme.muted(
        "  hypertool-mcp --install            # Install for all detected apps\n"
      ) +
      theme.muted("  hypertool-mcp --install claude-desktop\n") +
      theme.muted("  hypertool-mcp --install cursor --dry-run\n") +
      theme.muted("  hypertool-mcp --install cc --dry-run")
    )
    .action(async (options) => {
      // This action only runs when NO subcommand is specified
      
      // Validate that --dry-run is only used with --install
      if (options.dryRun && !options.install) {
        console.error(
          semantic.messageError("❌ --dry-run flag can only be used with --install")
        );
        console.error(
          theme.warning("   Usage: hypertool-mcp --install claude-desktop --dry-run")
        );
        process.exit(1);
      }
      
      // Handle install option
      if (options.install !== undefined) {
        const installApp = typeof options.install === "string" ? options.install : "all";
        await handleInstallOption([installApp], options.dryRun);
        process.exit(0);
      }
      
      // Default behavior: run the MCP server
      await runMcpServer(options);
    });

  // Add config subcommands
  const { createConfigCommands } = await import("./config-manager/cli/index.js");
  program.addCommand(createConfigCommands());
  
  // Add mcp command with subcommands
  const mcpCommand = await getMcpCommand();
  program.addCommand(mcpCommand);
  
  // Parse the arguments - all actions will be handled by their respective handlers
  await program.parseAsync();

  // Return empty - actions have been handled
  return {} as RuntimeOptions;
}

/**
 * Main entry point for HyperTool MCP server
 */
async function main(): Promise<void> {
  try {
    // Parse CLI arguments - this will handle commands and options
    await parseCliArguments();
  } catch (error) {
    console.error(semantic.messageError(`❌ Failed to start HyperTool server:`), error);
    process.exit(1);
  }
}

// This file is now used as a library - binary entry point is in bin.ts

await main();
