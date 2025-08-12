/**
 * DXT Client Implementation
 * Phase 0: Direct Node.js process spawning with stdio transport
 */

import { join } from "path";
import { EventEmitter } from "events";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { DxtServerConfig } from "../../config/dxt-config.js";
import { loadDxt } from "../../dxt/loader.js";
import { ConnectionOptions } from "../types.js";
import { BaseConnection } from "./base.js";

/**
 * DXT client that spawns Node.js process
 */
export class DxtClient extends EventEmitter {
  private client: Client | null = null;
  private isConnected = false;
  private extractDir: string | null = null;

  constructor(private config: DxtServerConfig) {
    super();
  }

  get isRunning(): boolean {
    return this.isConnected && this.client !== null;
  }

  /**
   * Get the SDK client instance for advanced operations
   */
  get sdkClient(): Client | null {
    return this.client;
  }

  /**
   * Start the DXT process
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      return;
    }

    try {
      // Load and extract DXT package
      const { manifest, extractDir } = await loadDxt(this.config.path);
      this.extractDir = extractDir;

      const mainPath = join(extractDir, manifest.main);

      // Create SDK transport - let it manage the process
      const transport = new StdioClientTransport({
        command: "node",
        args: [mainPath],
        cwd: extractDir,
        env: { ...(process.env as Record<string, string>), ...this.config.env },
      });

      this.client = new Client(
        {
          name: "hypertool-mcp-dxt-client",
          version: "1.0.0",
        },
        {
          capabilities: {
            tools: {},
          },
        }
      );

      await this.client.connect(transport);
      this.isConnected = true;
    } catch (error) {
      await this.cleanup();
      throw new Error(
        `Failed to start DXT client: ${(error as Error).message}`
      );
    }
  }

  /**
   * Stop the DXT process
   */
  async stop(): Promise<void> {
    await this.cleanup();
  }

  private async cleanup(): Promise<void> {
    if (this.client) {
      try {
        await this.client.close();
      } catch (error) {
        // Ignore close errors
      }
      this.client = null;
    }

    this.isConnected = false;
  }

  /**
   * List tools from the DXT server
   */
  async listTools() {
    if (!this.client) {
      throw new Error("DXT client not connected");
    }
    return await this.client.listTools();
  }

  /**
   * Call a tool on the DXT server
   */
  async callTool(params: any) {
    if (!this.client) {
      throw new Error("DXT client not connected");
    }
    return await this.client.callTool(params);
  }

  /**
   * Ping the server to check if it's responsive
   */
  async ping(): Promise<boolean> {
    if (!this.isRunning) {
      return false;
    }

    try {
      await this.listTools();
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * DXT connection implementation
 */
export class DxtConnection extends BaseConnection<DxtClient> {
  protected _client: DxtClient | null = null;

  constructor(
    serverName: string,
    config: DxtServerConfig,
    options: ConnectionOptions = {}
  ) {
    super(serverName, config, options);
  }

  /**
   * Connect to the DXT server
   */
  protected async doConnect(): Promise<void> {
    this._client = new DxtClient(this.config as DxtServerConfig);

    // Forward client events
    this._client.on("error", (error) => {
      this.emit("error", this.createEvent("error", { error }));
    });

    this._client.on("disconnect", () => {
      this.emit("disconnected", this.createEvent("disconnected"));
    });

    await this._client.start();
  }

  /**
   * Disconnect from the DXT server
   */
  protected async doDisconnect(): Promise<void> {
    if (this._client) {
      await this._client.stop();
      this._client = null;
    }
  }

  /**
   * Ping the DXT server
   */
  protected async doPing(): Promise<boolean> {
    if (!this._client) {
      return false;
    }
    return await this._client.ping();
  }
}
