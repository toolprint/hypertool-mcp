#!/usr/bin/env node
/**
 * HyperTool MCP server main entry point
 */

// Set max listeners early to prevent warnings from MCP SDK and other dependencies
// This can be configured via HYPERTOOL_MAX_LISTENERS environment variable
// Default is 10, but you may need to increase it if you have many MCP servers connected
// Example: HYPERTOOL_MAX_LISTENERS=30 hypertool-mcp
const maxListeners = process.env.HYPERTOOL_MAX_LISTENERS 
  ? parseInt(process.env.HYPERTOOL_MAX_LISTENERS, 10) 
  : 10;
if (!isNaN(maxListeners) && maxListeners > 0) {
  process.setMaxListeners(maxListeners);
}

import { Command, Argument } from "commander";
import { RuntimeOptions, RuntimeTransportType } from "./types/runtime.js";
import {
  APP_DESCRIPTION,
  APP_VERSION,
  APP_TECHNICAL_NAME,
  APP_NAME,
} from "./config/appConfig.js";
import type { TransportConfig } from "./server/types.js";
import { theme, semantic } from "./utils/theme.js";
// Logger will be initialized later with proper runtime options

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
    console.error(
      semantic.messageError("❌ Invalid install option: " + option)
    );
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
        throw new Error(
          semantic.messageError("❌ Invalid install option: " + option)
        );
    }
  } catch (error) {
    throw new Error(
      semantic.messageError(`❌ Failed to run ${normalizedOption} setup:`),
      error as Error
    );
  }
}

async function getAddToCommand(): Promise<Command> {
  const addToCommand = new Command("add-to")
    .description("Add HyperTool to an application")
    .addArgument(
      new Argument("[app]", "Application to add HyperTool to")
        .default("all")
        .choices(["all", "claude-desktop", "cd", "cursor", "claude-code", "cc"])
    )
    .option(
      "--dry-run",
      "Show what would be done without making changes",
      false
    )
    .addHelpText(
      "after",
      `
  ${theme.label("Application aliases:")}
    cd = claude-desktop
    cc = claude-code

  ${theme.label("Examples:")}
    ${theme.muted("hypertool-mcp add-to                    # Add to all detected apps")}
    ${theme.muted("hypertool-mcp add-to claude-desktop     # Add to Claude Desktop only")}
    ${theme.muted("hypertool-mcp add-to cursor --dry-run   # Preview Cursor setup")}
    ${theme.muted("hypertool-mcp add-to cc                 # Add to Claude Code")}`
    )
    .action(async (app, options) => {
      await handleInstallOption([app], options.dryRun);
    });

  return addToCommand;
}

// Define MCP server run options in a reusable way
const mcpServerRunOptions = [
  {
    flags: "--transport <type>",
    description: theme.info("Transport protocol to use") + " (http, stdio)",
    defaultValue: "stdio",
  },
  {
    flags: "--port <number>",
    description:
      theme.info("Port number for HTTP transport") +
      " (only valid with --transport http)",
  },
  {
    flags: "--debug",
    description: theme.info("Enable debug mode with verbose logging"),
    defaultValue: false,
  },
  {
    flags: "--insecure",
    description:
      theme.warning("Allow tools with changed reference hashes") +
      semantic.messageError(" (insecure mode)"),
    defaultValue: false,
  },
  {
    flags: "--equip-toolset <name>",
    description: theme.info("Toolset name to equip on startup"),
  },
  {
    flags: "--mcp-config <path>",
    description: theme.info("Path to MCP configuration file") + " (.mcp.json)",
    defaultValue: undefined,
  },
  {
    flags: "--log-level <level>",
    description:
      theme.info("Log level") + " (trace, debug, info, warn, error, fatal)",
    defaultValue: "info",
  },
  {
    flags: "--linked-app <app-id>",
    description: theme.info("Link to specific application configuration") +
      "\n" +
      theme.label("Options: claude-desktop, cursor, claude-code"),
  },
  {
    flags: "--profile <profile-id>",
    description: theme.info("Use specific profile for workspace/project") +
      theme.muted(" (basic support - full profile management TODO)"),
  },
  {
    flags: "--group <name>",
    description: theme.info("Server group name to load servers from"),
  },
];

/**
 * Add MCP server run options to a command
 */
function addMcpServerOptions(command: Command): Command {
  mcpServerRunOptions.forEach((opt) => {
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
    console.error(
      semantic.messageError(`❌ Invalid transport type: ${transport}`)
    );
    console.error(theme.warning("   Valid options: http, stdio"));
    process.exit(1);
  }

  // Validate port is only used with http transport
  if (options.port && transport !== "http") {
    console.error(
      semantic.messageError(
        "❌ --port flag can only be used with --transport http"
      )
    );
    process.exit(1);
  }

  const port = options.port ? parseInt(options.port) : 3000;
  if (isNaN(port) || port < 1 || port > 65535) {
    console.error(
      semantic.messageError(`❌ Invalid port number: ${options.port}`)
    );
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
    linkedApp: options.linkedApp,
    profile: options.profile,
    logLevel,
    group: options.group,
  };

  // ! We use dynamic imports to ensure that the transport and logging configuration is initialized
  // ! in the correct order.
  // Initialize logger with transport-aware configuration
  const { getLogger } = await import("./utils/logging.js");
  const logger = getLogger(undefined, runtimeOptions);

  // Set up process warning listener to capture Node.js warnings in logs
  process.on('warning', (warning) => {
    logger.warn('Node.js warning', {
      name: warning.name,
      message: warning.message,
      stack: warning.stack
    });
  });

  // Dynamic imports for all modules that might create worker threads
  const { displayBanner, displayServerRuntimeInfo, output } = await import(
    "./utils/output.js"
  );
  const { discoverMcpConfig } = await import("./config/mcpConfigLoader.js");

  // Discover MCP configuration
  const configResult = await discoverMcpConfig(
    runtimeOptions.configPath,
    true, // Update preference when CLI path is provided
    runtimeOptions.linkedApp,
    runtimeOptions.profile
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
      theme.info("💡 Use --linked-app <app-id> to load app-specific config or")
    );
    console.error(
      theme.info("   --mcp-config <path> to specify a configuration file")
    );
    process.exit(1);
  }

  // Display config source info in debug mode
  if (runtimeOptions.debug) {
    const sourceText = {
      cli: "command line argument",
      app: `application config (${runtimeOptions.linkedApp}${runtimeOptions.profile ? `/${runtimeOptions.profile}` : ""})`,
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
      logger.debug(`Shutting down HyperTool server... (${signal || "manual"})`);
    }

    // Set a hard timeout to force exit if graceful shutdown fails
    const forceExitTimeout = setTimeout(() => {
      logger.error("Forcefully exiting after timeout - graceful shutdown failed");
      process.exit(1);
    }, 5000); // 5 second timeout

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

  // Handle signals - use setImmediate to ensure signal is processed immediately
  process.on("SIGINT", () => {
    setImmediate(() => shutdown("SIGINT"));
  });
  process.on("SIGTERM", () => {
    setImmediate(() => shutdown("SIGTERM"));
  });

  // For stdio mode, also handle SIGHUP which can occur when terminal closes
  if (runtimeOptions.transport === "stdio") {
    process.on("SIGHUP", () => {
      setImmediate(() => shutdown("SIGHUP"));
    });

    // Handle uncaught exceptions
    process.on("uncaughtException", (error) => {
      logger.error("Uncaught exception:", error);
      shutdown("uncaughtException");
    });

    // In production, handle stdin end as a shutdown signal
    // Skip this in test environment to avoid premature shutdown
    if (process.env.NODE_ENV !== "test") {
      process.stdin.on("end", () => {
        logger.debug("stdin ended, shutting down...");
        shutdown("stdin-end");
      });
    }
  }

  // Only show banner and clear terminal for HTTP transport
  // For stdio, any output to stdout will interfere with MCP protocol
  if (runtimeOptions.transport === "http") {
    output.clearTerminal();
    displayBanner(APP_NAME);
    displayServerRuntimeInfo(
      runtimeOptions.transport,
      runtimeOptions.port,
      "localhost"
    );
  }

  // Start server
  const initOptions = MetaMCPServerFactory.createInitOptions({
    transport: transportConfig,
    debug: runtimeOptions.debug,
    configPath: configResult.configPath,
    configSource: configResult.configSource,
  });

  await server.start(initOptions, runtimeOptions);

  // Only show warnings and separator for HTTP transport
  if (runtimeOptions.transport === "http") {
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


/**
 * Parse CLI arguments and set up the program structure
 */
async function parseCliArguments(): Promise<RuntimeOptions> {
  const program = new Command();

  program
    .name(APP_TECHNICAL_NAME)
    .description(theme.info(APP_DESCRIPTION))
    .version(APP_VERSION)
    .option(
      "--dry-run",
      theme.info("Show what would be done without making changes") +
        theme.warning(" (only valid with --install)"),
      false
    )
    .option(
      "--install [app]",
      theme.warning("⚠️  DEPRECATED: Use 'hypertool-mcp setup' instead\n") +
        theme.info("Install and configure integrations (legacy support)\n") +
        theme.label(
          "Options: all (default), claude-desktop (cd), cursor, claude-code (cc)\n"
        ) +
        theme.muted("Examples:\n") +
        theme.muted(
          "  hypertool-mcp setup               # Modern setup (recommended)\n"
        ) +
        theme.muted(
          "  hypertool-mcp --install           # Legacy install (deprecated)\n"
        )
    );

  // Add config subcommands
  const { createConfigCommands } = await import(
    "./config-manager/cli/index.js"
  );
  program.addCommand(createConfigCommands());

  // Add setup command directly
  const setupModule = await import("./commands/setup/index.js");
  program.addCommand(setupModule.createSetupCommand());

  // Add service management commands
  const { createServiceCommand } = await import("./commands/service/index.js");
  program.addCommand(createServiceCommand());

  // Toolset management is available via MCP tools when server is running
  // No top-level CLI commands needed per docs/NAVIGATION.md

  // Add mcp command with subcommands
  const mcpCommand = new Command("mcp").description(
    "MCP server operations and management"
  );

  // Add 'run' subcommand for running the MCP server
  const runCommand = new Command("run")
    .description("Run the MCP server (default if no subcommand specified)");

  // Add all MCP server options to the run command
  addMcpServerOptions(runCommand);

  runCommand.action(async (options) => {
    // Run the MCP server with the given options
    await runMcpServer(options);
  });

  mcpCommand.addCommand(runCommand);

  // Add MCP server management commands directly
  const {
    createListCommand,
    createGetCommand,
    createAddCommand,
    createRemoveCommand,
    createGroupCommands,
  } = await import("./mcp-manager/cli/index.js");
  mcpCommand.addCommand(createListCommand());
  mcpCommand.addCommand(createGetCommand());
  mcpCommand.addCommand(createAddCommand());
  mcpCommand.addCommand(createRemoveCommand());
  mcpCommand.addCommand(createGroupCommands());

  program.addCommand(mcpCommand);

  // Check if this is first run (no config exists)
  const { SetupWizard } = await import("./commands/setup/setup.js");
  const isFirstRun = await SetupWizard.isFirstRun();

  // If no command is specified, default to 'mcp run' or 'setup'
  // But only if the first argument isn't already a known command
  const cliArgs = process.argv.slice(2);
  const knownCommands = [
    "config", 
    "mcp", 
    "setup", 
    "service",
    "help"
  ];
  const knownMcpSubcommands = ["run", "list", "get", "add", "remove"];

  // Check if any argument is a known command
  let hasCommand = false;
  let hasMcpCommand = false;
  for (const arg of cliArgs) {
    if (knownCommands.includes(arg)) {
      hasCommand = true;
      if (arg === "mcp") {
        hasMcpCommand = true;
      }
      break;
    }
  }

  // Also check for special global options that should not trigger mcp command
  const hasSpecialGlobalOption =
    cliArgs.includes("--help") ||
    cliArgs.includes("-h") ||
    cliArgs.includes("--version") ||
    cliArgs.includes("-V") ||
    cliArgs.some((arg) => arg.startsWith("--install"));

  // If we have arguments but no command and no special global options, insert 'mcp run'
  if (cliArgs.length > 0 && !hasCommand && !hasSpecialGlobalOption) {
    process.argv.splice(2, 0, "mcp", "run");
  }
  // If we have 'mcp' command but no subcommand, insert 'run'
  else if (hasMcpCommand && cliArgs.length === 1) {
    process.argv.splice(3, 0, "run");
  }
  // If we have 'mcp' followed by options (not a subcommand), insert 'run'
  else if (
    hasMcpCommand &&
    cliArgs.length > 1 &&
    !knownMcpSubcommands.includes(cliArgs[1]) &&
    cliArgs[1].startsWith("--")
  ) {
    process.argv.splice(3, 0, "run");
  }
  // If no arguments at all, default to 'setup' for first run or 'mcp run'
  else if (cliArgs.length === 0) {
    if (isFirstRun) {
      console.log(theme.success("🎯 Welcome to Hypertool MCP!"));
      console.log(
        theme.info("   No configuration detected. Let's get you set up!\n")
      );
      console.log(theme.muted("   Running: hypertool-mcp setup\n"));
      process.argv.push("setup");
    } else {
      process.argv.push("mcp", "run");
    }
  }

  // Check if we have 'mcp' command but no subcommand and need to add 'run'
  // (hasMcpCommand is already declared above)
  if (hasMcpCommand) {
    const mcpIndex = cliArgs.indexOf("mcp");
    const nextArg = cliArgs[mcpIndex + 1];
    // If there's no next arg or it's an option (starts with --), add 'run'
    if (!nextArg || nextArg.startsWith("--")) {
      process.argv.splice(2 + mcpIndex + 1, 0, "run");
    }
  }

  await program.parseAsync();

  // If we get here and no command was executed, we're done
  const args = process.argv.slice(2);
  if (args.length > 0 && (args[0] === "config" || args[0] === "help")) {
    // Subcommand was handled, exit
    process.exit(0);
  }

  const options = program.opts();

  // Validate that --dry-run is only used with --install
  if (options.dryRun && !options.install) {
    console.error(
      semantic.messageError("❌ --dry-run flag can only be used with --install")
    );
    console.error(
      theme.warning(
        "   Usage: hypertool-mcp --install claude-desktop --dry-run"
      )
    );
    throw new Error("Invalid install option");
  }

  if (options.install !== undefined) {
    // Show deprecation warning
    console.error("");
    console.error(theme.warning("⚠️  DEPRECATION WARNING"));
    console.error(
      theme.warning(
        "   The --install flag is deprecated and will be removed in a future version."
      )
    );
    console.error(
      theme.info("   Please use the modern setup command instead:")
    );
    console.error(theme.info(""));
    console.error(theme.success("   hypertool-mcp setup"));
    console.error(theme.info(""));
    console.error(
      theme.muted(
        "   The setup command provides a better interactive experience with"
      )
    );
    console.error(
      theme.muted("   more configuration options and non-interactive support.")
    );
    console.error("");

    // Wait a moment for the user to see the warning
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // options.install will be true if no app specified, or a string if app specified
    const installApp =
      typeof options.install === "string" ? options.install : "all";
    await handleInstallOption([installApp], options.dryRun);
    process.exit(0);
  }

  // If we get here, the MCP server options will be handled by the mcp subcommand
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
    // Use console.error since logger may not be initialized yet
    console.error(
      semantic.messageError(`❌ Failed to start HyperTool server:`),
      error
    );
    process.exit(1);
  }
}

// Export main server components for programmatic use
export { MetaMCPServer } from "./server/base.js";
export { EnhancedMetaMCPServer } from "./server/enhanced.js"; 
export { MetaMCPServerFactory } from "./server/factory.js";
export type { 
  MetaMCPServerConfig, 
  TransportConfig, 
  ServerInitOptions 
} from "./server/types.js";
export type { RuntimeOptions, RuntimeTransportType } from "./types/runtime.js";
export { discoverMcpConfig } from "./config/mcpConfigLoader.js";
export { startServer, SmitheryConfig } from "./server.js";

// This file is now used as a library - binary entry point is in bin.ts

await main();
