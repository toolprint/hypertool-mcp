/**
 * Meta-MCP server main entry point
 */

import { MetaMCPServerFactory } from "./server";
import { TransportConfig } from "./server/types";

/**
 * Main entry point for Meta-MCP server
 */
async function main(): Promise<void> {
  try {
    // Parse command line arguments for transport type
    const args = process.argv.slice(2);
    const transportType = args.includes("--http") ? "http" : "stdio";
    const port = args.includes("--port")
      ? parseInt(args[args.indexOf("--port") + 1])
      : 3000;
    const debug = args.includes("--debug");
    const enableCallTool = args.includes("--enable-call-tool");

    const transportConfig: TransportConfig = {
      type: transportType,
      ...(transportType === "http" && { port, host: "localhost" }),
    };

    // Create server instance
    const server = MetaMCPServerFactory.createDefaultServer(transportConfig);

    // Setup graceful shutdown
    const shutdown = async () => {
      console.log("Shutting down Meta-MCP server...");
      await server.stop();
      process.exit(0);
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);

    // Start server
    const initOptions = MetaMCPServerFactory.createInitOptions({
      transport: transportConfig,
      debug,
      enableCallTool,
    });

    await server.start(initOptions);

    if (debug) {
      console.log(`Meta-MCP server running on ${transportType} transport`);
      if (transportType === "http") {
        console.log(`HTTP server listening on http://localhost:${port}`);
      }
    }

    // Keep process alive for stdio transport
    if (transportType === "stdio") {
      process.stdin.resume();
    }
  } catch (error) {
    console.error("Failed to start Meta-MCP server:", error);
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
export * from "./router";
