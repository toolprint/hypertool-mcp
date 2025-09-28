import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const serverName = process.env.STUB_SERVER_NAME || "stub";

const server = new McpServer(
  {
    name: serverName,
    version: "0.0.1",
    description: "Stub MCP server for integration tests",
  },
  {
    capabilities: {
      tools: { listChanged: true },
    },
  }
);

const textResult = (text) => ({
  content: [
    {
      type: "text",
      text,
    },
  ],
});

switch (serverName) {
  case "sequential-thinking": {
    server.registerTool(
      "sequentialthinking",
      {
        description: "Stub sequential thinking tool",
        inputSchema: {
          prompt: z.string().optional().describe("Prompt to analyze"),
        },
      },
      async ({ prompt } = {}) =>
        textResult(
          prompt
            ? `Stub sequentialthinking result for: ${prompt}`
            : "Stub sequentialthinking result"
        )
    );
    break;
  }
  case "everything": {
    server.registerTool(
      "echo",
      {
        description: "Echo back provided text",
        inputSchema: {
          text: z.string().describe("Text to echo"),
        },
      },
      async ({ text }) => textResult(text)
    );
    server.registerTool(
      "add",
      {
        description: "Add two numbers",
        inputSchema: {
          a: z.number().describe("First addend"),
          b: z.number().describe("Second addend"),
        },
      },
      async ({ a, b }) => textResult(`${a + b}`)
    );
    break;
  }
  case "filesystem": {
    server.registerTool(
      "read_file",
      {
        description: "Return placeholder file contents",
        inputSchema: {
          path: z.string().describe("File path to read"),
        },
      },
      async ({ path }) => textResult(`Contents of ${path}`)
    );
    server.registerTool(
      "write_file",
      {
        description: "Stub write file",
        inputSchema: {
          path: z.string().describe("File path to write"),
          content: z.string().describe("Content to write"),
        },
      },
      async ({ path }) => textResult(`Wrote file ${path}`)
    );
    server.registerTool(
      "list_directory",
      {
        description: "List directory contents",
        inputSchema: {
          path: z.string().optional().describe("Directory to list"),
        },
      },
      async ({ path }) =>
        textResult(`Directory listing for ${path || "."}: stub-file.txt`)
    );
    server.registerTool(
      "create_directory",
      {
        description: "Stub create directory",
        inputSchema: {
          path: z.string().describe("Directory to create"),
        },
      },
      async ({ path }) => textResult(`Created directory ${path}`)
    );
    server.registerTool(
      "move_file",
      {
        description: "Stub move file",
        inputSchema: {
          source: z.string().describe("Source path"),
          destination: z.string().describe("Destination path"),
        },
      },
      async ({ source, destination }) =>
        textResult(`Moved ${source} to ${destination}`)
    );
    server.registerTool(
      "search_files",
      {
        description: "Stub search files",
        inputSchema: {
          path: z.string().optional().describe("Search root"),
          pattern: z.string().optional().describe("Pattern"),
        },
      },
      async ({ path, pattern }) =>
        textResult(
          `Search results for ${pattern || "*"} under ${path || "."}`
        )
    );
    break;
  }
  case "mcping": {
    server.registerTool(
      "send-notification",
      {
        description: "Stub notification sender",
        inputSchema: {
          message: z.string().optional().describe("Message to send"),
        },
      },
      async ({ message } = {}) =>
        textResult(
          message
            ? `Notification sent: ${message}`
            : "Notification sent"
        )
    );
    break;
  }
  case "context7": {
    server.registerTool(
      "resolve-library-id",
      {
        description: "Stub resolve library id",
        inputSchema: {
          slug: z.string().describe("Library slug"),
        },
      },
      async ({ slug }) => textResult(`Resolved library for ${slug}`)
    );
    server.registerTool(
      "get-library-docs",
      {
        description: "Stub get library docs",
        inputSchema: {
          libraryId: z.string().describe("Library identifier"),
          query: z.string().optional().describe("Search query"),
        },
      },
      async ({ libraryId, query }) =>
        textResult(
          `Docs for ${libraryId}${query ? ` with query ${query}` : ""}`
        )
    );
    break;
  }
  default: {
    console.error(`Unknown STUB_SERVER_NAME: ${serverName}`);
    process.exit(1);
  }
}

const transport = new StdioServerTransport();

server
  .connect(transport)
  .catch((error) => {
    console.error("Failed to start stub MCP server:", error);
    process.exit(1);
  });

process.on("SIGINT", async () => {
  await server.close();
  process.exit(0);
});
