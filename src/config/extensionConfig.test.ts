/**
 * Extension Configuration Manager Tests
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ExtensionConfigManager } from "./extensionConfig.js";
import { mkdtemp, rm, writeFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

describe("ExtensionConfigManager", () => {
  let tempDir: string;
  let configPath: string;
  let configManager: ExtensionConfigManager;

  beforeEach(async () => {
    // Create temporary directory
    tempDir = await mkdtemp(join(tmpdir(), "hypertool-test-"));
    configPath = join(tempDir, "config.json");
    configManager = new ExtensionConfigManager(configPath);
  });

  afterEach(async () => {
    // Cleanup
    try {
      await rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("load", () => {
    it("should load default config when file doesn't exist", async () => {
      const config = await configManager.load();

      expect(config.extensions).toBeDefined();
      expect(config.extensions!.autoDiscovery).toBe(true);
      expect(config.extensions!.settings).toEqual({});
    });

    it("should load existing config file", async () => {
      const testConfig = {
        extensions: {
          autoDiscovery: false,
          settings: {
            "test-extension": {
              isEnabled: true,
              userConfig: {
                api_key: "test-key",
              },
            },
          },
        },
      };

      await writeFile(configPath, JSON.stringify(testConfig));
      const config = await configManager.load();

      expect(config.extensions!.autoDiscovery).toBe(false);
      expect(config.extensions!.settings["test-extension"]).toEqual({
        isEnabled: true,
        userConfig: {
          api_key: "test-key",
        },
      });
    });

    it("should handle malformed config file gracefully", async () => {
      await writeFile(configPath, "invalid json");
      const config = await configManager.load();

      // Should fall back to defaults
      expect(config.extensions).toBeDefined();
      expect(config.extensions!.autoDiscovery).toBe(true);
    });
  });

  describe("save", () => {
    it("should save config to file", async () => {
      const config = {
        extensions: {
          autoDiscovery: true,
          settings: {
            "test-extension": {
              isEnabled: false,
              userConfig: {
                timeout: 30,
              },
            },
          },
        },
      };

      await configManager.save(config);

      // Load and verify
      const loadedConfig = await configManager.load();
      expect(loadedConfig.extensions!.settings["test-extension"]).toEqual({
        isEnabled: false,
        userConfig: {
          timeout: 30,
        },
      });
    });
  });

  describe("extension settings management", () => {
    beforeEach(async () => {
      await configManager.load();
    });

    it("should get extension settings", async () => {
      await configManager.setExtensionSettings("test-ext", {
        isEnabled: true,
        userConfig: { key: "value" },
      });

      const settings = configManager.getExtensionSettings("test-ext");
      expect(settings).toEqual({
        isEnabled: true,
        userConfig: { key: "value" },
      });
    });

    it("should return undefined for non-existent extension", () => {
      const settings = configManager.getExtensionSettings("non-existent");
      expect(settings).toBeUndefined();
    });

    it("should enable extension", async () => {
      await configManager.setExtensionSettings("test-ext", {
        isEnabled: false,
        userConfig: { key: "value" },
      });

      await configManager.enableExtension("test-ext");

      const settings = configManager.getExtensionSettings("test-ext");
      expect(settings!.isEnabled).toBe(true);
      expect(settings!.userConfig).toEqual({ key: "value" });
    });

    it("should disable extension", async () => {
      await configManager.setExtensionSettings("test-ext", {
        isEnabled: true,
        userConfig: { key: "value" },
      });

      await configManager.disableExtension("test-ext");

      const settings = configManager.getExtensionSettings("test-ext");
      expect(settings!.isEnabled).toBe(false);
      expect(settings!.userConfig).toEqual({ key: "value" });
    });

    it("should update extension user config", async () => {
      await configManager.setExtensionSettings("test-ext", {
        isEnabled: true,
        userConfig: { old_key: "old_value" },
      });

      await configManager.updateExtensionUserConfig("test-ext", {
        new_key: "new_value",
        number_key: 42,
      });

      const settings = configManager.getExtensionSettings("test-ext");
      expect(settings!.isEnabled).toBe(true);
      expect(settings!.userConfig).toEqual({
        new_key: "new_value",
        number_key: 42,
      });
    });

    it("should remove extension", async () => {
      await configManager.setExtensionSettings("test-ext", {
        isEnabled: true,
        userConfig: { key: "value" },
      });

      await configManager.removeExtension("test-ext");

      const settings = configManager.getExtensionSettings("test-ext");
      expect(settings).toBeUndefined();
    });

    it("should get extension names", async () => {
      await configManager.setExtensionSettings("ext1", { isEnabled: true });
      await configManager.setExtensionSettings("ext2", { isEnabled: false });

      const names = configManager.getExtensionNames();
      expect(names).toEqual(expect.arrayContaining(["ext1", "ext2"]));
    });
  });

  describe("auto-discovery management", () => {
    beforeEach(async () => {
      await configManager.load();
    });

    it("should get auto-discovery setting", () => {
      const isEnabled = configManager.isAutoDiscoveryEnabled();
      expect(isEnabled).toBe(true); // Default
    });

    it("should set auto-discovery setting", async () => {
      await configManager.setAutoDiscovery(false);

      const isEnabled = configManager.isAutoDiscoveryEnabled();
      expect(isEnabled).toBe(false);
    });
  });

  describe("directory management", () => {
    beforeEach(async () => {
      await configManager.load();
    });

    it("should get extensions directory", () => {
      const dir = configManager.getExtensionsDirectory();
      expect(dir).toContain(".toolprint/hypertool-mcp/extensions");
    });

    it("should set extensions directory", async () => {
      const customDir = "/custom/extensions/path";
      await configManager.setExtensionsDirectory(customDir);

      const dir = configManager.getExtensionsDirectory();
      expect(dir).toBe(customDir);
    });
  });

  describe("validateConfig", () => {
    it("should validate correct config", () => {
      const config = {
        extensions: {
          directory: "/path/to/extensions",
          autoDiscovery: true,
          settings: {
            "test-ext": {
              isEnabled: true,
              userConfig: {
                key: "value",
              },
            },
          },
        },
      };

      const result = configManager.validateConfig(config);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should detect invalid directory type", () => {
      const config = {
        extensions: {
          directory: 123,
          autoDiscovery: true,
          settings: {},
        },
      };

      const result = configManager.validateConfig(config);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain("extensions.directory must be a string");
    });

    it("should detect invalid autoDiscovery type", () => {
      const config = {
        extensions: {
          autoDiscovery: "true",
          settings: {},
        },
      };

      const result = configManager.validateConfig(config);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain(
        "extensions.autoDiscovery must be a boolean"
      );
    });

    it("should detect invalid settings structure", () => {
      const config = {
        extensions: {
          settings: "not an object",
        },
      };

      const result = configManager.validateConfig(config);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain("extensions.settings must be an object");
    });

    it("should detect invalid extension setting", () => {
      const config = {
        extensions: {
          settings: {
            "test-ext": {
              isEnabled: "not a boolean",
              userConfig: [],
            },
          },
        },
      };

      const result = configManager.validateConfig(config);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain(
        "extensions.settings.test-ext.isEnabled must be a boolean"
      );
      expect(result.errors).toContain(
        "extensions.settings.test-ext.userConfig must be an object"
      );
    });
  });
});
