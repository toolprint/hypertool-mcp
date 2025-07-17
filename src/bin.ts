#!/usr/bin/env node
/**
 * Binary entry point for HyperTool MCP server
 */

import { main } from './index.js';

main().catch((err: Error) => {
  console.error('Failed to start HyperTool MCP server:', err.message);
  process.exit(1);
});