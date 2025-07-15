/**
 * Unit tests for Hypertool MCP server base implementation
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MetaMCPServer } from "./base.js";
import { MetaMCPServerConfig, ServerState } from "./types.js";

describe("MetaMCPServer", () => {
  let server: MetaMCPServer;
  let config: MetaMCPServerConfig;

  beforeEach(() => {
    config = {
      name: "test-server",
      version: "1.0.0",
      description: "Test server",
      transport: {
        type: "stdio",
      },
    };
    server = new MetaMCPServer(config);
  });

  afterEach(async () => {
    if (server.getStatus().state === ServerState.RUNNING) {
      await server.stop();
    }
  });

  describe("Constructor", () => {
    it("should create server with correct config", () => {
      expect(server.getConfig()).toEqual(config);
    });

    it("should initialize with STOPPED state", () => {
      expect(server.getStatus().state).toBe(ServerState.STOPPED);
    });

    it("should initialize with 0 connected clients", () => {
      expect(server.getStatus().connectedClients).toBe(0);
    });
  });

  describe("Server State Management", () => {
    it("should emit stateChanged event when state changes", async () => {
      const stateChangePromise = new Promise<void>((resolve) => {
        server.on("stateChanged", (event) => {
          expect(event.from).toBe(ServerState.STOPPED);
          expect(event.to).toBe(ServerState.STARTING);
          resolve();
        });
      });

      // This will trigger state change from STOPPED to STARTING
      server
        .start({
          transport: { type: "stdio" },
        })
        .catch(() => {
          // Expected to fail since we don't have actual transport setup
        });

      await stateChangePromise;
    });

    it("should track uptime when running", async () => {
      // Mock the server start to avoid actual transport setup
      vi.spyOn(server as any, "setState").mockImplementation((state: any) => {
        (server as any).state = state;
        (server as any).startTime = new Date();
      });

      (server as any).setState(ServerState.RUNNING);

      // Wait a bit to ensure uptime is tracked
      await new Promise((resolve) => setTimeout(resolve, 10));

      const status = server.getStatus();
      expect(status.uptime).toBeGreaterThan(0);
    });
  });

  describe("Error Handling", () => {
    it("should throw error when starting already running server", async () => {
      // Mock server as running
      (server as any).state = ServerState.RUNNING;

      await expect(
        server.start({
          transport: { type: "stdio" },
        })
      ).rejects.toThrow("Server is already running");
    });

    it("should handle unsupported transport type", async () => {
      await expect(
        server.start({
          transport: { type: "unsupported" as any },
        })
      ).rejects.toThrow("Unsupported transport type");
    });
  });

  describe("Tool Handling", () => {
    it("should return empty tools array by default", async () => {
      const tools = await (server as any).getAvailableTools();
      expect(tools).toEqual([]);
    });

    it("should throw error for unimplemented tool calls", async () => {
      await expect(
        (server as any).handleToolCall("test-tool", {})
      ).rejects.toThrow('Tool "test-tool" not implemented');
    });
  });

  describe("Client Connection Tracking", () => {
    it("should increment connected clients count", () => {
      (server as any).onClientConnected();
      expect(server.getStatus().connectedClients).toBe(1);
    });

    it("should decrement connected clients count", () => {
      (server as any).onClientConnected();
      (server as any).onClientDisconnected();
      expect(server.getStatus().connectedClients).toBe(0);
    });

    it("should not go below 0 connected clients", () => {
      (server as any).onClientDisconnected();
      expect(server.getStatus().connectedClients).toBe(0);
    });

    it("should emit clientConnected event", async () => {
      const clientConnectedPromise = new Promise<void>((resolve) => {
        server.on("clientConnected", (event) => {
          expect(event.count).toBe(1);
          resolve();
        });
      });

      (server as any).onClientConnected();
      await clientConnectedPromise;
    });

    it("should emit clientDisconnected event", async () => {
      const clientDisconnectedPromise = new Promise<void>((resolve) => {
        server.on("clientDisconnected", (event) => {
          expect(event.count).toBe(0);
          resolve();
        });
      });

      (server as any).onClientConnected();
      (server as any).onClientDisconnected();
      await clientDisconnectedPromise;
    });
  });
});
