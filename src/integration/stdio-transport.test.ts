import { describe, it, expect, afterEach, beforeAll } from "vitest";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { join } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { existsSync } from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe("MCP Server stdio transport", () => {
  const serverPath = join(__dirname, "../../dist/bin.js");
  const configPath = join(__dirname, "../../mcp.test.json");
  let client: Client | null = null;
  let transport: StdioClientTransport | null = null;

  beforeAll(() => {
    // Ensure the server is built
    if (!existsSync(serverPath)) {
      throw new Error(
        `Server not built. Run 'npm run build' first. Expected at: ${serverPath}`
      );
    }
    if (!existsSync(configPath)) {
      throw new Error(`Test config not found at: ${configPath}`);
    }
  });

  afterEach(async () => {
    // Clean up client and transport
    if (client) {
      await client.close();
      client = null;
    }
    if (transport) {
      await transport.close();
      transport = null;
    }
  });

  // Reduced timeout with minimal memory server configuration in mcp.test.json
  it(
    "should connect via stdio and call tools successfully",
    { timeout: 5000 },
    async () => {
      // Create stdio transport using environment variable override (CLI parsing issue workaround)
      transport = new StdioClientTransport({
        command: "node",
        args: [serverPath, "--transport", "stdio"],
        env: {
          ...process.env,
          NODE_ENV: "test",
          HYPERTOOL_TEST_CONFIG: configPath,
        },
      });

      // Create MCP client
      client = new Client(
        {
          name: "test-client",
          version: "1.0.0",
        },
        {
          capabilities: {},
        }
      );

      // Connect to server - this proves stdio transport is working
      await expect(client.connect(transport)).resolves.not.toThrow();

      // List tools to verify protocol is working
      const toolsResponse = await client.listTools();
      expect(toolsResponse.tools).toBeDefined();
      expect(Array.isArray(toolsResponse.tools)).toBe(true);
      expect(toolsResponse.tools.length).toBeGreaterThan(0);

      // Call list-available-tools - should work reliably
      const toolResult = await client.callTool({
        name: "list-available-tools",
        arguments: {},
      });

      expect(toolResult).toBeDefined();
      expect(toolResult.content).toBeDefined();
    }
  );

  // Reduced timeout with minimal memory server configuration in mcp.test.json
  it("should handle concurrent operations", { timeout: 5000 }, async () => {
    transport = new StdioClientTransport({
      command: "node",
      args: [serverPath, "--transport", "stdio"],
      env: {
        ...process.env,
        NODE_ENV: "test",
        HYPERTOOL_TEST_CONFIG: configPath,
      },
    });

    client = new Client(
      {
        name: "test-client",
        version: "1.0.0",
      },
      {
        capabilities: {},
      }
    );

    await client.connect(transport);

    // Multiple concurrent tool calls
    const [result1, result2, result3] = await Promise.all([
      client.listTools(),
      client.callTool({ name: "list-available-tools", arguments: {} }),
      client.callTool({ name: "list-saved-toolsets", arguments: {} }),
    ]);

    // All should succeed
    expect(result1.tools).toBeDefined();
    expect(result2.content).toBeDefined();
    expect(result3.content).toBeDefined();
  });

  // Reduced timeout with minimal memory server configuration in mcp.test.json
  it(
    "should properly handle errors without breaking stdio protocol",
    { timeout: 5000 },
    async () => {
      transport = new StdioClientTransport({
        command: "node",
        args: [serverPath, "--transport", "stdio"],
        env: {
          ...process.env,
          NODE_ENV: "test",
          HYPERTOOL_TEST_CONFIG: configPath,
        },
      });

      client = new Client(
        {
          name: "test-client",
          version: "1.0.0",
        },
        {
          capabilities: {},
        }
      );

      await client.connect(transport);

      // Try to call a non-existent tool
      await expect(
        client.callTool({
          name: "non-existent-tool",
          arguments: {},
        })
      ).rejects.toThrow();

      // The client should still work after an error
      const tools = await client.listTools();
      expect(tools.tools).toBeDefined();
    }
  );
});
