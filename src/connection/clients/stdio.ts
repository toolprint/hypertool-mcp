/**
 * Stdio client implementation for MCP servers
 */

import { spawn, ChildProcess } from "child_process";
import { EventEmitter } from "events";
import { StdioServerConfig } from "../../types/config";
import { ConnectionOptions } from "../types";
import { BaseConnection } from "./base";
import { MCPMessage, IStdioClient, ClientOptions, DEFAULT_CLIENT_OPTIONS } from "./types";

/**
 * Stdio client for communicating with MCP servers via child process
 */
export class StdioClient extends EventEmitter implements IStdioClient {
  private _process: ChildProcess | null = null;
  private messageBuffer = "";
  private options: Required<ClientOptions>;

  constructor(
    private config: StdioServerConfig,
    options: ClientOptions = {}
  ) {
    super();
    this.options = { ...DEFAULT_CLIENT_OPTIONS, ...options };
  }

  get process(): ChildProcess | null {
    return this._process;
  }

  get isRunning(): boolean {
    return this._process?.pid !== undefined && !this._process.killed;
  }

  /**
   * Start the MCP server process
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      return;
    }

    return new Promise((resolve, reject) => {
      try {
        const env = { ...process.env, ...this.config.env };
        
        this._process = spawn(this.config.command, this.config.args || [], {
          stdio: ['pipe', 'pipe', 'pipe'],
          env,
        });

        this.setupProcessHandlers(resolve, reject);
        
      } catch (error) {
        reject(new Error(`Failed to spawn process: ${(error as Error).message}`));
      }
    });
  }

  /**
   * Stop the MCP server process
   */
  async stop(): Promise<void> {
    if (!this._process) {
      return;
    }

    return new Promise((resolve) => {
      const cleanup = () => {
        this._process = null;
        resolve();
      };

      if (this._process?.killed) {
        cleanup();
        return;
      }

      this._process?.once('exit', cleanup);
      this._process?.kill('SIGTERM');
      
      // Force kill after timeout
      setTimeout(() => {
        if (this._process && !this._process.killed) {
          this._process.kill('SIGKILL');
        }
      }, 5000);
    });
  }

  /**
   * Send a message to the MCP server
   */
  async send(message: MCPMessage): Promise<void> {
    if (!this.isRunning || !this._process?.stdin) {
      throw new Error('Process not running or stdin not available');
    }

    const messageStr = JSON.stringify(message) + '\n';
    
    return new Promise((resolve, reject) => {
      if (this._process?.stdin) {
        this._process.stdin.write(messageStr, (error) => {
          if (error) {
            reject(new Error(`Failed to send message: ${error.message}`));
          } else {
            resolve();
          }
        });
      } else {
        reject(new Error('Process stdin not available'));
      }
    });
  }

  /**
   * Ping the server to check if it's responsive
   */
  async ping(): Promise<boolean> {
    if (!this.isRunning) {
      return false;
    }

    try {
      const pingMessage: MCPMessage = {
        jsonrpc: "2.0",
        id: Date.now(),
        method: "ping",
      };

      await this.send(pingMessage);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Setup process event handlers
   */
  private setupProcessHandlers(
    resolve: () => void,
    reject: (error: Error) => void
  ): void {
    if (!this._process) {
      return;
    }

    let isResolved = false;

    // Handle process startup
    this._process.once('spawn', () => {
      if (!isResolved) {
        isResolved = true;
        resolve();
      }
    });

    // Handle process errors
    this._process.once('error', (error) => {
      if (!isResolved) {
        isResolved = true;
        reject(new Error(`Process error: ${error.message}`));
      } else {
        this.emit('error', error);
      }
    });

    // Handle process exit
    this._process.once('exit', (code, signal) => {
      if (!isResolved) {
        isResolved = true;
        reject(new Error(`Process exited with code ${code} and signal ${signal}`));
      } else {
        this.emit('disconnect');
      }
      this._process = null;
    });

    // Handle stdout (messages from server)
    this._process.stdout?.on('data', (data: Buffer) => {
      this.handleStdoutData(data.toString());
    });

    // Handle stderr (log messages)
    this._process.stderr?.on('data', (data: Buffer) => {
      if (this.options.debug) {
        console.error(`[${this.config.command}] ${data.toString()}`);
      }
    });
  }

  /**
   * Handle stdout data and parse JSON messages
   */
  private handleStdoutData(data: string): void {
    this.messageBuffer += data;
    
    const lines = this.messageBuffer.split('\n');
    this.messageBuffer = lines.pop() || '';

    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine) {
        continue;
      }

      try {
        const message: MCPMessage = JSON.parse(trimmedLine);
        this.emit('message', message);
      } catch (error) {
        if (this.options.debug) {
          console.error('Failed to parse message:', trimmedLine, error);
        }
        this.emit('error', new Error(`Invalid JSON message: ${trimmedLine}`));
      }
    }
  }
}

/**
 * Stdio connection implementation
 */
export class StdioConnection extends BaseConnection<StdioClient> {
  protected _client: StdioClient | null = null;

  constructor(
    serverName: string,
    config: StdioServerConfig,
    options: ConnectionOptions = {}
  ) {
    super(serverName, config, options);
  }

  /**
   * Connect to the stdio server
   */
  protected async doConnect(): Promise<void> {
    this._client = new StdioClient(
      this.config as StdioServerConfig,
      {
        timeout: this.options.connectionTimeout,
        debug: this.options.debug,
      }
    );

    // Forward client events
    this._client.on('error', (error) => {
      this.emit('error', this.createEvent('error', { error }));
    });

    this._client.on('disconnect', () => {
      this.emit('disconnected', this.createEvent('disconnected'));
    });

    await this._client.start();
  }

  /**
   * Disconnect from the stdio server
   */
  protected async doDisconnect(): Promise<void> {
    if (this._client) {
      await this._client.stop();
      this._client = null;
    }
  }

  /**
   * Ping the stdio server
   */
  protected async doPing(): Promise<boolean> {
    if (!this._client) {
      return false;
    }
    return await this._client.ping();
  }
}