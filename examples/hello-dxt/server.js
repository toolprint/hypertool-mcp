#!/usr/bin/env node

/**
 * Simple MCP server for DXT testing
 * Provides a hello tool
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

const server = new Server(
  {
    name: "hello-dxt-server",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// List tools handler
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "hello",
        description: "Returns a friendly greeting",
        inputSchema: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description: "Name to greet",
              default: "World"
            }
          }
        }
      }
    ]
  };
});

// Call tool handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name: toolName, arguments: args } = request.params;

  if (toolName === "hello") {
    const name = args?.name || "World";
    return {
      content: [
        {
          type: "text",
          text: `Hello, ${name}! This greeting comes from a DXT package.`
        }
      ]
    };
  }

  throw new Error(`Unknown tool: ${toolName}`);
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Hello DXT server running on stdio");
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
