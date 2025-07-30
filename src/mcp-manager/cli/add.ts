/**
 * CLI command for adding MCP servers
 */

import { Command } from 'commander';
import { MCPServerManager } from '../index.js';
import { MCPServerConfig } from '../types.js';
import { output } from '../../utils/output.js';
import { theme, semantic } from '../../utils/theme.js';

export function createAddCommand(): Command {
  const add = new Command('add');
  
  add
    .description('Add a new MCP server')
    .argument('<name>', 'Server name')
    .argument('[command]', 'Command to run (for stdio transport)')
    .argument('[args...]', 'Arguments for the command')
    .option('-t, --transport <type>', 'Transport type (stdio, http, sse)', 'stdio')
    .option('-e, --env <vars...>', 'Environment variables (KEY=value)')
    .option('--header <headers...>', 'Headers for HTTP/SSE (Header=value)')
    .action(async (name, command, args, options) => {
      try {
        const manager = new MCPServerManager();
        await manager.initialize();
        
        // Build server configuration based on transport type
        const serverConfig: MCPServerConfig = {
          type: options.transport
        };
        
        // Configure based on transport type
        if (options.transport === 'stdio') {
          // For stdio, command is required
          if (!command) {
            output.error('❌ Command is required for stdio transport');
            output.info('Usage: hypertool mcp add <name> <command> [args...]');
            process.exit(1);
          }
          
          serverConfig.command = command;
          if (args && args.length > 0) {
            serverConfig.args = args;
          }
        } else if (['http', 'sse', 'websocket'].includes(options.transport)) {
          // For HTTP/SSE/WebSocket, the 'command' argument is actually the URL
          if (!command) {
            output.error(`❌ URL is required for ${options.transport} transport`);
            output.info(`Usage: hypertool mcp add --transport ${options.transport} <name> <url>`);
            process.exit(1);
          }
          
          // Validate URL
          try {
            new URL(command);
          } catch {
            output.error(`❌ Invalid URL: ${command}`);
            process.exit(1);
          }
          
          serverConfig.url = command;
          
          // Add headers if provided
          if (options.header && options.header.length > 0) {
            serverConfig.headers = {};
            for (const headerStr of options.header) {
              try {
                const [key, value] = MCPServerManager.parseHeader(headerStr);
                serverConfig.headers[key] = value;
              } catch (error) {
                output.error(`❌ ${error}`);
                process.exit(1);
              }
            }
          }
        } else {
          output.error(`❌ Invalid transport type: ${options.transport}`);
          output.info('Valid types: stdio, http, sse, websocket');
          process.exit(1);
        }
        
        // Add environment variables if provided
        if (options.env && options.env.length > 0) {
          serverConfig.env = {};
          for (const envStr of options.env) {
            try {
              const [key, value] = MCPServerManager.parseEnvVar(envStr);
              serverConfig.env[key] = value;
            } catch (error) {
              output.error(`❌ ${error}`);
              process.exit(1);
            }
          }
        }
        
        // Add the server
        await manager.addServer(name, serverConfig);
        
        output.success(`✅ Added MCP server '${name}'`);
        
        // Show the configuration
        output.displaySpaceBuffer(1);
        output.info(theme.label('Configuration:'));
        output.info(`  ${theme.subtle('Type:')} ${theme.value(serverConfig.type)}`);
        
        if (serverConfig.type === 'stdio') {
          output.info(`  ${theme.subtle('Command:')} ${theme.value(serverConfig.command!)}`);
          if (serverConfig.args) {
            output.info(`  ${theme.subtle('Arguments:')} ${theme.value(serverConfig.args.join(' '))}`);
          }
        } else {
          output.info(`  ${theme.subtle('URL:')} ${theme.value(serverConfig.url!)}`);
        }
        
        if (serverConfig.env && Object.keys(serverConfig.env).length > 0) {
          output.info(`  ${theme.subtle('Environment:')} ${Object.keys(serverConfig.env).length} variable(s)`);
        }
        
        if (serverConfig.headers && Object.keys(serverConfig.headers).length > 0) {
          output.info(`  ${theme.subtle('Headers:')} ${Object.keys(serverConfig.headers).length} header(s)`);
        }
        
      } catch (error) {
        output.error('❌ Failed to add MCP server:');
        output.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });
  
  // Add examples to help text
  add.addHelpText('after', `
Examples:
  # Add a stdio server
  $ hypertool mcp add my-server /path/to/server arg1 arg2
  $ hypertool mcp add calculator npx -y @modelcontextprotocol/server-calculator
  
  # Add with environment variables
  $ hypertool mcp add my-api /usr/local/bin/api-server --env API_KEY=secret PORT=3000
  
  # Add an HTTP server
  $ hypertool mcp add --transport http api-server https://example.com/mcp
  
  # Add an SSE server with headers
  $ hypertool mcp add --transport sse stream-server https://example.com/sse --header Authorization="Bearer token"
`);
  
  return add;
}