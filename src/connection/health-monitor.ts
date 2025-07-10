/**
 * Health monitoring system for MCP server connections
 */

import { EventEmitter } from "events";
import { Connection } from "./types";

/**
 * Server health states
 */
export enum HealthState {
  HEALTHY = "healthy",
  UNHEALTHY = "unhealthy", 
  FAILED = "failed"
}

/**
 * Health check result
 */
export interface HealthCheckResult {
  serverId: string;
  serverName: string;
  state: HealthState;
  timestamp: Date;
  lastHealthyAt?: Date;
  error?: Error;
}

/**
 * Health monitoring configuration
 */
export interface HealthMonitorConfig {
  checkInterval: number;
}

/**
 * Health monitoring events
 */
export interface HealthMonitorEvents {
  stateChange: (result: HealthCheckResult, previousState?: HealthState) => void;
}

/**
 * Health monitor for tracking server availability
 */
export class HealthMonitor extends EventEmitter {
  private config: HealthMonitorConfig;
  private connections = new Map<string, Connection>();
  private healthResults = new Map<string, HealthCheckResult>();
  private checkTimer?: NodeJS.Timeout;
  private isRunning = false;

  constructor(config: Partial<HealthMonitorConfig> = {}) {
    super();
    this.config = {
      checkInterval: 30000, // 30 seconds
      ...config,
    };
  }

  /**
   * Add a connection to monitor
   */
  addConnection(connection: Connection): void {
    this.connections.set(connection.serverName, connection);
    
    // Initialize health result
    const isConnected = connection.isConnected();
    this.healthResults.set(connection.serverName, {
      serverId: connection.id,
      serverName: connection.serverName,
      state: isConnected ? HealthState.HEALTHY : HealthState.UNHEALTHY,
      timestamp: new Date(),
      lastHealthyAt: isConnected ? new Date() : undefined,
    });

    // Listen for connection state changes
    connection.on("connected", () => {
      this.updateHealthStatus(connection.serverName, HealthState.HEALTHY);
    });

    connection.on("disconnected", () => {
      this.updateHealthStatus(connection.serverName, HealthState.UNHEALTHY);
    });

    connection.on("failed", (event) => {
      this.updateHealthStatus(connection.serverName, HealthState.FAILED, event.error);
    });
  }

  /**
   * Remove a connection from monitoring
   */
  removeConnection(serverName: string): void {
    this.connections.delete(serverName);
    this.healthResults.delete(serverName);
  }

  /**
   * Start health monitoring
   */
  start(): void {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    this.scheduleHealthChecks();
  }

  /**
   * Stop health monitoring
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = undefined;
    }
  }

  /**
   * Get health status for a specific server
   */
  getHealthStatus(serverName: string): HealthCheckResult | undefined {
    return this.healthResults.get(serverName);
  }

  /**
   * Get health status for all servers
   */
  getAllHealthStatus(): Map<string, HealthCheckResult> {
    return new Map(this.healthResults);
  }

  /**
   * Get list of healthy servers
   */
  getHealthyServers(): string[] {
    return Array.from(this.healthResults.entries())
      .filter(([, result]) => result.state === HealthState.HEALTHY)
      .map(([serverName]) => serverName);
  }

  /**
   * Get list of unhealthy servers
   */
  getUnhealthyServers(): string[] {
    return Array.from(this.healthResults.entries())
      .filter(([, result]) => result.state === HealthState.UNHEALTHY)
      .map(([serverName]) => serverName);
  }

  /**
   * Get list of failed servers
   */
  getFailedServers(): string[] {
    return Array.from(this.healthResults.entries())
      .filter(([, result]) => result.state === HealthState.FAILED)
      .map(([serverName]) => serverName);
  }

  /**
   * Perform health check on all connections
   */
  async performHealthCheck(): Promise<Map<string, HealthCheckResult>> {
    const results = new Map<string, HealthCheckResult>();
    const checkPromises = Array.from(this.connections.entries()).map(
      async ([serverName, connection]) => {
        const result = await this.checkConnectionHealth(connection);
        results.set(serverName, result);
        return result;
      }
    );

    await Promise.allSettled(checkPromises);
    return results;
  }

  /**
   * Check health of a specific connection
   */
  private async checkConnectionHealth(connection: Connection): Promise<HealthCheckResult> {
    const previousResult = this.healthResults.get(connection.serverName);

    try {
      // Perform basic connectivity check
      const isConnected = connection.isConnected();
      
      // Perform ping check if connected
      let pingResult = false;
      if (isConnected) {
        pingResult = await connection.ping();
      }

      const healthy = isConnected && pingResult;
      let state: HealthState;
      
      if (healthy) {
        state = HealthState.HEALTHY;
      } else if (isConnected) {
        state = HealthState.UNHEALTHY;
      } else {
        state = HealthState.FAILED;
      }

      const result: HealthCheckResult = {
        serverId: connection.id,
        serverName: connection.serverName,
        state,
        timestamp: new Date(),
        lastHealthyAt: healthy ? new Date() : previousResult?.lastHealthyAt,
      };

      this.processHealthResult(result, previousResult);
      return result;

    } catch (error) {
      const result: HealthCheckResult = {
        serverId: connection.id,
        serverName: connection.serverName,
        state: HealthState.FAILED,
        timestamp: new Date(),
        error: error as Error,
        lastHealthyAt: previousResult?.lastHealthyAt,
      };

      this.processHealthResult(result, previousResult);
      return result;
    }
  }

  /**
   * Process health check result and emit appropriate events
   */
  private processHealthResult(
    result: HealthCheckResult,
    previousResult?: HealthCheckResult
  ): void {
    // Update stored result
    this.healthResults.set(result.serverName, result);

    // Emit state change event only if state actually changed
    const previousState = previousResult?.state;
    if (previousState !== result.state) {
      this.emit("stateChange", result, previousState);
    }
  }

  /**
   * Update health status based on connection events
   */
  private updateHealthStatus(serverName: string, state: HealthState, error?: Error): void {
    const previousResult = this.healthResults.get(serverName);
    
    const result: HealthCheckResult = {
      serverId: previousResult?.serverId || "",
      serverName,
      state,
      timestamp: new Date(),
      error,
      lastHealthyAt: state === HealthState.HEALTHY ? new Date() : previousResult?.lastHealthyAt,
    };

    this.processHealthResult(result, previousResult);
  }

  /**
   * Schedule periodic health checks
   */
  private scheduleHealthChecks(): void {
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
    }

    this.checkTimer = setInterval(async () => {
      if (this.isRunning) {
        await this.performHealthCheck();
      }
    }, this.config.checkInterval);
  }

  /**
   * Override EventEmitter methods for type safety
   */
  on<K extends keyof HealthMonitorEvents>(event: K, listener: HealthMonitorEvents[K]): this;
  on(event: string, listener: (...args: any[]) => void): this;
  on(event: string, listener: any): this {
    return super.on(event, listener);
  }

  off<K extends keyof HealthMonitorEvents>(event: K, listener: HealthMonitorEvents[K]): this;
  off(event: string, listener: (...args: any[]) => void): this;
  off(event: string, listener: any): this {
    return super.off(event, listener);
  }

  emit<K extends keyof HealthMonitorEvents>(event: K, ...args: Parameters<HealthMonitorEvents[K]>): boolean;
  emit(event: string, ...args: any[]): boolean;
  emit(event: string, ...args: any[]): boolean {
    return super.emit(event, ...args);
  }
}