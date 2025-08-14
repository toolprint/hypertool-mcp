/**
 * Extension Manager Tests (Integration)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, rm, writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { ExtensionManager } from "./manager.js";
import { ExtensionConfigManager } from "../config/extensionConfig.js";
import { ExtensionValidationService } from "./validation.js";
import { parseManifest } from "../dxt/manifest.js";
import { ExtensionAwareConnectionFactory } from "../connection/extensionFactory.js";

describe("ExtensionManager Integration Tests", () => {
  let tempDir: string;
  let configPath: string;

  beforeEach(async () => {
    // Create temporary directory
    tempDir = await mkdtemp(join(tmpdir(), "hypertool-test-"));
    configPath = join(tempDir, "config.json");

    // Create extensions directory
    const extensionsDir = join(tempDir, "extensions");
    await mkdir(extensionsDir, { recursive: true });

    // Mock console methods to avoid test output
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(async () => {
    // Cleanup
    try {
      await rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
    vi.restoreAllMocks();
  });

  describe("types and interfaces", () => {
    it("should define ExtensionManager class", () => {
      expect(ExtensionManager).toBeDefined();
      expect(typeof ExtensionManager).toBe("function");
    });

    it("should have the correct method signatures", async () => {
      const manager = new ExtensionManager(configPath, tempDir);

      // Check that all required methods exist
      expect(typeof manager.initialize).toBe("function");
      expect(typeof manager.loadExtensions).toBe("function");
      expect(typeof manager.getRuntimeConfigs).toBe("function");
      expect(typeof manager.getEnabledConfigs).toBe("function");
      expect(typeof manager.getExtensionConfig).toBe("function");
      expect(typeof manager.enableExtension).toBe("function");
      expect(typeof manager.disableExtension).toBe("function");
      expect(typeof manager.updateExtensionUserConfig).toBe("function");
      expect(typeof manager.installExtension).toBe("function");
      expect(typeof manager.refreshExtensions).toBe("function");
      expect(typeof manager.getValidationReport).toBe("function");
      expect(typeof manager.getConfigSuggestions).toBe("function");
      expect(typeof manager.listExtensions).toBe("function");
      expect(typeof manager.createServerConfigForExtension).toBe("function");
      expect(typeof manager.getEnabledExtensionsAsServerConfigs).toBe(
        "function"
      );
    });
  });

  describe("configuration structure", () => {
    it("should have proper configuration format", async () => {
      // Test that we can create a valid config structure
      const configManager = new ExtensionConfigManager(configPath);

      const config = await configManager.load();
      expect(config).toBeDefined();
      expect(config.extensions).toBeDefined();
      expect(config.extensions!.settings).toBeDefined();
      expect(typeof config.extensions!.autoDiscovery).toBe("boolean");
    });
  });

  describe("validation system", () => {
    it("should validate configuration correctly", () => {
      const validator = new ExtensionValidationService();

      const manifest = {
        dxt_version: "0.1",
        name: "test-extension",
        version: "1.0.0",
        server: {
          type: "node" as const,
          mcp_config: {
            command: "node",
            args: ["server.js"],
          },
        },
        user_config: {
          api_key: {
            type: "string" as const,
            required: true,
          },
        },
      };

      // Test missing required parameter
      const resultMissing = validator.validateExtensionConfig(manifest);
      expect(resultMissing.isValid).toBe(false);
      expect(resultMissing.errors.length).toBeGreaterThan(0);

      // Test valid parameter
      const userSettings = {
        isEnabled: true,
        userConfig: {
          api_key: "test-key",
        },
      };
      const resultValid = validator.validateExtensionConfig(
        manifest,
        userSettings
      );
      expect(resultValid.isValid).toBe(true);
    });
  });

  describe("manifest parsing", () => {
    it("should support enhanced manifest format", async () => {
      // Create a manifest file
      const manifestDir = join(tempDir, "test-manifest");
      await mkdir(manifestDir, { recursive: true });

      const manifest = {
        dxt_version: "0.1",
        name: "test-extension",
        version: "1.0.0",
        description: "Test extension for validation",
        server: {
          type: "node",
          mcp_config: {
            command: "node",
            args: ["${__dirname}/server.js"],
            env: {
              API_KEY: "${user_config.api_key}",
            },
          },
        },
        user_config: {
          api_key: {
            type: "string",
            required: true,
            title: "API Key",
            description: "Your API key for authentication",
          },
          timeout: {
            type: "number",
            min: 1,
            max: 300,
            default: 30,
          },
        },
      };

      await writeFile(
        join(manifestDir, "manifest.json"),
        JSON.stringify(manifest, null, 2)
      );

      // Parse the manifest
      const parsed = await parseManifest(manifestDir);

      expect(parsed.dxt_version).toBe("0.1");
      expect(parsed.name).toBe("test-extension");
      expect(parsed.user_config).toBeDefined();
      expect(parsed.user_config!.api_key).toBeDefined();
      expect(parsed.user_config!.api_key.type).toBe("string");
      expect(parsed.user_config!.api_key.required).toBe(true);
    });

    it("should support legacy manifest format", async () => {
      // Create a legacy manifest file
      const manifestDir = join(tempDir, "legacy-manifest");
      await mkdir(manifestDir, { recursive: true });

      const legacyManifest = {
        name: "legacy-extension",
        version: "1.0.0",
        main: "server.js",
      };

      await writeFile(
        join(manifestDir, "manifest.json"),
        JSON.stringify(legacyManifest, null, 2)
      );

      // Parse the manifest
      const parsed = await parseManifest(manifestDir);

      expect(parsed.dxt_version).toBe("0.1");
      expect(parsed.name).toBe("legacy-extension");
      expect(parsed.main).toBe("server.js");
      expect(parsed.server).toBeDefined();
      expect(parsed.server.type).toBe("node");
      expect(parsed.server.mcp_config.command).toBe("node");
    });
  });

  describe("connection factory integration", () => {
    it("should have extension-aware connection factory", () => {
      const factory = new ExtensionAwareConnectionFactory();

      expect(factory.createConnection).toBeDefined();
      expect(factory.getAllServerConfigs).toBeDefined();
      expect(factory.isServerAvailable).toBeDefined();
      expect(factory.listAvailableServers).toBeDefined();
      expect(factory.getServerInfo).toBeDefined();
      expect(factory.refresh).toBeDefined();
      expect(factory.setExtensionManager).toBeDefined();
    });
  });

  describe("basic functionality", () => {
    it("should create extension manager instance", () => {
      const manager = new ExtensionManager(configPath, tempDir);
      expect(manager).toBeDefined();
    });

    it("should get empty configs initially", () => {
      const manager = new ExtensionManager(configPath, tempDir);
      const configs = manager.getRuntimeConfigs();
      expect(configs).toEqual([]);
    });

    it("should get empty enabled configs initially", () => {
      const manager = new ExtensionManager(configPath, tempDir);
      const configs = manager.getEnabledConfigs();
      expect(configs).toEqual([]);
    });

    it("should return undefined for non-existent extension", () => {
      const manager = new ExtensionManager(configPath, tempDir);
      const config = manager.getExtensionConfig("non-existent");
      expect(config).toBeUndefined();
    });

    it("should list empty extensions initially", () => {
      const manager = new ExtensionManager(configPath, tempDir);
      const extensions = manager.listExtensions();
      expect(extensions).toEqual([]);
    });

    it("should get extensions directory", () => {
      const manager = new ExtensionManager(configPath, tempDir);
      const dir = manager.getExtensionsDirectory();
      expect(dir).toContain("extensions");
    });

    it("should check auto-discovery setting", () => {
      const manager = new ExtensionManager(configPath, tempDir);
      const isEnabled = manager.isAutoDiscoveryEnabled();
      expect(typeof isEnabled).toBe("boolean");
    });

    it("should get empty server configs initially", () => {
      const manager = new ExtensionManager(configPath, tempDir);
      const configs = manager.getEnabledExtensionsAsServerConfigs();
      expect(configs).toEqual({});
    });
  });

  describe("error handling", () => {
    it("should handle invalid configurations gracefully", () => {
      const validator = new ExtensionValidationService();

      const invalidManifest = {
        dxt_version: "0.1",
        name: "test",
        version: "1.0.0",
        server: {
          type: "node" as const,
          mcp_config: {
            command: "node",
            args: ["server.js"],
          },
        },
        user_config: {
          timeout: {
            type: "number" as const,
            min: 1,
            max: 100,
            required: true,
          },
        },
      };

      const invalidUserSettings = {
        isEnabled: true,
        userConfig: {
          timeout: 200, // Above max
        },
      };

      const result = validator.validateExtensionConfig(
        invalidManifest,
        invalidUserSettings
      );
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it("should throw error for non-existent extension in createServerConfig", () => {
      const manager = new ExtensionManager(configPath, tempDir);

      expect(() => {
        manager.createServerConfigForExtension("non-existent");
      }).toThrow("Extension 'non-existent' not found or not enabled");
    });
  });
});
