#!/usr/bin/env node
/**
 * HyperTool MCP server main entry point
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { RuntimeOptions, RuntimeTransportType } from "./types/runtime.js";
import { APP_DESCRIPTION, APP_VERSION, APP_TECHNICAL_NAME, APP_NAME } from "./config/appConfig.js";
import type { TransportConfig } from "./server/types.js";

async function handleInstallOption(installArgs: string[], isDryRun: boolean) {
  if (!installArgs || installArgs.length === 0) {
    console.error(chalk.red('❌ No install option provided'));
    console.error(chalk.yellow('   Valid options: claude-desktop (cd), cursor, claude-code (cc)'));
    console.error(chalk.cyan('   Usage: hypertool-mcp --install claude-desktop --dry-run'));
    throw new Error('No install option provided');
  }

  const [option] = installArgs;

  // Normalize option aliases
  const normalizedOption = (() => {
    switch (option.toLowerCase()) {
      case 'claude-desktop':
      case 'cd':
        return 'claude-desktop';
      case 'cursor':
        return 'cursor';
      case 'claude-code':
      case 'cc':
        return 'claude-code';
      default:
        return null;
    }
  })();

  if (!normalizedOption) {
    console.error(chalk.red('❌ Invalid install option: ' + option));
    console.error(chalk.yellow('   Valid options: claude-desktop (cd), cursor, claude-code (cc)'));
    throw new Error('Invalid install option');
  }

  try {
    switch (normalizedOption) {
      case 'claude-desktop':
        const { ClaudeDesktopSetup } = await import('./scripts/claude-desktop-setup.js');
        const setup = new ClaudeDesktopSetup();
        await setup.run(isDryRun);
        break;
      case 'cursor':
        throw new Error(chalk.yellow('⚠️  Cursor integration not yet implemented'));
        break;
      case 'claude-code':
        throw new Error(chalk.yellow('⚠️  Claude Code integration not yet implemented'));
        break;
      default:
        throw new Error(chalk.red('❌ Invalid install option: ' + option));
    }

  } catch (error) {
    throw new Error(chalk.red(`❌ Failed to run ${normalizedOption} setup:`), error as Error);
  }
}


/**
 * Parse CLI arguments and return runtime options
 */
async function parseCliArguments(): Promise<RuntimeOptions> {
  const program = new Command();

  program
    .name(APP_TECHNICAL_NAME)
    .description(chalk.blue(APP_DESCRIPTION))
    .version(APP_VERSION)
    .option(
      "--transport <type>",
      chalk.cyan("Transport protocol to use") + " (http, stdio)",
      "stdio"
    )
    .option(
      "--port <number>",
      chalk.cyan("Port number for HTTP transport") +
        " (only valid with --transport http)"
    )
    .option(
      "--debug",
      chalk.cyan("Enable debug mode with verbose logging"),
      false
    )
    .option(
      "--insecure",
      chalk.yellow("Allow tools with changed reference hashes") +
        chalk.red(" (insecure mode)"),
      false
    )
    .option(
      "--equip-toolset <name>",
      chalk.cyan("Toolset name to equip on startup")
    )
    .option(
      "--mcp-config <path>",
      chalk.cyan("Path to MCP configuration file") + " (.mcp.json)"
    )
    .option(
      '--log-level <level>',
      chalk.cyan('Log level') + ' (trace, debug, info, warn, error, fatal)',
      'info'
    )
    .option(
      '--dry-run',
      chalk.cyan('Show what would be done without making changes') + chalk.yellow(' (only valid with --install)'),
      false
    )
    .option(
      '--install <option>',
      chalk.cyan('Install and configure integrations.\n') +
      chalk.white('Options: claude-desktop (cd), cursor, claude-code (cc)\n') +
      chalk.yellow('Examples:\n') +
      chalk.gray('  hypertool-mcp --install claude-desktop\n') +
      chalk.gray('  hypertool-mcp --install cursor --dry-run\n') +
      chalk.gray('  hypertool-mcp --install cc --dry-run')
    )

  // program.addCommand(createInstallCommand());
  await program.parseAsync();

  const options = program.opts();
  console.log(options)

  // Validate that --dry-run is only used with --install
  if (options.dryRun && !options.install) {
    console.error(chalk.red('❌ --dry-run flag can only be used with --install'));
    console.error(chalk.yellow('   Usage: hypertool-mcp --install claude-desktop --dry-run'));
    throw new Error('Invalid install option');
  }

  if (options.install) {
    console.log('HERE INSTALL')
    await handleInstallOption([options.install], options.dryRun);
    process.exit(0);
  }

  console.log('HERE NO INSTALL')

  // Validate transport type
  const transport = options.transport as RuntimeTransportType;
  if (!["http", "stdio"].includes(transport)) {
    console.error(chalk.red(`❌ Invalid transport type: ${transport}`));
    console.error(chalk.yellow("   Valid options: http, stdio"));
    process.exit(1);
  }

  // Validate port is only used with http transport
  if (options.port && transport !== "http") {
    console.error(
      chalk.red("❌ --port flag can only be used with --transport http")
    );
    process.exit(1);
  }

  const port = options.port ? parseInt(options.port) : 3000;
  if (isNaN(port) || port < 1 || port > 65535) {
    console.error(chalk.red(`❌ Invalid port number: ${options.port}`));
    console.error(chalk.yellow("   Port must be between 1 and 65535"));
    process.exit(1);
  }

  // Validate log level
  const logLevel = options.logLevel;
  const validLogLevels = ["trace", "debug", "info", "warn", "error", "fatal"];
  if (!validLogLevels.includes(logLevel)) {
    console.error(chalk.red(`❌ Invalid log level: ${logLevel}`));
    console.error(
      chalk.yellow(`   Valid options: ${validLogLevels.join(", ")}`)
    );
    process.exit(1);
  }

  return {
    transport,
    port: transport === "http" ? port : undefined,
    debug: options.debug || false,
    insecure: options.insecure || false,
    equipToolset: options.equipToolset,
    configPath: options.mcpConfig,
    logLevel,
  };
}

/**
 * Main entry point for HyperTool MCP server
 */
async function main(): Promise<void> {
  try {
    // Parse CLI arguments
    const runtimeOptions = await parseCliArguments();

    // Dynamic imports for all modules that might create worker threads
    const { logger } = await import("./logging/index.js");
    const { displayServerBanner, output } = await import("./logging/output.js");
    const { discoverMcpConfig } = await import("./config/mcpConfigLoader.js");

    // Update logger configuration
    logger.updateConfig({
      level: (runtimeOptions.logLevel || (runtimeOptions.debug ? 'debug' : 'info')) as any,
    });

    // Discover MCP configuration
    const configResult = await discoverMcpConfig(
      runtimeOptions.configPath,
      true // Update preference when CLI path is provided
    );

    // Handle configuration discovery results
    if (!configResult.configPath) {
      console.error(chalk.red("❌ No MCP configuration found"));
      console.error("");
      console.error(
        chalk.yellow(configResult.errorMessage || "Unknown configuration error")
      );
      console.error("");
      console.error(
        chalk.cyan("💡 Use --mcp-config <path> to specify a configuration file")
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
    }

    // Create transport config from runtime options
    // Dynamic import of server modules only when needed
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
    const shutdown = async () => {
      if (runtimeOptions.debug) {
        console.log(chalk.yellow(`🛑 Shutting down HyperTool server...`));
      }
      // Remove process listeners to prevent memory leaks
      process.removeListener("SIGINT", shutdown);
      process.removeListener("SIGTERM", shutdown);

      await server.stop();
      process.exit(0);
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);

    // Display server banner before starting (especially important for stdio)
    output.clearTerminal();
    displayServerBanner(
      APP_NAME,
      runtimeOptions.transport,
      runtimeOptions.port,
      runtimeOptions.transport === "http" ? "localhost" : undefined
    );

    // Start server
    const initOptions = MetaMCPServerFactory.createInitOptions({
      transport: transportConfig,
      debug: runtimeOptions.debug,
      configPath: configResult.configPath,
    });

    await server.start(initOptions, runtimeOptions);

    if (runtimeOptions.insecure) {
      logger.warn(
        chalk.red(
          "⚠️  INSECURE MODE: Tools with changed reference hashes are allowed"
        )
      );
    }

    output.displaySeparator();
  } catch (error) {
    console.error(chalk.red(`❌ Failed to start HyperTool server:`), error);
    process.exit(1);
  }
}

// Run if this file is executed directly
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { main };
export * from "./server/index.js";
export * from "./config/index.js";
export * from "./types/config.js";
export * from "./types/runtime.js";
export * from "./router/index.js";