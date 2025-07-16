/**
 * Tests for health monitoring system
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  HealthMonitor,
  HealthState,
  HealthCheckResult,
} from "./healthMonitor.js";
import { ConnectionEventType, ConnectionEventCallback } from "./types.js";
import { ServerConfig } from "../types/config.js";

// Mock connection class
class MockConnection {
  public id = "test-id";
  public serverName: string;
  public config: ServerConfig;
  public status = { state: "connected" } as any;
  private connected = true;
  private pingResponse = true;
  private eventListeners = new Map<string, ConnectionEventCallback[]>();

  constructor(serverName: string) {
    this.serverName = serverName;
    this.config = { type: "stdio" } as ServerConfig;
  }

  isConnected(): boolean {
    return this.connected;
  }

  async ping(): Promise<boolean> {
    return this.pingResponse;
  }

  setConnected(connected: boolean): void {
    this.connected = connected;
  }

  setPingResponse(response: boolean): void {
    this.pingResponse = response;
  }

  on(event: ConnectionEventType, callback: ConnectionEventCallback): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event)!.push(callback);
  }

  off(event: ConnectionEventType, callback: ConnectionEventCallback): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      const index = listeners.indexOf(callback);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    }
  }

  emit(event: ConnectionEventType, payload: any): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.forEach((listener) => listener(payload));
    }
  }

  // Helper methods for testing
  triggerConnected(): void {
    this.connected = true;
    this.emit("connected", {
      type: "connected",
      serverId: this.id,
      serverName: this.serverName,
      timestamp: new Date(),
    });
  }

  triggerDisconnected(): void {
    this.connected = false;
    this.emit("disconnected", {
      type: "disconnected",
      serverId: this.id,
      serverName: this.serverName,
      timestamp: new Date(),
    });
  }

  triggerFailed(error?: Error): void {
    this.connected = false;
    this.emit("failed", {
      type: "failed",
      serverId: this.id,
      serverName: this.serverName,
      timestamp: new Date(),
      error,
    });
  }
}

describe("HealthMonitor", () => {
  let healthMonitor: HealthMonitor;
  let mockConnection: MockConnection;

  beforeEach(() => {
    healthMonitor = new HealthMonitor({ checkInterval: 100 });
    mockConnection = new MockConnection("test-server");
  });

  afterEach(() => {
    healthMonitor.stop();
  });

  describe("addConnection", () => {
    it("should add connection and initialize health status", () => {
      healthMonitor.addConnection(mockConnection as any);

      const status = healthMonitor.getHealthStatus("test-server");
      expect(status).toBeDefined();
      expect(status!.serverName).toBe("test-server");
      expect(status!.state).toBe(HealthState.HEALTHY);
      expect(status!.lastHealthyAt).toBeDefined();
    });

    it("should initialize as unhealthy if connection is not connected", () => {
      mockConnection.setConnected(false);
      healthMonitor.addConnection(mockConnection as any);

      const status = healthMonitor.getHealthStatus("test-server");
      expect(status!.state).toBe(HealthState.UNHEALTHY);
      expect(status!.lastHealthyAt).toBeUndefined();
    });
  });

  describe("removeConnection", () => {
    it("should remove connection from monitoring", () => {
      healthMonitor.addConnection(mockConnection as any);
      healthMonitor.removeConnection("test-server");

      const status = healthMonitor.getHealthStatus("test-server");
      expect(status).toBeUndefined();
    });
  });

  describe("state tracking", () => {
    beforeEach(() => {
      healthMonitor.addConnection(mockConnection as any);
    });

    it("should track healthy servers", () => {
      const healthyServers = healthMonitor.getHealthyServers();
      expect(healthyServers).toContain("test-server");
      expect(healthMonitor.getUnhealthyServers()).not.toContain("test-server");
      expect(healthMonitor.getFailedServers()).not.toContain("test-server");
    });

    it("should track unhealthy servers", () => {
      mockConnection.triggerDisconnected();

      const unhealthyServers = healthMonitor.getUnhealthyServers();
      expect(unhealthyServers).toContain("test-server");
      expect(healthMonitor.getHealthyServers()).not.toContain("test-server");
      expect(healthMonitor.getFailedServers()).not.toContain("test-server");
    });

    it("should track failed servers", () => {
      mockConnection.triggerFailed(new Error("Connection failed"));

      const failedServers = healthMonitor.getFailedServers();
      expect(failedServers).toContain("test-server");
      expect(healthMonitor.getHealthyServers()).not.toContain("test-server");
      expect(healthMonitor.getUnhealthyServers()).not.toContain("test-server");
    });
  });

  describe("state change events", () => {
    let stateChangeEvents: Array<{
      result: HealthCheckResult;
      previousState?: HealthState;
    }> = [];

    beforeEach(() => {
      stateChangeEvents = [];
      healthMonitor.on("stateChange", (result, previousState) => {
        stateChangeEvents.push({ result, previousState });
      });
      healthMonitor.addConnection(mockConnection as any);
    });

    it("should emit state change from healthy to unhealthy", () => {
      mockConnection.triggerDisconnected();

      expect(stateChangeEvents).toHaveLength(1);
      expect(stateChangeEvents[0].result.state).toBe(HealthState.UNHEALTHY);
      expect(stateChangeEvents[0].previousState).toBe(HealthState.HEALTHY);
    });

    it("should emit state change from healthy to failed", () => {
      const error = new Error("Connection failed");
      mockConnection.triggerFailed(error);

      expect(stateChangeEvents).toHaveLength(1);
      expect(stateChangeEvents[0].result.state).toBe(HealthState.FAILED);
      expect(stateChangeEvents[0].result.error).toBe(error);
      expect(stateChangeEvents[0].previousState).toBe(HealthState.HEALTHY);
    });

    it("should emit state change from unhealthy to healthy", () => {
      // First make it unhealthy
      mockConnection.triggerDisconnected();
      stateChangeEvents = []; // Clear events

      // Then make it healthy again
      mockConnection.triggerConnected();

      expect(stateChangeEvents).toHaveLength(1);
      expect(stateChangeEvents[0].result.state).toBe(HealthState.HEALTHY);
      expect(stateChangeEvents[0].previousState).toBe(HealthState.UNHEALTHY);
    });

    it("should not emit state change if state remains the same", () => {
      // Trigger connected again (should remain healthy)
      mockConnection.triggerConnected();

      expect(stateChangeEvents).toHaveLength(0);
    });
  });

  describe("lastHealthyAt tracking", () => {
    beforeEach(() => {
      healthMonitor.addConnection(mockConnection as any);
    });

    it("should update lastHealthyAt when becoming healthy", async () => {
      const initialTime =
        healthMonitor.getHealthStatus("test-server")!.lastHealthyAt!;

      // Wait a bit and trigger connected again
      await new Promise((resolve) => {
        setTimeout(() => {
          mockConnection.triggerConnected();
          const status = healthMonitor.getHealthStatus("test-server");
          if (status && status.lastHealthyAt) {
            expect(status.lastHealthyAt.getTime()).toBeGreaterThan(
              initialTime.getTime()
            );
          }
          resolve(undefined);
        }, 10);
      });
    });

    it("should preserve lastHealthyAt when becoming unhealthy", () => {
      const initialTime =
        healthMonitor.getHealthStatus("test-server")!.lastHealthyAt!;

      mockConnection.triggerDisconnected();

      const status = healthMonitor.getHealthStatus("test-server")!;
      expect(status.state).toBe(HealthState.UNHEALTHY);
      expect(status.lastHealthyAt).toEqual(initialTime);
    });

    it("should preserve lastHealthyAt when failed", () => {
      const initialTime =
        healthMonitor.getHealthStatus("test-server")!.lastHealthyAt!;

      mockConnection.triggerFailed();

      const status = healthMonitor.getHealthStatus("test-server")!;
      expect(status.state).toBe(HealthState.FAILED);
      expect(status.lastHealthyAt).toEqual(initialTime);
    });
  });

  describe("health checks", () => {
    beforeEach(() => {
      healthMonitor.addConnection(mockConnection as any);
    });

    it("should perform health check on connected server with successful ping", async () => {
      mockConnection.setConnected(true);
      mockConnection.setPingResponse(true);

      const results = await healthMonitor.performHealthCheck();
      const result = results.get("test-server")!;

      expect(result.state).toBe(HealthState.HEALTHY);
      expect(result.lastHealthyAt).toBeDefined();
    });

    it("should mark as unhealthy if connected but ping fails", async () => {
      mockConnection.setConnected(true);
      mockConnection.setPingResponse(false);

      const results = await healthMonitor.performHealthCheck();
      const result = results.get("test-server")!;

      expect(result.state).toBe(HealthState.UNHEALTHY);
    });

    it("should mark as failed if not connected", async () => {
      mockConnection.setConnected(false);

      const results = await healthMonitor.performHealthCheck();
      const result = results.get("test-server")!;

      expect(result.state).toBe(HealthState.FAILED);
    });

    it("should handle ping errors as failed", async () => {
      mockConnection.setConnected(true);
      // Mock ping to throw error
      vi.spyOn(mockConnection, "ping").mockRejectedValue(
        new Error("Ping failed")
      );

      const results = await healthMonitor.performHealthCheck();
      const result = results.get("test-server")!;

      expect(result.state).toBe(HealthState.FAILED);
      expect(result.error).toBeDefined();
    });
  });

  describe("start/stop", () => {
    it("should start and stop monitoring", () => {
      expect(() => {
        healthMonitor.start();
        healthMonitor.stop();
      }).not.toThrow();
    });

    it("should handle multiple start calls", () => {
      expect(() => {
        healthMonitor.start();
        healthMonitor.start(); // Should not throw
        healthMonitor.stop();
      }).not.toThrow();
    });

    it("should handle multiple stop calls", () => {
      expect(() => {
        healthMonitor.start();
        healthMonitor.stop();
        healthMonitor.stop(); // Should not throw
      }).not.toThrow();
    });
  });
});
