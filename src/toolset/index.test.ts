/**
 * Tests for ToolsetManager
 */

import { promises as fs } from "fs";
import path from "path";
import os from "os";
import { ToolsetManager } from "./index";
import { ToolsetConfig } from "./types";
import { DiscoveredTool } from "../discovery/types";

describe("ToolsetManager", () => {
  let manager: ToolsetManager;
  let tempDir: string;

  const mockTools: DiscoveredTool[] = [
    {
      name: "status",
      serverName: "git",
      namespacedName: "git.status",
      schema: { type: "object" } as const,
      discoveredAt: new Date(),
      lastUpdated: new Date(),
      serverStatus: "connected",
      structureHash: "hash1",
      fullHash: "full1",
    },
    {
      name: "ps",
      serverName: "docker",
      namespacedName: "docker.ps",
      schema: { type: "object" } as const,
      discoveredAt: new Date(),
      lastUpdated: new Date(),
      serverStatus: "connected",
      structureHash: "hash2",
      fullHash: "full2",
    },
  ];

  beforeEach(async () => {
    manager = new ToolsetManager();
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "toolset-manager-test-"));
  });

  afterEach(async () => {
    await fs.rmdir(tempDir, { recursive: true });
  });

  describe("loadConfig", () => {
    it("should load valid configuration", async () => {
      const config: ToolsetConfig = {
        name: "Test Config",
        servers: [{ serverName: "git", tools: { includeAll: true } }],
      };

      const filePath = path.join(tempDir, "config.json");
      await fs.writeFile(filePath, JSON.stringify(config));

      const result = await manager.loadConfig(filePath);

      expect(result.success).toBe(true);
      expect(manager.isConfigLoaded()).toBe(true);
      expect(manager.getConfig()?.name).toBe("Test Config");
      expect(manager.getConfigPath()).toBe(filePath);
    });

    it("should reject invalid configuration", async () => {
      const invalidConfig = {
        name: "Test",
        servers: [{ tools: { includeAll: true } }],
      }; // Server without name
      const filePath = path.join(tempDir, "invalid.json");
      await fs.writeFile(filePath, JSON.stringify(invalidConfig));

      const result = await manager.loadConfig(filePath);

      expect(result.success).toBe(false);
      expect(manager.isConfigLoaded()).toBe(false);
      expect(result.validation.valid).toBe(false);
    });

    it("should handle file read errors", async () => {
      const result = await manager.loadConfig("/nonexistent/path.json");

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe("saveConfig", () => {
    it("should save loaded configuration", async () => {
      const config: ToolsetConfig = {
        name: "Test Config",
        servers: [{ serverName: "git", tools: { includeAll: true } }],
      };

      manager.setConfig(config);

      const filePath = path.join(tempDir, "saved.json");
      const result = await manager.saveConfig(filePath);

      expect(result.success).toBe(true);
      expect(manager.getConfigPath()).toBe(filePath);

      // Verify file was created
      const fileExists = await fs
        .access(filePath)
        .then(() => true)
        .catch(() => false);
      expect(fileExists).toBe(true);
    });

    it("should save to previously loaded path", async () => {
      const config: ToolsetConfig = {
        name: "Test Config",
        servers: [{ serverName: "git", tools: { includeAll: true } }],
      };

      const filePath = path.join(tempDir, "config.json");
      await fs.writeFile(filePath, JSON.stringify(config));

      await manager.loadConfig(filePath);
      const result = await manager.saveConfig();

      expect(result.success).toBe(true);
    });

    it("should fail when no config is loaded", async () => {
      const result = await manager.saveConfig("/some/path.json");

      expect(result.success).toBe(false);
      expect(result.error).toBe("No configuration loaded");
    });

    it("should fail when no path is specified", async () => {
      const config: ToolsetConfig = {
        name: "Test",
        servers: [],
      };

      manager.setConfig(config);
      const result = await manager.saveConfig();

      expect(result.success).toBe(false);
      expect(result.error).toBe("No file path specified");
    });
  });

  describe("generateDefaultConfig", () => {
    it("should generate and set default configuration", () => {
      const config = manager.generateDefaultConfig(mockTools);

      expect(config.name).toBe("Auto-generated Toolset");
      expect(config.servers).toHaveLength(2);
      expect(manager.isConfigLoaded()).toBe(true);
      expect(manager.getConfig()).toBe(config);
    });

    it("should accept custom options", () => {
      const config = manager.generateDefaultConfig(mockTools, {
        name: "Custom Name",
        description: "Custom description",
      });

      expect(config.name).toBe("Custom Name");
      expect(config.description).toBe("Custom description");
    });
  });

  describe("setConfig", () => {
    it("should set valid configuration", () => {
      const config: ToolsetConfig = {
        name: "Test Config",
        servers: [{ serverName: "git", tools: { includeAll: true } }],
      };

      const validation = manager.setConfig(config);

      expect(validation.valid).toBe(true);
      expect(manager.isConfigLoaded()).toBe(true);
      expect(manager.getConfig()).toBe(config);
    });

    it("should reject invalid configuration", () => {
      const config = { name: "" } as ToolsetConfig;

      const validation = manager.setConfig(config);

      expect(validation.valid).toBe(false);
      expect(manager.isConfigLoaded()).toBe(false);
    });
  });

  describe("applyConfig", () => {
    it("should apply configuration to tools", async () => {
      const config: ToolsetConfig = {
        name: "Test Config",
        servers: [
          { serverName: "git", tools: { includeAll: true }, enabled: true },
        ],
      };

      manager.setConfig(config);
      const result = await manager.applyConfig(mockTools);

      expect(result.success).toBe(true);
      expect(result.tools).toHaveLength(1);
      expect(result.tools[0].serverName).toBe("git");
    });

    it("should fail when no config is loaded", async () => {
      const result = await manager.applyConfig(mockTools);

      expect(result.success).toBe(false);
      expect(result.errors).toContain("No configuration loaded");
    });
  });

  describe("validateConfig", () => {
    it("should validate loaded configuration", () => {
      const config: ToolsetConfig = {
        name: "Test Config",
        servers: [{ serverName: "git", tools: { includeAll: true } }],
      };

      manager.setConfig(config);
      const validation = manager.validateConfig();

      expect(validation.valid).toBe(true);
    });

    it("should fail when no config is loaded", () => {
      const validation = manager.validateConfig();

      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain("No configuration loaded");
    });
  });

  describe("utility methods", () => {
    it("should track configuration state", () => {
      expect(manager.isConfigLoaded()).toBe(false);
      expect(manager.getConfig()).toBeUndefined();
      expect(manager.getConfigPath()).toBeUndefined();

      const config: ToolsetConfig = {
        name: "Test",
        servers: [{ serverName: "git", tools: { includeAll: true } }],
      };

      manager.setConfig(config);

      expect(manager.isConfigLoaded()).toBe(true);
      expect(manager.getConfig()).toBe(config);
    });

    it("should clear configuration", () => {
      const config: ToolsetConfig = {
        name: "Test",
        servers: [{ serverName: "git", tools: { includeAll: true } }],
      };

      manager.setConfig(config);
      expect(manager.isConfigLoaded()).toBe(true);

      manager.clearConfig();

      expect(manager.isConfigLoaded()).toBe(false);
      expect(manager.getConfig()).toBeUndefined();
      expect(manager.getConfigPath()).toBeUndefined();
    });
  });

  describe("integration scenarios", () => {
    it("should handle complete workflow", async () => {
      // Generate default config
      manager.generateDefaultConfig(mockTools, {
        name: "My Toolset",
      });

      expect(manager.isConfigLoaded()).toBe(true);

      // Save config
      const filePath = path.join(tempDir, "workflow.json");
      const saveResult = await manager.saveConfig(filePath);
      expect(saveResult.success).toBe(true);

      // Clear and reload
      manager.clearConfig();
      expect(manager.isConfigLoaded()).toBe(false);

      const loadResult = await manager.loadConfig(filePath);
      expect(loadResult.success).toBe(true);
      expect(manager.getConfig()?.name).toBe("My Toolset");

      // Apply to tools
      const applyResult = await manager.applyConfig(mockTools);
      expect(applyResult.success).toBe(true);
      expect(applyResult.tools.length).toBeGreaterThan(0);
    });

    it("should validate after loading from file", async () => {
      const config: ToolsetConfig = {
        name: "Test Config",
        servers: [{ serverName: "git", tools: { includeAll: true } }],
      };

      const filePath = path.join(tempDir, "validate.json");
      await fs.writeFile(filePath, JSON.stringify(config));

      await manager.loadConfig(filePath);
      const validation = manager.validateConfig();

      expect(validation.valid).toBe(true);
    });
  });
});
