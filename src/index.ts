#!/usr/bin/env node
/**
 * HyperTool MCP server main entry point
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { MetaMCPServerFactory } from "./server/index.js";
import { TransportConfig } from "./server/types.js";
import { RuntimeOptions, RuntimeTransportType } from "./types/runtime.js";
import { discoverMcpConfig } from "./config/mcpConfigLoader.js";
import { APP_NAME, APP_DESCRIPTION, APP_VERSION, APP_TECHNICAL_NAME } from "./config/appConfig.js";
import { logger, createLogger } from "./logging/index.js";
import { displayServerBanner, output } from "./logging/output.js";
import type { LevelWithSilent } from 'pino';

/**
 * Parse CLI arguments and return runtime options
 */
function parseCliArguments(): RuntimeOptions | undefined {
  const program = new Command();

  program
    .name(APP_TECHNICAL_NAME)
    .description(chalk.blue(APP_DESCRIPTION))
    .version(APP_VERSION)
    .option(
      '--transport <type>',
      chalk.cyan('Transport protocol to use') + ' (http, stdio)',
      'stdio'
    )
    .option(
      '--port <number>',
      chalk.cyan('Port number for HTTP transport') + ' (only valid with --transport http)'
    )
    .option(
      '--debug',
      chalk.cyan('Enable debug mode with verbose logging'),
      false
    )
    .option(
      '--insecure',
      chalk.yellow('Allow tools with changed reference hashes') + chalk.red(' (insecure mode)'),
      false
    )
    .option(
      '--equip-toolset <name>',
      chalk.cyan('Toolset name to equip on startup')
    )
    .option(
      '--mcp-config <path>',
      chalk.cyan('Path to MCP configuration file') + ' (.mcp.json)'
    )
    .option(
      '--log-level <level>',
      chalk.cyan('Log level') + ' (trace, debug, info, warn, error, fatal)',
      'info'
    );

  // Add install command with proper subcommands
  const installCommand = program
    .command('install')
    .description(chalk.blue('Install and configure integrations'))
    .configureOutput({
      writeErr: (str) => console.error(str),
      writeOut: (str) => console.log(str)
    });

  // Claude Desktop integration subcommand
  installCommand
    .command('claude-desktop')
    .alias('cd')
    .description(chalk.blue('Configure Claude Desktop to use HyperTool MCP proxy'))
    .option(
      '--dry-run',
      chalk.cyan('Show what would be done without making changes')
    )
    .action(async (options) => {
      try {
        const { ClaudeDesktopSetup } = await import('./scripts/claude-desktop-setup.js');
        const setup = new ClaudeDesktopSetup();
        await setup.run(options.dryRun);
        process.exit(0);
      } catch (error) {
        console.error(chalk.red('❌ Failed to run Claude Desktop setup:'), error);
        process.exit(1);
      }
    });

  // Cursor IDE integration subcommand (placeholder for task 29)
  installCommand
    .command('cursor')
    .description(chalk.blue('Configure Cursor IDE to use HyperTool MCP proxy'))
    .option(
      '--dry-run',
      chalk.cyan('Show what would be done without making changes')
    )
    .action(async (options) => {
      console.error(chalk.yellow('⚠️  Cursor integration not yet implemented'));
      console.error(chalk.cyan('   This feature is planned for Task 29'));
      process.exit(1);
    });

  // Claude Code integration subcommand (placeholder for task 31)
  installCommand
    .command('claude-code')
    .alias('cc')
    .description(chalk.blue('Install HyperTool slash commands in Claude Code'))
    .option(
      '--dry-run',
      chalk.cyan('Show what would be done without making changes')
    )
    .action(async (options) => {
      console.error(chalk.yellow('⚠️  Claude Code integration not yet implemented'));
      console.error(chalk.cyan('   This feature is planned for Task 31'));
      process.exit(1);
    });

  program.parse();
  
  // Check if a subcommand was parsed - if so, don't continue with main server logic
  const subcommand = program.args[0];
  if (subcommand === 'install') {
    // Subcommand will handle its own execution and exit
    return;
  }
  
  const options = program.opts();

  // Validate transport type
  const transport = options.transport as RuntimeTransportType;
  if (!['http', 'stdio'].includes(transport)) {
    console.error(chalk.red(`❌ Invalid transport type: ${transport}`));
    console.error(chalk.yellow('   Valid options: http, stdio'));
    process.exit(1);
  }

  // Validate port is only used with http transport
  if (options.port && transport !== 'http') {
    console.error(chalk.red('❌ --port flag can only be used with --transport http'));
    process.exit(1);
  }

  const port = options.port ? parseInt(options.port) : 3000;
  if (isNaN(port) || port < 1 || port > 65535) {
    console.error(chalk.red(`❌ Invalid port number: ${options.port}`));
    console.error(chalk.yellow('   Port must be between 1 and 65535'));
    process.exit(1);
  }

  // Validate log level
  const logLevel = options.logLevel;
  const validLogLevels = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'];
  if (!validLogLevels.includes(logLevel)) {
    console.error(chalk.red(`❌ Invalid log level: ${logLevel}`));
    console.error(chalk.yellow(`   Valid options: ${validLogLevels.join(', ')}`));
    process.exit(1);
  }

  return {
    transport,
    port: transport === 'http' ? port : undefined,
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
    const runtimeOptions = parseCliArguments();
    
    // If subcommand was handled, exit early
    if (!runtimeOptions) {
      return;
    }

    // Update logger configuration
    logger.updateConfig({
      level: (runtimeOptions.logLevel || (runtimeOptions.debug ? 'debug' : 'info')) as LevelWithSilent,
    });

    const mainLogger = createLogger({ module: 'main' });

    // Discover MCP configuration
    const configResult = await discoverMcpConfig(
      runtimeOptions.configPath,
      true // Update preference when CLI path is provided
    );

    // Handle configuration discovery results
    if (!configResult.configPath) {
      console.error(chalk.red("❌ No MCP configuration found"));
      console.error("");
      console.error(chalk.yellow(configResult.errorMessage || "Unknown configuration error"));
      console.error("");
      console.error(chalk.cyan("💡 Use --mcp-config <path> to specify a configuration file"));
      process.exit(1);
    }

    // Display config source info in debug mode
    if (runtimeOptions.debug) {
      const sourceText = {
        cli: "command line argument",
        preference: "user preference",
        discovered: "automatic discovery",
        none: "unknown source"
      }[configResult.source];
    }

    // Create transport config from runtime options
    const transportConfig: TransportConfig = {
      type: runtimeOptions.transport,
      ...(runtimeOptions.transport === 'http' && {
        port: runtimeOptions.port || 3000,
        host: "localhost"
      }),
    };

    // Create server instance
    const server = MetaMCPServerFactory.createDefaultServer(transportConfig);

    // Setup graceful shutdown
    const shutdown = async () => {
      if (runtimeOptions.debug) {
        console.log(chalk.yellow(`🛑 Shutting down ${APP_NAME} server...`));
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
      runtimeOptions.transport === 'http' ? 'localhost' : undefined
    );

    // Start server
    const initOptions = MetaMCPServerFactory.createInitOptions({
      transport: transportConfig,
      debug: runtimeOptions.debug,
      configPath: configResult.configPath,
    });

    await server.start(initOptions, runtimeOptions);

    if (runtimeOptions.insecure) {
      logger.warn(chalk.red("⚠️  INSECURE MODE: Tools with changed reference hashes are allowed"));
    }

    output.displaySeparator();

    // Keep process alive for stdio transport
    if (runtimeOptions.transport === "stdio") {
      process.stdin.resume();
    }
  } catch (error) {
    console.error(chalk.red(`❌ Failed to start ${APP_NAME} server:`), error);
    process.exit(1);
  }
}

// Run if this file is executed directly
import { fileURLToPath } from 'url';
import { dirname } from 'path';

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
