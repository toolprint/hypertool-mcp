/**
 * Request router tests
 */

import { RequestRouter } from "./router";
import { ToolCallRequest, ROUTER_ERROR_CODES } from "./types";
import { IToolDiscoveryEngine, DiscoveredTool } from "../discovery/types";
import { IConnectionManager, Connection } from "../connection/types";

// Mock implementations
class MockDiscoveryEngine implements IToolDiscoveryEngine {
  private tools: DiscoveredTool[] = [];

  setMockTools(tools: DiscoveredTool[]) {
    this.tools = tools;
  }

  async initialize() {}
  async start() {}
  async stop() {}

  async discoverTools(): Promise<DiscoveredTool[]> {
    return this.tools;
  }

  async getToolByName(name: string): Promise<DiscoveredTool | null> {
    return (
      this.tools.find(
        (tool) => tool.name === name || tool.namespacedName === name
      ) || null
    );
  }

  async searchTools(): Promise<DiscoveredTool[]> {
    return this.tools;
  }

  getAvailableTools(): DiscoveredTool[] {
    return this.tools;
  }

  resolveToolReference(ref: { namespacedName?: string; refId?: string }, _options?: { allowStaleRefs?: boolean }) {
    const tool = this.tools.find(t => 
      t.namespacedName === ref.namespacedName || t.toolHash === ref.refId
    );
    
    return {
      exists: !!tool,
      tool,
      serverName: tool?.serverName,
      serverStatus: undefined,
      namespacedNameMatch: !!tool && tool.namespacedName === ref.namespacedName,
      refIdMatch: !!tool && tool.toolHash === ref.refId,
      warnings: [],
      errors: []
    };
  }

  async refreshCache() {}
  async clearCache() {}

  getStats() {
    return {
      totalServers: 1,
      connectedServers: 1,
      totalTools: this.tools.length,
      cacheHitRate: 0.8,
      averageDiscoveryTime: 100,
      toolsByServer: {},
    };
  }

  getServerStates() {
    return [];
  }
}

class MockConnection implements Connection {
  readonly id = "test-connection";
  readonly serverName: string;
  readonly config: any;
  readonly status: any;
  readonly client: any;
  private connected = true;

  constructor(serverName: string, mockResponse?: any) {
    this.serverName = serverName;
    this.config = {};
    this.status = {};
    this.client = {
      callTool: jest.fn().mockResolvedValue(
        mockResponse || {
          content: [{ type: "text", text: "Mock response" }],
        }
      ),
    };
  }

  async connect() {}
  async disconnect() {
    this.connected = false;
  }
  async ping() {
    return this.connected;
  }
  isConnected() {
    return this.connected;
  }
  on() {}
  off() {}
  emit() {}

  setConnected(connected: boolean) {
    this.connected = connected;
  }
}

class MockConnectionManager implements IConnectionManager {
  private connections: Map<string, Connection> = new Map();
  pool: any;
  status: any = {};

  addMockConnection(serverName: string, connection: Connection) {
    this.connections.set(serverName, connection);
  }

  async initialize() {}
  async start() {}
  async stop() {}

  async connect() {}
  async disconnect() {}
  async reconnect() {}

  getConnection(serverName: string): Connection | undefined {
    return this.connections.get(serverName);
  }

  getConnectedServers(): string[] {
    return Array.from(this.connections.keys()).filter((serverName) => {
      const conn = this.connections.get(serverName);
      return conn?.isConnected();
    });
  }

  isServerConnected(serverName: string): boolean {
    const conn = this.connections.get(serverName);
    return conn?.isConnected() || false;
  }

  on() {}
  off() {}
}

describe("RequestRouter", () => {
  let router: RequestRouter;
  let mockDiscovery: MockDiscoveryEngine;
  let mockConnectionManager: MockConnectionManager;

  beforeEach(() => {
    mockDiscovery = new MockDiscoveryEngine();
    mockConnectionManager = new MockConnectionManager();
    router = new RequestRouter(mockDiscovery, mockConnectionManager);
  });

  describe("initialization", () => {
    it("should initialize with default config", async () => {
      await router.initialize();
      expect(router.getStats().totalRequests).toBe(0);
    });

    it("should initialize with custom config", async () => {
      const customConfig = {
        enableLogging: false,
        requestTimeout: 5000,
      };

      await router.initialize(customConfig);
      // No error should be thrown
    });
  });

  describe("tool route resolution", () => {
    const mockTool: DiscoveredTool = {
      name: "status",
      serverName: "git",
      namespacedName: "git.status",
      tool: {
        name: "status",
        description: "Git status tool",
        inputSchema: { type: "object", properties: {} },
      },
      discoveredAt: new Date(),
      lastUpdated: new Date(),
      serverStatus: "connected",
      toolHash: "hash1",
    };

    beforeEach(() => {
      mockDiscovery.setMockTools([mockTool]);
      const mockConnection = new MockConnection("git");
      mockConnectionManager.addMockConnection("git", mockConnection);
    });

    it("should resolve namespaced tool names", async () => {
      const result = await router.resolveToolRoute("git.status");

      expect(result.success).toBe(true);
      expect(result.route?.originalName).toBe("git.status");
      expect(result.route?.resolvedName).toBe("status");
      expect(result.route?.serverName).toBe("git");
      expect(result.route?.isNamespaced).toBe(true);
    });

    it("should resolve non-namespaced tool names", async () => {
      mockDiscovery.setMockTools([
        {
          ...mockTool,
          namespacedName: "status", // Non-namespaced
        },
      ]);

      const result = await router.resolveToolRoute("status");

      expect(result.success).toBe(true);
      expect(result.route?.originalName).toBe("status");
      expect(result.route?.serverName).toBe("git");
    });

    it("should return error for unknown tools", async () => {
      const result = await router.resolveToolRoute("unknown.tool");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ROUTER_ERROR_CODES.TOOL_NOT_FOUND);
    });

    it("should return error for disconnected servers", async () => {
      const connection = mockConnectionManager.getConnection(
        "git"
      ) as MockConnection;
      connection.setConnected(false);

      const result = await router.resolveToolRoute("git.status");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ROUTER_ERROR_CODES.SERVER_NOT_CONNECTED);
    });
  });

  describe("tool call routing", () => {
    const mockTool: DiscoveredTool = {
      name: "status",
      serverName: "git",
      namespacedName: "git.status",
      tool: {
        name: "status",
        description: "Git status tool",
        inputSchema: {
          type: "object",
          properties: { path: { type: "string" } },
          required: ["path"],
        },
      },
      discoveredAt: new Date(),
      lastUpdated: new Date(),
      serverStatus: "connected",
      toolHash: "hash1",
    };

    beforeEach(async () => {
      mockDiscovery.setMockTools([mockTool]);
      const mockConnection = new MockConnection("git", {
        content: [{ type: "text", text: "Clean working directory" }],
      });
      mockConnectionManager.addMockConnection("git", mockConnection);
      await router.initialize();
    });

    it("should route tool calls successfully", async () => {
      const request: ToolCallRequest = {
        name: "git.status",
        arguments: { path: "/repo" },
      };

      const response = await router.routeToolCall(request);

      expect(response.content).toEqual([
        { type: "text", text: "Clean working directory" },
      ]);
      expect(response.isError).toBe(false);
    });

    it("should validate required parameters", async () => {
      await router.initialize({ validateParameters: true });

      const request: ToolCallRequest = {
        name: "git.status",
        arguments: {}, // Missing required 'path' parameter
      };

      const response = await router.routeToolCall(request);

      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain("Error:");
    });

    it("should handle tool call errors", async () => {
      const errorConnection = new MockConnection("git");
      errorConnection.client.callTool.mockRejectedValue(new Error("Git error"));
      mockConnectionManager.addMockConnection("git", errorConnection);

      const request: ToolCallRequest = {
        name: "git.status",
        arguments: { path: "/repo" },
      };

      const response = await router.routeToolCall(request);

      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain("Tool call failed");
    });

    it("should handle unknown tools", async () => {
      const request: ToolCallRequest = {
        name: "unknown.tool",
        arguments: {},
      };

      const response = await router.routeToolCall(request);

      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain(
        "Failed to resolve tool route"
      );
    });
  });

  describe("parameter validation", () => {
    const mockTool: DiscoveredTool = {
      name: "commit",
      serverName: "git",
      namespacedName: "git.commit",
      tool: {
        name: "commit",
        description: "Git commit tool",
        inputSchema: {
          type: "object",
          properties: {
            message: { type: "string" },
            files: { type: "array" },
          },
          required: ["message"],
        },
      },
      discoveredAt: new Date(),
      lastUpdated: new Date(),
      serverStatus: "connected",
      toolHash: "hash1",
    };

    it("should validate required parameters", async () => {
      const validRequest: ToolCallRequest = {
        name: "git.commit",
        arguments: { message: "Test commit" },
      };

      const isValid = await router.validateRequest(validRequest, mockTool);
      expect(isValid).toBe(true);
    });

    it("should reject missing required parameters", async () => {
      const invalidRequest: ToolCallRequest = {
        name: "git.commit",
        arguments: { files: ["file1.txt"] }, // Missing required 'message'
      };

      const isValid = await router.validateRequest(invalidRequest, mockTool);
      expect(isValid).toBe(false);
    });

    it("should handle empty arguments", async () => {
      const toolWithoutRequired: DiscoveredTool = {
        ...mockTool,
        tool: {
          ...mockTool.tool,
          inputSchema: { type: "object", properties: {} }, // No required fields
        },
      };

      const request: ToolCallRequest = {
        name: "git.commit",
        arguments: {},
      };

      const isValid = await router.validateRequest(
        request,
        toolWithoutRequired
      );
      expect(isValid).toBe(true);
    });
  });

  describe("statistics", () => {
    beforeEach(async () => {
      await router.initialize({ enableMetrics: true });
    });

    it("should track successful requests", async () => {
      const mockTool: DiscoveredTool = {
        name: "status",
        serverName: "git",
        namespacedName: "git.status",
        tool: {
          name: "status",
          description: "Git status tool",
          inputSchema: { type: "object", properties: {} },
        },
        discoveredAt: new Date(),
        lastUpdated: new Date(),
        serverStatus: "connected",
        toolHash: "hash1",
      };

      mockDiscovery.setMockTools([mockTool]);
      const mockConnection = new MockConnection("git");
      mockConnectionManager.addMockConnection("git", mockConnection);

      const request: ToolCallRequest = {
        name: "git.status",
        arguments: {},
      };

      await router.routeToolCall(request);

      const stats = router.getStats();
      expect(stats.totalRequests).toBe(1);
      expect(stats.successfulRequests).toBe(1);
      expect(stats.failedRequests).toBe(0);
      expect(stats.requestsByServer["git"]).toBe(1);
    });

    it("should track failed requests", async () => {
      const request: ToolCallRequest = {
        name: "unknown.tool",
        arguments: {},
      };

      await router.routeToolCall(request);

      const stats = router.getStats();
      expect(stats.totalRequests).toBe(1);
      expect(stats.successfulRequests).toBe(0);
      expect(stats.failedRequests).toBe(1);
    });

    it("should clear statistics", () => {
      const request: ToolCallRequest = {
        name: "unknown.tool",
        arguments: {},
      };

      router.routeToolCall(request);
      router.clearStats();

      const stats = router.getStats();
      expect(stats.totalRequests).toBe(0);
      expect(stats.successfulRequests).toBe(0);
      expect(stats.failedRequests).toBe(0);
    });
  });

  describe("logging", () => {
    it("should enable/disable logging", async () => {
      await router.initialize({ enableLogging: true });

      // Create a spy on console.log to check if logging occurs
      const consoleSpy = jest.spyOn(console, "log").mockImplementation();

      const request: ToolCallRequest = {
        name: "unknown.tool",
        arguments: {},
      };

      await router.routeToolCall(request);
      expect(consoleSpy).toHaveBeenCalled();

      // Disable logging
      router.setLogging(false);
      consoleSpy.mockClear();

      await router.routeToolCall(request);
      // Should be called less frequently or not at all for request logs

      consoleSpy.mockRestore();
    });
  });
});
