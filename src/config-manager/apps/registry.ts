/**
 * Application registry management
 */

import { promises as fs } from "fs";
import { vol } from "memfs";
import { isTestMode } from "../../config/environment.js";
import { join } from "path";
import { homedir, platform } from "os";
import {
  ApplicationRegistry,
  ApplicationDefinition,
  PlatformConfig,
} from "../types/index.js";

export class AppRegistry {
  private registryPath: string;
  private registry: ApplicationRegistry | null = null;
  private fs: typeof fs;
  private basePath: string;

  constructor(basePath: string = join(homedir(), ".toolprint/hypertool-mcp")) {
    this.basePath = basePath;
    this.registryPath = join(basePath, "apps/registry.json");

    // Use memfs in test mode, real fs in production
    this.fs = isTestMode() ? (vol.promises as any as typeof fs) : fs;
  }

  /**
   * Initialize the registry with default applications
   */
  private createDefaultRegistry(): ApplicationRegistry {
    return {
      version: "1.0.0",
      applications: {
        "claude-desktop": {
          name: "Claude Desktop",
          enabled: true,
          platforms: {
            darwin: {
              configPath:
                "~/Library/Application Support/Claude/claude_desktop_config.json",
              format: "standard",
            },
            win32: {
              configPath: "%APPDATA%\\Claude\\claude_desktop_config.json",
              format: "standard",
            },
          },
          detection: {
            type: "directory",
            path:
              this.getCurrentPlatform() === "darwin"
                ? "~/Library/Application Support/Claude"
                : "%APPDATA%\\Claude",
          },
        },
        cursor: {
          name: "Cursor IDE",
          enabled: true,
          platforms: {
            all: {
              configPath: "~/.cursor/mcp.json",
              format: "standard",
            },
          },
          detection: {
            type: "directory",
            path: "~/.cursor",
          },
        },
        "claude-code": {
          name: "Claude Code",
          enabled: true,
          platforms: {
            all: {
              configPath: "~/.claude.json",
              format: "custom",
              transformer: "claude-code",
            },
          },
          detection: {
            type: "file",
            path: "~/.claude.json",
          },
        },
      },
    };
  }

  /**
   * Load the application registry
   */
  async load(): Promise<ApplicationRegistry> {
    if (this.registry) {
      return this.registry;
    }

    try {
      const content = await this.fs.readFile(this.registryPath, "utf-8");
      this.registry = JSON.parse(content);
      return this.registry!;
    } catch (error) {
      // If file doesn't exist, create default registry
      if ((error as any).code === "ENOENT") {
        this.registry = this.createDefaultRegistry();
        await this.save();
        return this.registry;
      }
      throw error;
    }
  }

  /**
   * Save the application registry
   */
  async save(): Promise<void> {
    if (!this.registry) {
      throw new Error("No registry loaded");
    }

    // Ensure directory exists
    const dir = join(this.registryPath, "..");
    await this.fs.mkdir(dir, { recursive: true });

    // Write registry
    await this.fs.writeFile(
      this.registryPath,
      JSON.stringify(this.registry, null, 2),
      "utf-8"
    );
  }

  /**
   * Get all enabled applications
   */
  async getEnabledApplications(): Promise<
    Record<string, ApplicationDefinition>
  > {
    const registry = await this.load();
    const enabled: Record<string, ApplicationDefinition> = {};

    for (const [id, app] of Object.entries(registry.applications)) {
      if (app.enabled) {
        enabled[id] = app;
      }
    }

    return enabled;
  }

  /**
   * Get application by ID
   */
  async getApplication(appId: string): Promise<ApplicationDefinition | null> {
    const registry = await this.load();
    return registry.applications[appId] || null;
  }

  /**
   * Add or update an application
   */
  async setApplication(
    appId: string,
    app: ApplicationDefinition
  ): Promise<void> {
    const registry = await this.load();
    registry.applications[appId] = app;
    await this.save();
  }

  /**
   * Remove an application
   */
  async removeApplication(appId: string): Promise<void> {
    const registry = await this.load();
    delete registry.applications[appId];
    await this.save();
  }

  /**
   * Get current platform (for testing support)
   */
  private getCurrentPlatform(): NodeJS.Platform {
    // In test mode, check for simulated platform
    if (isTestMode()) {
      const testPlatform = (global as any).__TEST_PLATFORM__;
      if (testPlatform) {
        return testPlatform;
      }
    }
    return platform() as NodeJS.Platform;
  }

  /**
   * Get platform-specific configuration for an application
   */
  getPlatformConfig(app: ApplicationDefinition): PlatformConfig | null {
    // Use test platform if available, otherwise use actual platform
    const currentPlatform = this.getCurrentPlatform();

    // Check for platform-specific config first
    if (currentPlatform === "darwin" && app.platforms.darwin) {
      return app.platforms.darwin;
    } else if (currentPlatform === "linux" && app.platforms.linux) {
      return app.platforms.linux;
    } else if (currentPlatform === "win32" && app.platforms.win32) {
      return app.platforms.win32;
    }

    // Fall back to 'all' if available
    if (app.platforms.all) {
      return app.platforms.all;
    }

    return null;
  }

  /**
   * Resolve path with home directory and environment variables
   */
  resolvePath(path: string): string {
    // Replace ~ with home directory (use test base directory in test mode)
    if (path.startsWith("~")) {
      const homeDir = isTestMode()
        ? this.basePath.replace("/.toolprint/hypertool-mcp", "")
        : homedir();
      path = join(homeDir, path.slice(1));
    }

    // Replace environment variables (Windows style %VAR%)
    path = path.replace(/%([^%]+)%/g, (_, varName) => {
      return process.env[varName] || "";
    });

    // Replace environment variables (Unix style $VAR or ${VAR})
    path = path.replace(/\$\{?([A-Z_][A-Z0-9_]*)\}?/gi, (_, varName) => {
      return process.env[varName] || "";
    });

    return path;
  }

  /**
   * Detect if an application is installed
   */
  async isApplicationInstalled(app: ApplicationDefinition): Promise<boolean> {
    const detection = app.detection;

    switch (detection.type) {
      case "file":
      case "directory":
        if (!detection.path) return false;
        const resolvedPath = this.resolvePath(detection.path);
        try {
          await this.fs.access(resolvedPath);
          return true;
        } catch {
          return false;
        }

      case "project-local":
        // Project-local apps are always "installed" if we're checking them
        return true;

      case "command":
        // TODO: Implement command-based detection
        return false;

      default:
        return false;
    }
  }
}
