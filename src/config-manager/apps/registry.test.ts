/**
 * Tests for the application registry using test fixtures
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { AppRegistry } from "./registry.js";
import { TestEnvironment } from "../../../test/fixtures/base.js";
import { FreshInstallScenario } from "../../../test/fixtures/scenarios/index.js";

describe("AppRegistry", () => {
  let env: TestEnvironment;
  let registry: AppRegistry;

  beforeEach(async () => {
    env = new TestEnvironment("/tmp/hypertool-test");
    await env.setup(new FreshInstallScenario());
    registry = new AppRegistry(env.getConfig().configRoot);
  });

  afterEach(async () => {
    await env.teardown();
  });

  describe("initialization", () => {
    it("should create default registry on first load", async () => {
      const loadedRegistry = await registry.load();
      expect(loadedRegistry.version).toBe("1.0.0");
      expect(loadedRegistry.applications).toBeDefined();
      expect(Object.keys(loadedRegistry.applications)).toContain(
        "claude-desktop"
      );
      expect(Object.keys(loadedRegistry.applications)).toContain("cursor");
      expect(Object.keys(loadedRegistry.applications)).toContain("claude-code");
    });

    it("should persist registry after save", async () => {
      await registry.load();
      await registry.save();

      // Create new instance and load
      const newRegistry = new AppRegistry(env.getConfig().configRoot);
      const loaded = await newRegistry.load();
      expect(loaded.version).toBe("1.0.0");
    });
  });

  describe("application management", () => {
    it("should get enabled applications", async () => {
      await registry.load();
      const enabled = await registry.getEnabledApplications();

      expect(Object.keys(enabled).length).toBeGreaterThan(0);
      for (const app of Object.values(enabled)) {
        expect(app.enabled).toBe(true);
      }
    });

    it("should get application by ID", async () => {
      await registry.load();
      const app = await registry.getApplication("cursor");

      expect(app).toBeDefined();
      expect(app?.name).toBe("Cursor IDE");
    });

    it("should add new application", async () => {
      await registry.load();

      const newApp = {
        name: "Test App",
        enabled: true,
        platforms: {
          all: {
            configPath: "~/.test/config.json",
            format: "standard" as const,
          },
        },
        detection: {
          type: "directory" as const,
          path: "~/.test",
        },
      };

      await registry.setApplication("test-app", newApp);
      const retrieved = await registry.getApplication("test-app");

      expect(retrieved).toEqual(newApp);
    });

    it("should remove application", async () => {
      await registry.load();
      await registry.removeApplication("cursor");

      const app = await registry.getApplication("cursor");
      expect(app).toBeNull();
    });
  });

  describe("platform configuration", () => {
    it("should get platform-specific config", async () => {
      await registry.load();
      const app = await registry.getApplication("cursor");

      if (app) {
        const config = registry.getPlatformConfig(app);
        expect(config).toBeDefined();
        expect(config?.configPath).toBe("~/.cursor/mcp.json");
        expect(config?.format).toBe("standard");
      }
    });

    it("should resolve paths with home directory", () => {
      const resolved = registry.resolvePath("~/test/path");
      expect(resolved).toContain("/test/path");
      expect(resolved).not.toContain("~");
    });

    it("should handle platform-specific configurations", async () => {
      await registry.load();
      const app = await registry.getApplication("claude-desktop");

      expect(app).toBeDefined();
      if (app) {
        // Test Darwin platform
        env.setPlatform("darwin");
        const darwinConfig = registry.getPlatformConfig(app);
        expect(darwinConfig?.configPath).toContain(
          "Library/Application Support"
        );

        // Test Windows platform
        env.setPlatform("win32");
        const windowsConfig = registry.getPlatformConfig(app);
        expect(windowsConfig?.configPath).toContain("%APPDATA%");
      }
    });
  });

  describe("filesystem integration", () => {
    it("should detect application installation", async () => {
      await registry.load();

      // Create cursor directory in test environment
      await env.createAppStructure("cursor", {
        ".cursor/settings.json": '{"theme": "dark"}',
      });

      const app = await registry.getApplication("cursor");
      if (app) {
        const isInstalled = await registry.isApplicationInstalled(app);
        expect(isInstalled).toBe(true);
      }
    });

    it("should handle missing applications", async () => {
      await registry.load();

      const app = await registry.getApplication("cursor");
      if (app) {
        // Remove the cursor directory to simulate application not being installed
        const cursorPath = registry.resolvePath("~/.cursor");
        try {
          await env.getFilesystemState(); // Use env's fs access
          const { vol } = await import("memfs");
          vol.rmdirSync(cursorPath, { recursive: true });
        } catch {
          // Directory might not exist, which is what we want
        }

        const isInstalled = await registry.isApplicationInstalled(app);
        expect(isInstalled).toBe(false);
      }
    });

    it("should work with actual file operations through memfs", async () => {
      // Create a new registry and save it
      await registry.load();

      // Modify the registry
      await registry.setApplication("custom-app", {
        name: "Custom Application",
        enabled: true,
        platforms: {
          all: {
            configPath: "~/.custom/config.json",
            format: "standard",
          },
        },
        detection: {
          type: "file",
          path: "~/.custom/config.json",
        },
      });

      await registry.save();

      // Verify the file was written
      const registryPath = `${env.getConfig().configRoot}/apps/registry.json`;
      const fileContent = await env.readFile(registryPath);
      const savedRegistry = JSON.parse(fileContent);

      expect(savedRegistry.applications["custom-app"]).toBeDefined();
      expect(savedRegistry.applications["custom-app"].name).toBe(
        "Custom Application"
      );
    });
  });
});
