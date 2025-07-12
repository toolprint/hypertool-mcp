/**
 * Tests for simplified toolset configuration loader
 */

import { promises as fs } from "fs";
import path from "path";
import os from "os";
import {
  loadToolsetConfig,
  saveToolsetConfig,
  loadToolsetConfigs,
  fileExists,
  createExampleConfig,
  getDefaultConfigPath,
} from "./loader";
import { ToolsetConfig } from "./types";

describe("ToolsetLoader", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "toolset-test-"));
  });

  afterEach(async () => {
    await fs.rmdir(tempDir, { recursive: true }).catch(() => {
      // Ignore cleanup errors in tests
    });
  });

  describe("loadToolsetConfig", () => {
    it("should load valid simplified configuration", async () => {
      const config: ToolsetConfig = {
        name: "test-config",
        description: "Test configuration",
        version: "1.0.0",
        createdAt: new Date(),
        tools: [
          { namespacedName: "git.status", refId: "hash123456789" },
          { namespacedName: "docker.ps", refId: "hash987654321" },
        ],
      };

      const filePath = path.join(tempDir, "config.json");
      await fs.writeFile(filePath, JSON.stringify(config, null, 2));

      const result = await loadToolsetConfig(filePath);
      expect(result.config).toBeDefined();
      expect(result.config!.name).toBe("test-config");
      expect(result.config!.tools).toHaveLength(2);
      expect(result.validation.valid).toBe(true);
    });

    it("should handle configuration without tools array", async () => {
      const configWithoutTools = {
        name: "config-without-tools",
        description: "A config that lacks tools array",
      };

      const filePath = path.join(tempDir, "no-tools.json");
      await fs.writeFile(filePath, JSON.stringify(configWithoutTools));

      const result = await loadToolsetConfig(filePath);
      expect(result.config).toBeDefined();
      expect(result.config!.name).toBe("config-without-tools");
      expect(result.config!.tools).toEqual([]); // Default empty array
    });

    it("should handle invalid JSON", async () => {
      const filePath = path.join(tempDir, "invalid.json");
      await fs.writeFile(filePath, "{ invalid json");

      const result = await loadToolsetConfig(filePath);
      expect(result.config).toBeUndefined();
      expect(result.validation.valid).toBe(false);
      expect(result.error).toContain("Failed to parse JSON");
    });

    it("should handle missing file", async () => {
      const filePath = path.join(tempDir, "nonexistent.json");

      const result = await loadToolsetConfig(filePath);
      expect(result.config).toBeUndefined();
      expect(result.validation.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it("should normalize configuration", async () => {
      const rawConfig = {
        name: "test-config",
        tools: [
          { namespacedName: "git.status" }, // Missing refId - still valid
        ],
      };

      const filePath = path.join(tempDir, "config.json");
      await fs.writeFile(filePath, JSON.stringify(rawConfig));

      const result = await loadToolsetConfig(filePath);
      expect(result.config).toBeDefined();
      expect(result.config!.tools).toHaveLength(1);
      expect(result.config!.tools[0].namespacedName).toBe("git.status");
      expect(result.config!.version).toBe("1.0.0"); // Default version added
      expect(result.config!.createdAt).toBeInstanceOf(Date); // Default date added
    });

    it("should apply custom validation", async () => {
      const config: ToolsetConfig = {
        name: "test-config",
        tools: [
          { namespacedName: "git.status", refId: "hash123456789" },
        ],
        version: "1.0.0",
        createdAt: new Date(),
      };

      const filePath = path.join(tempDir, "config.json");
      await fs.writeFile(filePath, JSON.stringify(config));

      const customValidation = () => ({
        valid: false,
        errors: ["Custom error"],
        warnings: ["Custom warning"],
        suggestions: [],
      });

      const result = await loadToolsetConfig(filePath, { customValidation });
      expect(result.validation.valid).toBe(false);
      expect(result.validation.errors).toContain("Custom error");
      expect(result.validation.warnings).toContain("Custom warning");
    });

    it("should require at least one tool in simplified format", async () => {
      const config = {
        name: "empty-config",
        tools: [], // Empty tools array
      };

      const filePath = path.join(tempDir, "empty.json");
      await fs.writeFile(filePath, JSON.stringify(config));

      const result = await loadToolsetConfig(filePath);
      expect(result.validation.valid).toBe(false);
      expect(result.validation.errors).toContain("Configuration must specify at least one tool");
    });
  });

  describe("saveToolsetConfig", () => {
    it("should save configuration to file", async () => {
      const config: ToolsetConfig = {
        name: "test-save",
        tools: [
          { namespacedName: "git.status", refId: "hash123456789" },
        ],
        version: "1.0.0",
        createdAt: new Date(),
      };

      const filePath = path.join(tempDir, "save-test.json");
      const result = await saveToolsetConfig(config, filePath);

      expect(result.success).toBe(true);
      expect(await fileExists(filePath)).toBe(true);

      const savedContent = await fs.readFile(filePath, "utf-8");
      const savedConfig = JSON.parse(savedContent);
      expect(savedConfig.name).toBe("test-save");
      expect(savedConfig.tools).toHaveLength(1);
    });

    it("should create directory if requested", async () => {
      const config: ToolsetConfig = {
        name: "test-dir",
        tools: [{ namespacedName: "git.status" }],
        version: "1.0.0",
        createdAt: new Date(),
      };

      const nestedDir = path.join(tempDir, "nested", "path");
      const filePath = path.join(nestedDir, "config.json");
      
      const result = await saveToolsetConfig(config, filePath, { createDir: true });

      expect(result.success).toBe(true);
      expect(await fileExists(filePath)).toBe(true);
    });

    it("should format JSON prettily when requested", async () => {
      const config: ToolsetConfig = {
        name: "test-pretty",
        tools: [{ namespacedName: "git.status" }],
        version: "1.0.0", 
        createdAt: new Date(),
      };

      const filePath = path.join(tempDir, "pretty.json");
      const result = await saveToolsetConfig(config, filePath, { pretty: true });

      expect(result.success).toBe(true);

      const savedContent = await fs.readFile(filePath, "utf-8");
      expect(savedContent).toContain("  "); // Should contain indentation
      expect(savedContent).toContain("\n"); // Should contain newlines
    });

    it("should handle save errors", async () => {
      const config: ToolsetConfig = {
        name: "test-error",
        tools: [{ namespacedName: "git.status" }],
        version: "1.0.0",
        createdAt: new Date(),
      };

      // Try to save to invalid path
      const invalidPath = path.join("/nonexistent/path", "config.json");
      const result = await saveToolsetConfig(config, invalidPath);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe("loadToolsetConfigs", () => {
    it("should load multiple configurations from directory", async () => {
      const config1: ToolsetConfig = {
        name: "config-1",
        tools: [{ namespacedName: "git.status" }],
        version: "1.0.0",
        createdAt: new Date(),
      };

      const config2: ToolsetConfig = {
        name: "config-2", 
        tools: [{ namespacedName: "docker.ps" }],
        version: "1.0.0",
        createdAt: new Date(),
      };

      await fs.writeFile(
        path.join(tempDir, "config1.json"),
        JSON.stringify(config1)
      );
      await fs.writeFile(
        path.join(tempDir, "config2.json"),
        JSON.stringify(config2)
      );
      await fs.writeFile(
        path.join(tempDir, "not-json.txt"),
        "not a json file"
      );

      const results = await loadToolsetConfigs(tempDir);

      expect(results.configs).toHaveLength(2);
      expect(results.configs.map(r => r.config?.name)).toEqual(["config-1", "config-2"]);
      expect(results.configs.every(r => r.validation.valid)).toBe(true);
    });

    it("should handle empty directory", async () => {
      const results = await loadToolsetConfigs(tempDir);
      expect(results.configs).toHaveLength(0);
    });

    it("should handle nonexistent directory", async () => {
      const results = await loadToolsetConfigs(path.join(tempDir, "nonexistent"));
      expect(results.configs).toHaveLength(0);
    });
  });

  describe("fileExists", () => {
    it("should return true for existing file", async () => {
      const filePath = path.join(tempDir, "test.txt");
      await fs.writeFile(filePath, "test content");

      expect(await fileExists(filePath)).toBe(true);
    });

    it("should return false for non-existing file", async () => {
      const filePath = path.join(tempDir, "nonexistent.txt");
      expect(await fileExists(filePath)).toBe(false);
    });
  });

  describe("createExampleConfig", () => {
    it("should create example configuration", () => {
      const config = createExampleConfig();

      expect(config.name).toBeDefined();
      expect(config.description).toBeDefined();
      expect(config.tools).toBeDefined();
      expect(Array.isArray(config.tools)).toBe(true);
      expect(config.tools.length).toBeGreaterThan(0);
      expect(config.version).toBe("1.0.0");
      expect(config.createdAt).toBeInstanceOf(Date);
    });

    it("should create valid example configuration", () => {
      const config = createExampleConfig();
      
      // All tools should have namespacedName and refId
      config.tools.forEach((tool) => {
        expect(tool.namespacedName).toBeDefined();
        expect(tool.refId).toBeDefined();
        expect(typeof tool.namespacedName).toBe("string");
        expect(typeof tool.refId).toBe("string");
      });
    });
  });

  describe("getDefaultConfigPath", () => {
    it("should return default config path", () => {
      const defaultPath = getDefaultConfigPath();
      expect(defaultPath).toContain("toolset.json");
      expect(defaultPath).toContain(".meta-mcp");
      expect(typeof defaultPath).toBe("string");
    });

    it("should accept custom directory", () => {
      const customDir = "/custom/dir";
      const defaultPath = getDefaultConfigPath(customDir);
      expect(defaultPath).toContain(customDir);
      expect(defaultPath).toContain("toolset.json");
    });
  });

  describe("edge cases", () => {
    it("should handle config with only refId (no namespacedName)", async () => {
      const config = {
        name: "refid-only",
        tools: [
          { refId: "hash123456789" }, // Only refId, no namespacedName
        ],
      };

      const filePath = path.join(tempDir, "refid-only.json");
      await fs.writeFile(filePath, JSON.stringify(config));

      const result = await loadToolsetConfig(filePath);
      expect(result.config).toBeDefined();
      expect(result.validation.valid).toBe(true);
      expect(result.config!.tools[0].refId).toBe("hash123456789");
    });

    it("should handle config with special characters in tool names", async () => {
      const config = {
        name: "special-chars",
        tools: [
          { namespacedName: "server-1.tool_with-special.chars", refId: "hash123456789" }, // Valid refId length
        ],
      };

      const filePath = path.join(tempDir, "special.json");
      await fs.writeFile(filePath, JSON.stringify(config));

      const result = await loadToolsetConfig(filePath);
      expect(result.config).toBeDefined();
      expect(result.validation.valid).toBe(true);
    });
  });
});