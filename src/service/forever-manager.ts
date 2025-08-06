/**
 * Forever-based service manager for cross-platform daemon management
 * Uses Forever (MIT license) to handle process lifecycle
 */

import forever from "forever";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";
import { spawn } from "child_process";
import { createChildLogger } from "../utils/logging.js";

const logger = createChildLogger({ module: "service/forever-manager" });

export interface ForeverServiceConfig {
  profile?: "development" | "production";
  port?: number;
  host?: string;
  mcpConfig?: string;
  logLevel?: string;
  debug?: boolean;
  equipToolset?: string;
  group?: string;
}

export interface ServiceStatus {
  running: boolean;
  pid?: number;
  profile?: string;
  uptime?: number;
  port?: number;
  host?: string;
  logFile?: string;
}

export class ForeverServiceManager {
  private static readonly SERVICE_UID = "hypertool-mcp";
  private static readonly LOG_DIR = path.join(
    os.homedir(),
    ".toolprint",
    "hypertool-mcp",
    "logs"
  );

  /**
   * Get the server entry point path
   */
  private static getServerPath(): string {
    return path.join(process.cwd(), "dist", "server.js");
  }

  /**
   * Get log file paths for a profile
   */
  private static getLogPaths(profile: string) {
    return {
      logFile: path.join(this.LOG_DIR, `hypertool-${profile}.log`),
      outFile: path.join(this.LOG_DIR, `hypertool-${profile}-out.log`),
      errFile: path.join(this.LOG_DIR, `hypertool-${profile}-err.log`),
    };
  }

  /**
   * Ensure log directory exists
   */
  private static async ensureLogDirectory(): Promise<void> {
    await fs.promises.mkdir(this.LOG_DIR, { recursive: true });
  }

  /**
   * Build command line arguments from config
   */
  private static buildArgs(config: ForeverServiceConfig): string[] {
    const args: string[] = ["--transport", "http"];

    if (config.port) {
      args.push("--port", config.port.toString());
    } else if (config.profile === "production") {
      args.push("--port", "8080");
    } else {
      args.push("--port", "3000");
    }

    if (config.host) {
      args.push("--host", config.host);
    }

    if (config.mcpConfig) {
      args.push("--mcp-config", config.mcpConfig);
    }

    if (config.logLevel) {
      args.push("--log-level", config.logLevel);
    } else if (config.profile === "development") {
      args.push("--log-level", "debug");
    } else {
      args.push("--log-level", "info");
    }

    if (config.debug) {
      args.push("--debug");
    }

    if (config.equipToolset) {
      args.push("--equip-toolset", config.equipToolset);
    }

    if (config.group) {
      args.push("--group", config.group);
    }

    return args;
  }

  /**
   * Start the service
   */
  static async start(
    config: ForeverServiceConfig = {}
  ): Promise<ServiceStatus> {
    const profile = config.profile || "development";

    // Check if already running
    const status = await this.status();
    if (status.running) {
      throw new Error(`Service is already running with PID ${status.pid}`);
    }

    // Ensure log directory exists
    await this.ensureLogDirectory();

    const serverPath = this.getServerPath();
    const logPaths = this.getLogPaths(profile);
    const args = this.buildArgs(config);

    // Forever options
    const options = {
      uid: this.SERVICE_UID,
      append: true,
      watch: false,
      max: 5, // max restarts
      silent: true, // Don't output to parent's stdout/stderr
      killTree: true,
      minUptime: 1000,
      spinSleepTime: 1000,
      logFile: logPaths.logFile,
      outFile: logPaths.outFile,
      errFile: logPaths.errFile,
      command: process.execPath, // Use current node executable
      args: args,
      env: {
        ...process.env,
        NODE_ENV: profile === "production" ? "production" : "development",
        HYPERTOOL_PROFILE: profile,
        HYPERTOOL_LOG_FILE: this.getLogPaths(profile).logFile,
      },
    };

    logger.info(`Starting service with profile: ${profile}`);
    logger.debug("Forever options:", options);

    return new Promise((resolve, reject) => {
      // Use spawn to call forever command-line directly (more reliable)
      const foreverArgs = [
        "start",
        "--uid",
        this.SERVICE_UID,
        "--append",
        "--minUptime",
        "1000",
        "--spin",
        "1000",
        "-l",
        logPaths.logFile,
        "-o",
        logPaths.outFile,
        "-e",
        logPaths.errFile,
        serverPath, // Use absolute path
        ...args,
      ];

      logger.info(
        `Starting Forever with command: npx forever ${foreverArgs.join(" ")}`
      );

      const foreverProcess = spawn("npx", ["forever", ...foreverArgs], {
        cwd: process.cwd(),
        env: {
          ...process.env,
          NODE_ENV: profile === "production" ? "production" : "development",
          HYPERTOOL_PROFILE: profile,
          HYPERTOOL_LOG_FILE: logPaths.logFile,
        },
        stdio: "pipe",
      });

      let output = "";
      foreverProcess.stdout.on("data", (data: Buffer) => {
        output += data.toString();
      });

      foreverProcess.stderr.on("data", (data: Buffer) => {
        output += data.toString();
      });

      foreverProcess.on("exit", (code: number | null) => {
        if (code === 0) {
          // Give Forever a moment to start the process
          setTimeout(async () => {
            const status = await this.status();
            if (status.running) {
              logger.info(
                `Service started successfully with PID ${status.pid}`
              );
              resolve(status);
            } else {
              logger.error("Forever command succeeded but service not running");
              logger.error("Forever output:", output);
              reject(
                new Error("Service failed to start after Forever command")
              );
            }
          }, 2000);
        } else {
          logger.error(`Forever command failed with code ${code}`);
          logger.error("Forever output:", output);
          reject(new Error(`Forever start command failed: ${output}`));
        }
      });

      foreverProcess.on("error", (err: Error) => {
        logger.error("Error starting Forever process:", err);
        reject(err);
      });
    });
  }

  /**
   * Stop the service
   */
  static async stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      // Get the current status and actual UID
      forever.list(false, async (err, processes) => {
        if (err || !processes) {
          logger.info("Service is not running");
          resolve();
          return;
        }

        // Find our process
        const proc = processes.find(
          (p) =>
            p.uid === this.SERVICE_UID ||
            (p.file && p.file.includes("server.js"))
        );

        if (!proc) {
          logger.info("Service is not running");
          resolve();
          return;
        }

        logger.info(`Stopping service with PID ${proc.pid}, UID ${proc.uid}`);

        // Stop by the actual UID (not our expected one)
        try {
          forever.stop(proc.uid);
        } catch (error) {
          // If stop by UID fails, try by PID
          if (proc.pid) {
            forever.stopbypid(proc.pid);
          }
        }

        // Give it time to stop
        setTimeout(async () => {
          const newStatus = await this.status();
          if (!newStatus.running) {
            logger.info("Service stopped successfully");
            resolve();
          } else {
            // If still running, try stopAll as last resort
            forever.stopAll();
            setTimeout(async () => {
              const finalStatus = await this.status();
              if (!finalStatus.running) {
                resolve();
              } else {
                reject(new Error("Failed to stop service"));
              }
            }, 2000);
          }
        }, 2000);
      });
    });
  }

  /**
   * Restart the service
   */
  static async restart(
    config: ForeverServiceConfig = {}
  ): Promise<ServiceStatus> {
    logger.info("Restarting service");

    // Stop if running
    try {
      await this.stop();
      // Wait a bit between stop and start
      await new Promise((resolve) => setTimeout(resolve, 1000));
    } catch (error) {
      logger.warn("Error stopping service during restart:", error);
    }

    // Start with new config
    return await this.start(config);
  }

  /**
   * Get service status
   */
  static async status(): Promise<ServiceStatus> {
    return new Promise((resolve) => {
      forever.list(false, (err, processes) => {
        if (err || !processes) {
          resolve({ running: false });
          return;
        }

        // Look for our process by script name since UID might be auto-generated
        const proc = processes.find(
          (p) =>
            p.uid === this.SERVICE_UID ||
            (p.file && p.file.includes("server.js"))
        );
        if (!proc) {
          resolve({ running: false });
          return;
        }

        // Parse args to get profile and port
        let profile = "development";
        let port = 3000;
        let host = "localhost";

        if (proc.env?.HYPERTOOL_PROFILE) {
          profile = proc.env.HYPERTOOL_PROFILE;
        }

        if (proc.args && Array.isArray(proc.args)) {
          const portIndex = proc.args.indexOf("--port");
          if (portIndex !== -1 && proc.args[portIndex + 1]) {
            port = parseInt(proc.args[portIndex + 1], 10);
          }

          const hostIndex = proc.args.indexOf("--host");
          if (hostIndex !== -1 && proc.args[hostIndex + 1]) {
            host = proc.args[hostIndex + 1];
          }
        }

        resolve({
          running: true,
          pid: proc.pid,
          profile: profile,
          uptime:
            proc.running && proc.ctime
              ? Date.now() - new Date(proc.ctime).getTime()
              : undefined,
          port: port,
          host: host,
          logFile: proc.logFile,
        });
      });
    });
  }

  /**
   * Get logs for the service
   */
  static async getLogs(
    options: { tail?: number; follow?: boolean } = {}
  ): Promise<string> {
    const status = await this.status();
    const profile = status.profile || "development";
    const logPaths = this.getLogPaths(profile);

    if (!fs.existsSync(logPaths.outFile)) {
      throw new Error(`Log file not found: ${logPaths.outFile}`);
    }

    if (options.follow) {
      // For follow mode, return the log file path so the CLI can tail it
      return logPaths.outFile;
    }

    // Read last N lines
    const content = await fs.promises.readFile(logPaths.outFile, "utf8");
    const lines = content.split("\n").filter((line) => line.trim());
    const tailLines = options.tail || 50;

    return lines.slice(-tailLines).join("\n");
  }

  /**
   * Clean up all Forever processes (useful for testing)
   */
  static async cleanupAll(): Promise<void> {
    return new Promise((resolve, reject) => {
      forever.stopAll();
      setTimeout(() => {
        resolve();
      }, 1000);
    });
  }
}
