import {
  describe,
  it,
  expect,
  afterEach,
  beforeAll,
  vi,
  beforeEach,
} from "vitest";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { join } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { existsSync, mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { promises as fs } from "fs";

// Mock environment to force test mode and prevent real home directory usage
vi.mock("../config/environment.js", async () => {
  const actual = await vi.importActual("../config/environment.js");
  return {
    ...actual,
    isTestMode: () => true,
    isNedbEnabled: () => false,
  };
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe("MCP Server stdio transport", () => {
  const serverPath = join(__dirname, "../../dist/bin.js");
  const configPath = join(__dirname, "../../mcp.test.json");
  let client: Client | null = null;
  let transport: StdioClientTransport | null = null;
  let testHome: string | null = null;

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

  beforeEach(async () => {
    // Create a temporary directory for test isolation
    testHome = mkdtempSync(join(tmpdir(), "hypertool-test-"));

    // Create the necessary directory structure
    const toolprintDir = join(testHome, ".toolprint", "hypertool-mcp");
    await fs.mkdir(toolprintDir, { recursive: true });

    // Create a minimal config.json to prevent user preference loading
    const configJson = join(toolprintDir, "config.json");
    await fs.writeFile(
      configJson,
      JSON.stringify(
        {
          toolsets: {},
          version: "1.0.0",
        },
        null,
        2
      )
    );
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

    // Clean up temp directory
    if (testHome) {
      try {
        rmSync(testHome, { recursive: true, force: true });
      } catch (error) {
        console.warn("Failed to clean up test directory:", error);
      }
      testHome = null;
    }
  });

  // Uses global testTimeout for stdio server startup and MCP protocol initialization
  it("should connect via stdio and call tools successfully", async () => {
    // Create stdio transport using environment variable override (CLI parsing issue workaround)
    transport = new StdioClientTransport({
      command: "node",
      args: [serverPath, "--transport", "stdio"],
      env: {
        ...process.env,
        NODE_ENV: "test",
        HYPERTOOL_TEST_CONFIG: configPath,
        HYPERTOOL_TEST_HOME: testHome,
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
  });

  // Uses global testTimeout for stdio server startup and concurrent operations
  it("should handle concurrent operations", async () => {
    transport = new StdioClientTransport({
      command: "node",
      args: [serverPath, "--transport", "stdio"],
      env: {
        ...process.env,
        NODE_ENV: "test",
        HYPERTOOL_TEST_CONFIG: configPath,
        HYPERTOOL_TEST_HOME: testHome,
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

  // Uses global testTimeout for stdio server startup and error handling
  it("should properly handle errors without breaking stdio protocol", async () => {
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
  });
});
