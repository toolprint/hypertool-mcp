#!/usr/bin/env node

import('./index.js').catch((error) => {
  console.error('Failed to start HyperTool MCP server:', error);
  process.exit(1);
});
