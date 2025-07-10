/**
 * Integration tests for Connection Manager
 */

import { ConnectionManager } from "./manager";
import { ConnectionFactory } from "./factory";
import { StdioServerConfig, SSEServerConfig } from "../types/config";
import {
  ConnectionState,
  ConnectionEventType,
  Connection,
  ConnectionEvent,
} from "./types";

// Mock connection for testing
class MockConnection implements Connection {
  public readonly id = "test-id";
  public readonly serverName: string;
  public readonly config: any;
  public isConnectedState = false;
  public connectPromise: Promise<void> = Promise.resolve();
  public disconnectPromise: Promise<void> = Promise.resolve();
  public pingResult = true;
  private eventListeners = new Map<string, Function[]>();

  constructor(serverName: string, config: any) {
    this.serverName = serverName;
    this.config = config;
  }

  get status() {
    return {
      state: this.isConnectedState ? ConnectionState.CONNECTED : ConnectionState.DISCONNECTED,
      serverId: this.id,
      serverName: this.serverName,
      retryCount: 0,
      transport: this.config.type,
    };
  }

  get client() {
    return {};
  }

  async connect(): Promise<void> {
    await this.connectPromise;
    this.isConnectedState = true;
    this.emit("connected", {
      type: "connected",
      serverId: this.id,
      serverName: this.serverName,
      timestamp: new Date(),
    });
  }

  async disconnect(): Promise<void> {
    await this.disconnectPromise;
    this.isConnectedState = false;
    this.emit("disconnected", {
      type: "disconnected",
      serverId: this.id,
      serverName: this.serverName,
      timestamp: new Date(),
    });
  }

  async ping(): Promise<boolean> {
    return this.pingResult;
  }

  isConnected(): boolean {
    return this.isConnectedState;
  }

  on(event: ConnectionEventType, callback: Function): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event)!.push(callback);
  }

  off(event: ConnectionEventType, callback: Function): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      const index = listeners.indexOf(callback);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    }
  }

  emit(event: ConnectionEventType, payload: Partial<ConnectionEvent>): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.forEach(listener => listener(payload));
    }
  }
}

// Mock connection factory
class MockConnectionFactory extends ConnectionFactory {
  private connections = new Map<string, MockConnection>();

  createConnection(serverName: string, config: any): Connection {
    const connection = new MockConnection(serverName, config);
    this.connections.set(serverName, connection);
    return connection;
  }

  getMockConnection(serverName: string): MockConnection | undefined {
    return this.connections.get(serverName);
  }
}

describe("ConnectionManager", () => {
  let manager: ConnectionManager;
  let mockFactory: MockConnectionFactory;

  const testServers = {
    "git-server": {
      type: "stdio" as const,
      command: "git-mcp-server",
      args: ["--stdio"],
    } as StdioServerConfig,
    "docker-server": {
      type: "sse" as const,
      url: "http://localhost:3001/sse",
    } as SSEServerConfig,
  };

  beforeEach(() => {
    mockFactory = new MockConnectionFactory();
    manager = new ConnectionManager({}, mockFactory);
  });

  afterEach(async () => {
    try {
      await manager.stop();
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("initialization", () => {
    it("should initialize with server configurations", async () => {
      await manager.initialize(testServers);
      
      expect(manager.getServerNames()).toEqual(["git-server", "docker-server"]);
      expect(manager.pool.size).toBe(2);
    });

    it("should reject double initialization", async () => {
      await manager.initialize(testServers);
      
      await expect(manager.initialize(testServers)).rejects.toThrow(
        "Connection manager is already initialized"
      );
    });

    it("should validate server configurations", async () => {
      const invalidServers = {
        "invalid-server": {
          type: "invalid",
        } as any,
      };

      await expect(manager.initialize(invalidServers)).rejects.toThrow();
    });
  });

  describe("connection management", () => {
    beforeEach(async () => {
      await manager.initialize(testServers);
    });

    it("should connect to a specific server", async () => {
      await manager.connect("git-server");
      
      expect(manager.isServerConnected("git-server")).toBe(true);
      expect(manager.getConnectedServers()).toContain("git-server");
    });

    it("should disconnect from a specific server", async () => {
      await manager.connect("git-server");
      await manager.disconnect("git-server");
      
      expect(manager.isServerConnected("git-server")).toBe(false);
    });

    it("should reconnect to a server", async () => {
      await manager.connect("git-server");
      
      const mockConnection = mockFactory.getMockConnection("git-server")!;
      const disconnectSpy = jest.spyOn(mockConnection, "disconnect");
      const connectSpy = jest.spyOn(mockConnection, "connect");
      
      await manager.reconnect("git-server");
      
      expect(disconnectSpy).toHaveBeenCalled();
      expect(connectSpy).toHaveBeenCalled();
    });

    it("should handle connection to non-existent server", async () => {
      await expect(manager.connect("non-existent")).rejects.toThrow(
        'Server "non-existent" not found in pool'
      );
    });
  });

  describe("lifecycle management", () => {
    beforeEach(async () => {
      await manager.initialize(testServers);
    });

    it("should start the connection manager", async () => {
      const startPromise = manager.start();
      
      await startPromise;
      
      expect(manager.getConnectedServers().length).toBe(2);
    });

    it("should stop the connection manager", async () => {
      await manager.start();
      await manager.stop();
      
      expect(manager.getConnectedServers().length).toBe(0);
    });

    it("should handle multiple start calls gracefully", async () => {
      await manager.start();
      await manager.start(); // Should not throw
      
      expect(manager.getConnectedServers().length).toBe(2);
    });
  });

  describe("server management", () => {
    beforeEach(async () => {
      await manager.initialize(testServers);
    });

    it("should add a new server", async () => {
      const newServer: StdioServerConfig = {
        type: "stdio",
        command: "new-server",
      };

      await manager.addServer("new-server", newServer);
      
      expect(manager.getServerNames()).toContain("new-server");
      expect(manager.getServerConfig("new-server")).toEqual(newServer);
    });

    it("should remove a server", async () => {
      await manager.removeServer("git-server");
      
      expect(manager.getServerNames()).not.toContain("git-server");
      expect(manager.pool.size).toBe(1);
    });

    it("should reject duplicate server names", async () => {
      const duplicateServer: StdioServerConfig = {
        type: "stdio",
        command: "duplicate",
      };

      await expect(manager.addServer("git-server", duplicateServer)).rejects.toThrow(
        'Server "git-server" already exists'
      );
    });
  });

  describe("event handling", () => {
    beforeEach(async () => {
      await manager.initialize(testServers);
    });

    it("should forward connection events", async () => {
      const events: ConnectionEvent[] = [];
      manager.on("connected", (event) => {
        events.push(event);
      });

      await manager.connect("git-server");
      
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe("connected");
      expect(events[0].serverName).toBe("git-server");
    });

    it("should emit manager-specific events", async () => {
      const events: any[] = [];
      manager.on("started", (event) => {
        events.push(event);
      });

      await manager.start();
      
      expect(events).toHaveLength(1);
      expect(events[0].serverCount).toBe(2);
    });
  });

  describe("statistics", () => {
    beforeEach(async () => {
      await manager.initialize(testServers);
    });

    it("should provide connection statistics", async () => {
      await manager.connect("git-server");
      
      const stats = manager.getStats();
      
      expect(stats.totalServers).toBe(2);
      expect(stats.connectedServers).toBe(1);
      expect(stats.disconnectedServers).toBe(1);
      expect(stats.connectionRate).toBe(0.5);
      expect(stats.activeConnections).toBe(1);
      expect(stats.poolSize).toBe(2);
    });

    it("should handle empty connection pool", () => {
      const emptyManager = new ConnectionManager();
      const stats = emptyManager.getStats();
      
      expect(stats.totalServers).toBe(0);
      expect(stats.connectionRate).toBe(0);
    });
  });

  describe("error handling", () => {
    beforeEach(async () => {
      await manager.initialize(testServers);
    });

    it("should handle connection failures gracefully", async () => {
      const mockConnection = mockFactory.getMockConnection("git-server")!;
      mockConnection.connectPromise = Promise.reject(new Error("Connection failed"));

      await expect(manager.connect("git-server")).rejects.toThrow("Connection failed");
      expect(manager.isServerConnected("git-server")).toBe(false);
    });

    it("should handle operations before initialization", async () => {
      const uninitializedManager = new ConnectionManager();
      
      await expect(uninitializedManager.connect("test")).rejects.toThrow(
        "Connection manager not initialized"
      );
    });
  });

  describe("configuration validation", () => {
    it("should validate stdio server configuration", async () => {
      const validStdioServer = {
        "valid-stdio": {
          type: "stdio" as const,
          command: "test-command",
          args: ["--test"],
          env: { TEST: "value" },
        },
      };

      await expect(manager.initialize(validStdioServer)).resolves.not.toThrow();
    });

    it("should validate SSE server configuration", async () => {
      const validSSEServer = {
        "valid-sse": {
          type: "sse" as const,
          url: "http://localhost:3000/sse",
          headers: { Authorization: "Bearer token" },
        },
      };

      await expect(manager.initialize(validSSEServer)).resolves.not.toThrow();
    });

    it("should reject invalid configuration", async () => {
      const invalidServer = {
        "invalid": null as any,
      };

      await expect(manager.initialize(invalidServer)).rejects.toThrow(
        'Invalid configuration for server "invalid"'
      );
    });
  });
});