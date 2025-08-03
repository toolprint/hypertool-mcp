#!/usr/bin/env node

// Set up global signal handlers BEFORE any imports to prevent inquirer.js interference
const handleGlobalExit = (signal: string) => {
  console.log(`\n👋 Goodbye! (${signal})`);
  process.exit(0);
};

// Use setImmediate for immediate signal processing
process.on("SIGINT", () => {
  setImmediate(() => handleGlobalExit("SIGINT"));
});

process.on("SIGTERM", () => {
  setImmediate(() => handleGlobalExit("SIGTERM"));
});

// For additional robustness, handle SIGHUP as well
process.on("SIGHUP", () => {
  setImmediate(() => handleGlobalExit("SIGHUP"));
});

import("./index.js").catch((error) => {
  console.error("Failed to start HyperTool MCP server:", error);
  process.exit(1);
});
