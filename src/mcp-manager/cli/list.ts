/**
 * CLI command for listing MCP servers
 */

import { Command } from 'commander';
import { MCPServerManager } from '../index.js';
import { output } from '../../utils/output.js';
import { theme, semantic } from '../../utils/theme.js';

export function createListCommand(): Command {
  const list = new Command('list');
  
  list
    .description('List all configured MCP servers')
    .option('--json', 'Output in JSON format')
    .action(async (options) => {
      try {
        const manager = new MCPServerManager();
        await manager.initialize();
        
        const servers = await manager.listServers();
        
        if (options.json) {
          // JSON output
          output.log(JSON.stringify(servers, null, 2));
        } else {
          // Formatted output
          if (servers.length === 0) {
            output.warn('No MCP servers configured');
            output.info('Use "hypertool mcp add" to add a server');
            return;
          }
          
          output.displayHeader('MCP Servers');
          output.displaySpaceBuffer(1);
          
          // Create table header
          const nameWidth = 20;
          const typeWidth = 10;
          const transportWidth = 40;
          const sourceWidth = 15;
          const dateWidth = 15;
          
          // Header
          output.info(
            theme.label('NAME'.padEnd(nameWidth)) +
            theme.label('TYPE'.padEnd(typeWidth)) +
            theme.label('TRANSPORT'.padEnd(transportWidth)) +
            theme.label('SOURCE'.padEnd(sourceWidth)) +
            theme.label('IMPORTED')
          );
          
          output.displaySeparator(nameWidth + typeWidth + transportWidth + sourceWidth + dateWidth);
          
          // Rows
          for (const server of servers) {
            let transport = '';
            if (server.config.type === 'stdio') {
              transport = server.config.command || '';
              if (server.config.args && server.config.args.length > 0) {
                transport += ' ' + server.config.args.join(' ');
              }
            } else {
              transport = server.config.url || '';
            }
            
            // Truncate long transport strings
            if (transport.length > transportWidth - 2) {
              transport = transport.substring(0, transportWidth - 5) + '...';
            }
            
            const source = server.metadata?.app || 'unknown';
            const date = server.metadata?.importedAt 
              ? new Date(server.metadata.importedAt).toLocaleDateString()
              : 'unknown';
            
            output.log(
              theme.primary(server.name.padEnd(nameWidth)) +
              theme.info(server.config.type.padEnd(typeWidth)) +
              theme.muted(transport.padEnd(transportWidth)) +
              theme.subtle(source.padEnd(sourceWidth)) +
              theme.subtle(date)
            );
          }
          
          output.displaySpaceBuffer(1);
          output.info(`Total: ${servers.length} server(s)`);
        }
        
      } catch (error) {
        output.error('❌ Failed to list MCP servers:');
        output.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });
  
  return list;
}