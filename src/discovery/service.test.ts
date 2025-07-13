/**
 * Unit tests for tool discovery service
 */

import { EventEmitter } from "events";
import { ToolDiscoveryEngine } from "./service";
import { MCPToolDefinition, DiscoveryConfig } from "./types";
import {
  IConnectionManager,
  Connection,
  ConnectionStatus,
  ConnectionState,
} from "../connection/types";
import { MCPMessage } from "../connection/clients/types";

// Mock connection manager
class MockConnectionManager extends EventEmitter implements IConnectionManager {
  private connections = new Map<string, MockConnection>();
  private serverConfigs = new Map<string, any>();

  get pool() {
    return null as any;
  }
  get status(): Record<string, ConnectionStatus> {
    const result: Record<string, ConnectionStatus> = {};
    for (const [name, conn] of this.connections) {
      result[name] = conn.status;
    }
    return result;
  }

  async initialize() {}
  async connect(serverName: string) {
    const conn = this.connections.get(serverName);
    if (conn) {
      conn.mockConnect();
    }
  }
  async disconnect(serverName: string) {
    const conn = this.connections.get(serverName);
    if (conn) {
      conn.mockDisconnect();
    }
  }
  async reconnect(_serverName: string) {}
  async start() {}
  async stop() {}

  getConnection(serverName: string): Connection | undefined {
    return this.connections.get(serverName);
  }

  getConnectedServers(): string[] {
    return Array.from(this.connections.entries())
      .filter(([_, conn]) => conn.isConnected())
      .map(([name, _]) => name);
  }

  isServerConnected(serverName: string): boolean {
    const conn = this.connections.get(serverName);
    return conn?.isConnected() ?? false;
  }

  getServerNames(): string[] {
    return Array.from(this.connections.keys());
  }

  // Helper methods for testing
  addMockServer(serverName: string, tools: MCPToolDefinition[] = []) {
    const connection = new MockConnection(serverName, tools);
    this.connections.set(serverName, connection);
    this.serverConfigs.set(serverName, { type: "stdio" });
    
    // Set up event forwarding from connection to manager
    connection.on("connected", () => {
      this.emit("connected", {
        type: "connected" as const,
        serverId: connection.id,
        serverName: serverName,
        timestamp: new Date(),
      });
    });
    
    connection.on("disconnected", () => {
      this.emit("disconnected", {
        type: "disconnected" as const,
        serverId: connection.id,
        serverName: serverName,
        timestamp: new Date(),
      });
    });
  }

  removeMockServer(serverName: string) {
    this.connections.delete(serverName);
    this.serverConfigs.delete(serverName);
  }

  getMockConnection(serverName: string): MockConnection | undefined {
    return this.connections.get(serverName) as MockConnection;
  }
}

// Mock connection
class MockConnection extends EventEmitter implements Connection {
  public readonly id: string;
  public readonly config = { 
    type: "stdio" as const,
    command: "mock-command",
    args: []
  };
  private _isConnected = false;
  private _client: MockClient;

  constructor(
    public readonly serverName: string,
    private _tools: MCPToolDefinition[] = []
  ) {
    super();
    this.id = `mock-${this.serverName}`;
    this._client = new MockClient(this._tools);
  }

  get status(): ConnectionStatus {
    return {
      state: this._isConnected
        ? ConnectionState.CONNECTED
        : ConnectionState.DISCONNECTED,
      serverId: this.id,
      serverName: this.serverName,
      retryCount: 0,
      transport: "stdio",
    };
  }

  get client() {
    return this._client;
  }

  async connect() {
    this.mockConnect();
  }

  async disconnect() {
    this.mockDisconnect();
  }

  async ping() {
    return this._isConnected;
  }

  isConnected() {
    return this._isConnected;
  }

  mockConnect() {
    this._isConnected = true;
    this.emit("connected");
  }

  mockDisconnect() {
    this._isConnected = false;
    this.emit("disconnected");
  }

  updateTools(tools: MCPToolDefinition[]) {
    this._tools = tools;
    this._client.updateTools(tools);
  }

  triggerToolsChanged() {
    this._client.triggerToolsChanged();
  }
}

// Mock client
class MockClient extends EventEmitter {
  private tools: MCPToolDefinition[] = [];
  
  constructor(tools: MCPToolDefinition[] = []) {
    super();
    this.tools = tools;
  }

  async send(message: MCPMessage): Promise<void> {
    // Simulate async response
    setTimeout(() => {
      if (message.method === "tools/list") {
        const response: MCPMessage = {
          jsonrpc: "2.0",
          id: message.id,
          result: {
            tools: this.tools,
          },
        };
        this.emit("message", response);
      }
    }, 10);
  }

  updateTools(tools: MCPToolDefinition[]) {
    this.tools = tools;
  }

  triggerToolsChanged() {
    const notification: MCPMessage = {
      jsonrpc: "2.0",
      method: "notifications/tools/list_changed",
    };
    this.emit("message", notification);
  }
}

describe("ToolDiscoveryEngine", () => {
  let connectionManager: MockConnectionManager;
  let discoveryEngine: ToolDiscoveryEngine;

  const mockTool: MCPToolDefinition = {
    name: "test_tool",
    description: "A test tool",
    inputSchema: {
      type: "object",
      properties: {
        input: { type: "string" },
      },
      required: ["input"],
    },
  };

  beforeEach(() => {
    connectionManager = new MockConnectionManager();
    discoveryEngine = new ToolDiscoveryEngine(connectionManager);
  });

  afterEach(() => {
    discoveryEngine.removeAllListeners();
    connectionManager.removeAllListeners();
  });

  describe("initialization", () => {
    it("should initialize with default configuration", async () => {
      await discoveryEngine.initialize();
      expect(discoveryEngine.getStats().totalServers).toBe(0);
    });

    it("should initialize with custom configuration", async () => {
      const config: DiscoveryConfig = {
        cacheTtl: 10000,
        autoDiscovery: false,
      };

      await discoveryEngine.initialize(config);
      expect(discoveryEngine.getStats().totalServers).toBe(0);
    });

    it("should throw error if initialized twice", async () => {
      await discoveryEngine.initialize();
      await expect(discoveryEngine.initialize()).rejects.toThrow(
        "Tool discovery engine is already initialized"
      );
    });
  });

  describe("tool discovery", () => {
    beforeEach(async () => {
      await discoveryEngine.initialize();
    });

    it("should discover tools from a connected server", async () => {
      connectionManager.addMockServer("test-server", [mockTool]);
      const mockConn = connectionManager.getMockConnection("test-server")!;
      mockConn.mockConnect();

      const tools = await discoveryEngine.discoverTools("test-server");

      expect(tools).toHaveLength(1);
      expect(tools[0].name).toBe("test_tool");
      expect(tools[0].serverName).toBe("test-server");
      expect(tools[0].namespacedName).toBe("test-server.test_tool");
      expect(tools[0].structureHash).toBeDefined();
      expect(tools[0].fullHash).toBeDefined();
    });

    it("should discover tools from all connected servers", async () => {
      connectionManager.addMockServer("server1", [mockTool]);
      connectionManager.addMockServer("server2", [
        { ...mockTool, name: "tool2" },
      ]);

      connectionManager.getMockConnection("server1")!.mockConnect();
      connectionManager.getMockConnection("server2")!.mockConnect();

      const tools = await discoveryEngine.discoverTools();

      expect(tools).toHaveLength(2);
      expect(tools.map((t) => t.namespacedName)).toContain("server1.test_tool");
      expect(tools.map((t) => t.namespacedName)).toContain("server2.tool2");
    });

    it("should handle discovery errors gracefully", async () => {
      connectionManager.addMockServer("error-server", []);
      // Don't connect the server

      const tools = await discoveryEngine.discoverTools("error-server");
      expect(tools).toHaveLength(0);
    });
  });

  describe("tool lookup", () => {
    beforeEach(async () => {
      await discoveryEngine.initialize();
      connectionManager.addMockServer("test-server", [mockTool]);
      const mockConn = connectionManager.getMockConnection("test-server")!;
      mockConn.mockConnect();
      await discoveryEngine.discoverTools("test-server");
    });

    it("should find tool by exact name", async () => {
      const tool = await discoveryEngine.getToolByName("test_tool");
      expect(tool).toBeDefined();
      expect(tool!.name).toBe("test_tool");
    });

    it("should find tool by namespaced name", async () => {
      const tool = await discoveryEngine.getToolByName("test-server.test_tool");
      expect(tool).toBeDefined();
      expect(tool!.namespacedName).toBe("test-server.test_tool");
    });

    it("should return null for non-existent tool", async () => {
      const tool = await discoveryEngine.getToolByName("non_existent");
      expect(tool).toBeNull();
    });

    it("should search tools by pattern", async () => {
      const results = await discoveryEngine.searchTools({
        namePattern: "test",
        connectedOnly: true,
      });

      expect(results).toHaveLength(1);
      expect(results[0].name).toBe("test_tool");
    });

    it("should search tools by server", async () => {
      const results = await discoveryEngine.searchTools({
        serverName: "test-server",
      });

      expect(results).toHaveLength(1);
      expect(results[0].serverName).toBe("test-server");
    });
  });

  describe("tool change detection", () => {
    beforeEach(async () => {
      await discoveryEngine.initialize();
      connectionManager.addMockServer("test-server", [mockTool]);
      const mockConn = connectionManager.getMockConnection("test-server")!;
      mockConn.mockConnect();
      await discoveryEngine.discoverTools("test-server");
    });

    it("should detect when tools are added", async () => {
      const changePromise = new Promise((resolve) => {
        discoveryEngine.once("toolsChanged", resolve);
      });

      const newTool: MCPToolDefinition = {
        name: "new_tool",
        description: "A new tool",
        inputSchema: { type: "object" },
      };

      const mockConn = connectionManager.getMockConnection("test-server")!;
      mockConn.updateTools([mockTool, newTool]);
      mockConn.triggerToolsChanged();

      const changeEvent: any = await changePromise;
      expect(changeEvent.summary.added).toBe(1);
      expect(changeEvent.summary.unchanged).toBe(1);
    });

    it("should detect when tools are removed", async () => {
      const changePromise = new Promise((resolve) => {
        discoveryEngine.once("toolsChanged", resolve);
      });

      const mockConn = connectionManager.getMockConnection("test-server")!;
      mockConn.updateTools([]); // Remove all tools
      mockConn.triggerToolsChanged();

      const changeEvent: any = await changePromise;
      expect(changeEvent.summary.removed).toBe(1);
    });

    it("should detect when tools are modified", async () => {
      const changePromise = new Promise((resolve) => {
        discoveryEngine.once("toolsChanged", resolve);
      });

      const modifiedTool: MCPToolDefinition = {
        ...mockTool,
        description: "Modified description",
      };

      const mockConn = connectionManager.getMockConnection("test-server")!;
      mockConn.updateTools([modifiedTool]);
      mockConn.triggerToolsChanged();

      const changeEvent: any = await changePromise;
      expect(changeEvent.summary.updated).toBe(1);
    });
  });


  describe("caching", () => {
    beforeEach(async () => {
      await discoveryEngine.initialize();
      connectionManager.addMockServer("test-server", [mockTool]);
      const mockConn = connectionManager.getMockConnection("test-server")!;
      mockConn.mockConnect();
    });

    it("should cache discovered tools", async () => {
      await discoveryEngine.discoverTools("test-server");

      // Tool should be available immediately without rediscovery
      const tool = await discoveryEngine.getToolByName("test_tool");
      expect(tool).toBeDefined();
    });

    it("should refresh cache when requested", async () => {
      await discoveryEngine.discoverTools("test-server");

      // Update the mock server's tools
      const newTool: MCPToolDefinition = {
        name: "cached_tool",
        description: "A cached tool",
        inputSchema: { type: "object" },
      };

      const mockConn = connectionManager.getMockConnection("test-server")!;
      mockConn.updateTools([mockTool, newTool]);

      await discoveryEngine.refreshCache("test-server");

      const tools = discoveryEngine.getAvailableTools();
      expect(tools).toHaveLength(2);
    });

    it("should clear cache for specific server", async () => {
      await discoveryEngine.discoverTools("test-server");

      await discoveryEngine.clearCache("test-server");

      const tool = await discoveryEngine.getToolByName("test_tool");
      expect(tool).toBeNull();
    });
  });

  describe("statistics", () => {
    beforeEach(async () => {
      await discoveryEngine.initialize();
    });

    it("should provide discovery statistics", () => {
      const stats = discoveryEngine.getStats();

      expect(stats).toHaveProperty("totalServers");
      expect(stats).toHaveProperty("connectedServers");
      expect(stats).toHaveProperty("totalTools");
      expect(stats).toHaveProperty("cacheHitRate");
      expect(stats).toHaveProperty("toolsByServer");
    });

    it("should provide server states", async () => {
      connectionManager.addMockServer("test-server", [mockTool]);
      connectionManager.getMockConnection("test-server")!.mockConnect();

      await discoveryEngine.discoverTools("test-server");

      const states = discoveryEngine.getServerStates();
      expect(states).toHaveLength(1);
      expect(states[0].serverName).toBe("test-server");
      expect(states[0].isConnected).toBe(true);
      expect(states[0].toolCount).toBe(1);
    });

  });

  describe("lifecycle management", () => {
    beforeEach(async () => {
      await discoveryEngine.initialize();
    });

    it("should start and stop automatic discovery", async () => {
      await discoveryEngine.start();
      expect(discoveryEngine.getStats()).toBeDefined();

      await discoveryEngine.stop();
      expect(discoveryEngine.getStats()).toBeDefined();
    });

    it("should handle connection events", async () => {
      connectionManager.addMockServer("test-server", [mockTool]);

      const discoveryPromise = new Promise((resolve) => {
        discoveryEngine.once("toolsDiscovered", resolve);
      });

      const mockConn = connectionManager.getMockConnection("test-server")!;
      mockConn.mockConnect();
      // The connected event is now automatically emitted through event forwarding

      await discoveryPromise;

      const tools = discoveryEngine.getAvailableTools();
      expect(tools).toHaveLength(1);
    });
  });
});
