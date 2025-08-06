/**
 * Lightweight tests for AppRegistry without heavy fixtures
 * Designed to run quickly without timeouts
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { vol } from "memfs";
import { AppRegistry } from "./registry.js";
import {
  EnvironmentManager,
  EnvironmentMode,
} from "../../config/environment.js";
import type { ApplicationRegistry } from "../types/index.js";

// Ensure we're in test mode
process.env.NODE_ENV = "test";

describe("AppRegistry - Lightweight", () => {
  const configRoot = "/test/.hypertool";
  let registry: AppRegistry;

  beforeEach(() => {
    // Set test mode via EnvironmentManager
    const envManager = EnvironmentManager.getInstance();
    envManager.setMode(EnvironmentMode.TEST, "/test");

    // Simple reset and setup
    vol.reset();
    vol.mkdirSync(`${configRoot}/apps`, { recursive: true });
    registry = new AppRegistry(configRoot);
  });

  afterEach(() => {
    vol.reset();
    EnvironmentManager.getInstance().reset();
  });

  describe("basic operations", () => {
    it("should create default registry on first load", async () => {
      const loaded = await registry.load();
      expect(loaded.version).toBe("1.0.0");
      expect(loaded.applications).toBeDefined();
    });

    it("should save and load registry", async () => {
      // Load default
      await registry.load();

      // Add an app
      await registry.setApplication("test-app", {
        name: "Test App",
        enabled: true,
        platforms: {
          all: {
            configPath: "~/.test/config.json",
            format: "standard",
          },
        },
        detection: {
          type: "directory",
          path: "~/.test",
        },
      });

      // Save
      await registry.save();

      // Create new instance and verify
      const newRegistry = new AppRegistry(configRoot);
      const loaded = await newRegistry.load();

      expect(loaded.applications["test-app"]).toBeDefined();
      expect(loaded.applications["test-app"].name).toBe("Test App");
    });

    it("should get application by ID", async () => {
      await registry.load();

      // Add test app
      const testApp = {
        name: "My App",
        enabled: true,
        platforms: {
          all: {
            configPath: "~/.myapp/config.json",
            format: "standard" as const,
          },
        },
        detection: {
          type: "directory" as const,
          path: "~/.myapp",
        },
      };

      await registry.setApplication("myapp", testApp);

      const retrieved = await registry.getApplication("myapp");
      expect(retrieved).toEqual(testApp);
    });

    it("should remove application", async () => {
      await registry.load();

      // Add then remove
      await registry.setApplication("temp", {
        name: "Temp App",
        enabled: true,
        platforms: {
          all: {
            configPath: "~/.temp/config.json",
            format: "standard",
          },
        },
        detection: {
          type: "directory",
          path: "~/.temp",
        },
      });

      expect(await registry.getApplication("temp")).toBeTruthy();

      await registry.removeApplication("temp");
      expect(await registry.getApplication("temp")).toBeNull();
    });

    it("should get enabled applications only", async () => {
      await registry.load();

      // Add enabled and disabled apps
      await registry.setApplication("enabled-app", {
        name: "Enabled",
        enabled: true,
        platforms: {
          all: { configPath: "~/enabled.json", format: "standard" },
        },
        detection: { type: "file", path: "~/enabled.json" },
      });

      await registry.setApplication("disabled-app", {
        name: "Disabled",
        enabled: false,
        platforms: {
          all: { configPath: "~/disabled.json", format: "standard" },
        },
        detection: { type: "file", path: "~/disabled.json" },
      });

      const enabled = await registry.getEnabledApplications();

      expect(enabled["enabled-app"]).toBeDefined();
      expect(enabled["disabled-app"]).toBeUndefined();
    });
  });

  describe("platform handling", () => {
    it("should resolve home directory paths", () => {
      const resolved = registry.resolvePath("~/test/path");
      expect(resolved).not.toContain("~");
      expect(resolved).toContain("/test/path");
    });

    it("should get platform-specific config", async () => {
      await registry.load();

      const app = {
        name: "Multi Platform",
        enabled: true,
        platforms: {
          darwin: {
            configPath: "~/Library/App/config.json",
            format: "standard" as const,
          },
          win32: {
            configPath: "%APPDATA%\\App\\config.json",
            format: "standard" as const,
          },
          linux: {
            configPath: "~/.config/app/config.json",
            format: "standard" as const,
          },
        },
        detection: {
          type: "directory" as const,
          path: "~/.app",
        },
      };

      await registry.setApplication("multiplatform", app);
      const retrieved = await registry.getApplication("multiplatform");

      if (retrieved) {
        // Mock different platforms
        const originalPlatform = process.platform;

        try {
          // Test darwin
          Object.defineProperty(process, "platform", {
            value: "darwin",
            writable: true,
          });
          const darwinConfig = registry.getPlatformConfig(retrieved);
          expect(darwinConfig?.configPath).toContain("Library");

          // Test win32
          Object.defineProperty(process, "platform", {
            value: "win32",
            writable: true,
          });
          const winConfig = registry.getPlatformConfig(retrieved);
          expect(winConfig?.configPath).toContain("%APPDATA%");

          // Test linux
          Object.defineProperty(process, "platform", {
            value: "linux",
            writable: true,
          });
          const linuxConfig = registry.getPlatformConfig(retrieved);
          expect(linuxConfig?.configPath).toContain(".config");
        } finally {
          // Restore
          Object.defineProperty(process, "platform", {
            value: originalPlatform,
            writable: true,
          });
        }
      }
    });
  });

  describe("detection", () => {
    it("should detect installed applications by directory", async () => {
      await registry.load();

      const app = {
        name: "Dir App",
        enabled: true,
        platforms: {
          all: {
            configPath: "~/.dirapp/config.json",
            format: "standard" as const,
          },
        },
        detection: {
          type: "directory" as const,
          path: "~/.dirapp",
        },
      };

      await registry.setApplication("dirapp", app);
      const retrieved = await registry.getApplication("dirapp");

      if (retrieved) {
        // Not installed yet
        expect(await registry.isApplicationInstalled(retrieved)).toBe(false);

        // Create directory
        const resolvedPath = registry.resolvePath("~/.dirapp");
        vol.mkdirSync(resolvedPath, { recursive: true });

        // Now installed
        expect(await registry.isApplicationInstalled(retrieved)).toBe(true);
      }
    });

    it("should detect installed applications by file", async () => {
      await registry.load();

      const app = {
        name: "File App",
        enabled: true,
        platforms: {
          all: {
            configPath: "~/.fileapp/config.json",
            format: "standard" as const,
          },
        },
        detection: {
          type: "file" as const,
          path: "~/.fileapp/marker.txt",
        },
      };

      await registry.setApplication("fileapp", app);
      const retrieved = await registry.getApplication("fileapp");

      if (retrieved) {
        // Not installed yet
        expect(await registry.isApplicationInstalled(retrieved)).toBe(false);

        // Create file
        const resolvedPath = registry.resolvePath("~/.fileapp/marker.txt");
        const dir = resolvedPath.substring(0, resolvedPath.lastIndexOf("/"));
        vol.mkdirSync(dir, { recursive: true });
        vol.writeFileSync(resolvedPath, "installed");

        // Now installed
        expect(await registry.isApplicationInstalled(retrieved)).toBe(true);
      }
    });
  });
});
