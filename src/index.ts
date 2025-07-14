#!/usr/bin/env node
/**
 * HyperTool MCP server main entry point
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { MetaMCPServerFactory } from "./server";
import { TransportConfig } from "./server/types";
import { RuntimeOptions, DEFAULT_RUNTIME_OPTIONS, RuntimeTransportType } from "./types/runtime";
import { discoverMcpConfig } from "./config/discovery";

/**
 * Parse CLI arguments and return runtime options
 */
function parseCliArguments(): RuntimeOptions {
  const program = new Command();
  
  program
    .name('hypertool-mcp')
    .description(chalk.blue('HyperTool MCP proxy server for routing requests between clients and multiple underlying MCP servers'))
    .version('1.0.0')
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
      '--use-toolset <name>', 
      chalk.cyan('Toolset name to load on startup')
    )
    .option(
      '--mcp-config <path>', 
      chalk.cyan('Path to MCP configuration file') + ' (.mcp.json)'
    );

  program.parse();
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

  return {
    transport,
    port: transport === 'http' ? port : undefined,
    debug: options.debug || false,
    insecure: options.insecure || false,
    useToolset: options.useToolset,
    configPath: options.mcpConfig,
  };
}

/**
 * Main entry point for HyperTool MCP server
 */
async function main(): Promise<void> {
  try {
    // Parse CLI arguments
    const runtimeOptions = parseCliArguments();

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
      
      console.log(chalk.green(`✅ Found MCP config via ${sourceText}: ${configResult.configPath}`));
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
        console.log(chalk.yellow("🛑 Shutting down HyperTool MCP server..."));
      }
      await server.stop();
      process.exit(0);
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);

    // Start server
    const initOptions = MetaMCPServerFactory.createInitOptions({
      transport: transportConfig,
      debug: runtimeOptions.debug,
      configPath: configResult.configPath,
    });

    await server.start(initOptions);

    // Display startup messages with colored output
    if (runtimeOptions.debug) {
      console.log(chalk.green(`✅ HyperTool MCP server running on ${runtimeOptions.transport} transport`));
      if (runtimeOptions.transport === "http") {
        console.log(chalk.blue(`🌐 HTTP server listening on http://localhost:${runtimeOptions.port || 3000}`));
      }
      if (runtimeOptions.insecure) {
        console.log(chalk.red("⚠️  INSECURE MODE: Tools with changed reference hashes are allowed"));
      }
      if (runtimeOptions.useToolset) {
        console.log(chalk.cyan(`🛠️  Using toolset: ${runtimeOptions.useToolset}`));
      }
    }

    // Keep process alive for stdio transport
    if (runtimeOptions.transport === "stdio") {
      process.stdin.resume();
    }
  } catch (error) {
    console.error(chalk.red("❌ Failed to start HyperTool MCP server:"), error);
    process.exit(1);
  }
}

// Run if this file is executed directly
if (require.main === module) {
  main().catch(console.error);
}

export { main };
export * from "./server";
export * from "./config";
export * from "./types/config";
export * from "./types/runtime";
export * from "./router";
