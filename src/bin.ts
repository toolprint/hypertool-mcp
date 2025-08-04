#!/usr/bin/env node

// Import and start the application
// Signal handling is done in index.ts to avoid duplicate listeners
import("./index.js").catch((error) => {
  // This error occurs before logger is initialized, so console.error is appropriate
  console.error("Failed to start HyperTool MCP server:", error);
  process.exit(1);
});
