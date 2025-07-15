/**
 * Tests for simplified toolset configuration loader
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from "fs";
import path from "path";
import os from "os";
import {
  loadToolsetConfig,
  saveToolsetConfig,
} from "./loader.js";
import { ToolsetConfig } from "./types.js";

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

    it("should filter out invalid tool references", async () => {
      const configWithInvalidTools = {
        name: "mixed-tools",
        tools: [
          { namespacedName: "git.status" }, // Valid
          { refId: "hash123456789" }, // Valid
          { invalidField: "value" }, // Invalid - no namespacedName or refId
          { namespacedName: "" }, // Invalid - empty namespacedName
          { refId: "" }, // Invalid - empty refId
        ],
      };

      const filePath = path.join(tempDir, "mixed.json");
      await fs.writeFile(filePath, JSON.stringify(configWithInvalidTools));

      const result = await loadToolsetConfig(filePath);
      expect(result.config).toBeDefined();
      expect(result.config!.tools).toHaveLength(2); // Only 2 valid tools remain
    });

    it("should apply custom validation", async () => {
      const config: ToolsetConfig = {
        name: "test-config",
        tools: [{ namespacedName: "git.status" }],
        version: "1.0.0",
        createdAt: new Date(),
      };

      const filePath = path.join(tempDir, "config.json");
      await fs.writeFile(filePath, JSON.stringify(config));

      const customValidation = (config: ToolsetConfig) => ({
        valid: false,
        errors: ["Custom validation failed"],
        warnings: ["Custom warning"],
      });

      const result = await loadToolsetConfig(filePath, { customValidation });
      expect(result.validation.valid).toBe(false);
      expect(result.validation.errors).toContain("Custom validation failed");
      expect(result.validation.warnings).toContain("Custom warning");
    });
  });

  describe("saveToolsetConfig", () => {
    it("should save valid configuration", async () => {
      const config: ToolsetConfig = {
        name: "save-test",
        description: "Configuration for save test",
        version: "2.0.0",
        createdAt: new Date(),
        tools: [
          { namespacedName: "git.status", refId: "hash123456789" },
        ],
      };

      const filePath = path.join(tempDir, "saved.json");
      const result = await saveToolsetConfig(config, filePath);

      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();

      // Verify file was created and can be read
      const fileContent = await fs.readFile(filePath, "utf-8");
      const parsedConfig = JSON.parse(fileContent);
      expect(parsedConfig.name).toBe("save-test");
      expect(parsedConfig.tools).toHaveLength(1);
    });

    it("should save with pretty formatting", async () => {
      const config: ToolsetConfig = {
        name: "pretty-test",
        tools: [{ namespacedName: "git.status" }],
        version: "1.0.0",
        createdAt: new Date(),
      };

      const filePath = path.join(tempDir, "pretty.json");
      const result = await saveToolsetConfig(config, filePath, { pretty: true });

      expect(result.success).toBe(true);

      const fileContent = await fs.readFile(filePath, "utf-8");
      expect(fileContent).toContain("\n  "); // Should contain indentation
    });

    it("should create directory when requested", async () => {
      const config: ToolsetConfig = {
        name: "mkdir-test",
        tools: [{ namespacedName: "git.status" }],
        version: "1.0.0",
        createdAt: new Date(),
      };

      const subDir = path.join(tempDir, "nested", "deep");
      const filePath = path.join(subDir, "config.json");

      const result = await saveToolsetConfig(config, filePath, { createDir: true });

      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();

      // Verify file exists in created directory
      const exists = await fs.access(filePath).then(() => true).catch(() => false);
      expect(exists).toBe(true);
    });

    it("should reject invalid configuration", async () => {
      const invalidConfig = {
        // Missing name and tools
        description: "Invalid config",
      } as ToolsetConfig;

      const filePath = path.join(tempDir, "invalid.json");
      const result = await saveToolsetConfig(invalidConfig, filePath);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Configuration validation failed");
    });

    it("should add lastModified timestamp", async () => {
      const config: ToolsetConfig = {
        name: "timestamp-test",
        tools: [{ namespacedName: "git.status" }],
        version: "1.0.0",
        createdAt: new Date(),
      };

      const filePath = path.join(tempDir, "timestamp.json");
      await saveToolsetConfig(config, filePath);

      const fileContent = await fs.readFile(filePath, "utf-8");
      const parsedConfig = JSON.parse(fileContent);
      expect(parsedConfig.lastModified).toBeDefined();
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