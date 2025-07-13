/**
 * Runtime options for Meta-MCP server from CLI arguments
 */

import { ServerTransportType } from '../server/types';

/**
 * Runtime transport type options (matches server ServerTransportType)
 */
export type RuntimeTransportType = ServerTransportType;

/**
 * Runtime configuration options parsed from CLI arguments
 */
export interface RuntimeOptions {
  /** Transport protocol to use */
  transport: RuntimeTransportType;
  
  /** Port number for HTTP transport (only valid with transport=http) */
  port?: number;
  
  /** Enable debug mode with verbose logging */
  debug: boolean;
  
  /** Enable tool calling capabilities */
  enableCallTool: boolean;
  
  /** Allow tools with changed reference hashes (insecure mode) */
  insecure: boolean;
  
  /** Toolset name to load on startup */
  useToolset?: string;
}

/**
 * Default runtime options
 */
export const DEFAULT_RUNTIME_OPTIONS: RuntimeOptions = {
  transport: 'stdio',
  debug: false,
  enableCallTool: false,
  insecure: false,
};