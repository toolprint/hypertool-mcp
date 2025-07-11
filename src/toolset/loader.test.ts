/**
 * Tests for toolset configuration loader
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
} from "./loader";
import { ToolsetConfig } from "./types";

describe("ToolsetLoader", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "toolset-test-"));
  });

  afterEach(async () => {
    await fs.rmdir(tempDir, { recursive: true });
  });

  describe("loadToolsetConfig", () => {
    it("should load valid configuration", async () => {
      const config: ToolsetConfig = {
        name: "Test Config",
        servers: [{ serverName: "git", tools: { includeAll: true } }],
      };

      const filePath = path.join(tempDir, "config.json");
      await fs.writeFile(filePath, JSON.stringify(config));

      const result = await loadToolsetConfig(filePath);
      expect(result.config).toBeDefined();
      expect(result.config!.name).toBe("Test Config");
      expect(result.validation.valid).toBe(true);
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
        name: "Test",
        servers: [
          { serverName: "git" }, // Missing tools
        ],
      };

      const filePath = path.join(tempDir, "config.json");
      await fs.writeFile(filePath, JSON.stringify(rawConfig));

      const result = await loadToolsetConfig(filePath);
      expect(result.config).toBeDefined();
      expect(result.config!.servers[0].tools).toEqual({ includeAll: true });
      expect(result.config!.servers[0].enabled).toBe(true);
    });

    it("should apply custom validation", async () => {
      const config: ToolsetConfig = {
        name: "Test",
        servers: [{ serverName: "git", tools: { includeAll: true } }],
      };

      const filePath = path.join(tempDir, "config.json");
      await fs.writeFile(filePath, JSON.stringify(config));

      const customValidation = () => ({
        valid: false,
        errors: ["Custom error"],
        warnings: ["Custom warning"],
      });

      const result = await loadToolsetConfig(filePath, { customValidation });
      expect(result.validation.valid).toBe(false);
      expect(result.validation.errors).toContain("Custom error");
      expect(result.validation.warnings).toContain("Custom warning");
    });
  });

  describe("saveToolsetConfig", () => {
    it("should save valid configuration", async () => {
      const config: ToolsetConfig = {
        name: "Test Config",
        servers: [{ serverName: "git", tools: { includeAll: true } }],
      };

      const filePath = path.join(tempDir, "config.json");
      const result = await saveToolsetConfig(config, filePath);

      expect(result.success).toBe(true);
      expect(await fileExists(filePath)).toBe(true);

      const saved = JSON.parse(await fs.readFile(filePath, "utf-8"));
      expect(saved.name).toBe("Test Config");
      expect(saved.lastModified).toBeDefined();
    });

    it("should create directory if requested", async () => {
      const config: ToolsetConfig = {
        name: "Test",
        servers: [],
      };

      const subDir = path.join(tempDir, "subdir");
      const filePath = path.join(subDir, "config.json");

      const result = await saveToolsetConfig(config, filePath, {
        createDir: true,
      });
      expect(result.success).toBe(true);
      expect(await fileExists(filePath)).toBe(true);
    });

    it("should format JSON prettily if requested", async () => {
      const config: ToolsetConfig = {
        name: "Test",
        servers: [],
      };

      const filePath = path.join(tempDir, "config.json");
      await saveToolsetConfig(config, filePath, { pretty: true });

      const content = await fs.readFile(filePath, "utf-8");
      expect(content).toContain("\n");
      expect(content).toContain("  ");
    });

    it("should reject invalid configuration", async () => {
      const config = {} as ToolsetConfig;
      const filePath = path.join(tempDir, "config.json");

      const result = await saveToolsetConfig(config, filePath);
      expect(result.success).toBe(false);
      expect(result.error).toContain("Configuration validation failed");
    });
  });

  describe("loadToolsetConfigs", () => {
    it("should load multiple configurations", async () => {
      const config1: ToolsetConfig = {
        name: "Config 1",
        servers: [{ serverName: "git", tools: { includeAll: true } }],
      };
      const config2: ToolsetConfig = {
        name: "Config 2",
        servers: [{ serverName: "docker", tools: { includeAll: true } }],
      };

      await fs.writeFile(
        path.join(tempDir, "config1.json"),
        JSON.stringify(config1)
      );
      await fs.writeFile(
        path.join(tempDir, "config2.json"),
        JSON.stringify(config2)
      );
      await fs.writeFile(path.join(tempDir, "readme.txt"), "not a json file");

      const result = await loadToolsetConfigs(tempDir);
      expect(result.configs).toHaveLength(2);
      expect(result.summary.total).toBe(2);
      expect(result.summary.valid).toBe(2);
      expect(result.summary.invalid).toBe(0);
    });

    it("should handle invalid configurations", async () => {
      const validConfig: ToolsetConfig = {
        name: "Valid",
        servers: [{ serverName: "git", tools: { includeAll: true } }],
      };
      const invalidConfig = {
        name: "Test",
        servers: [{ tools: { includeAll: true } }],
      }; // Server without name

      await fs.writeFile(
        path.join(tempDir, "valid.json"),
        JSON.stringify(validConfig)
      );
      await fs.writeFile(
        path.join(tempDir, "invalid.json"),
        JSON.stringify(invalidConfig)
      );

      const result = await loadToolsetConfigs(tempDir);
      expect(result.summary.total).toBe(2);
      expect(result.summary.valid).toBe(1);
      expect(result.summary.invalid).toBe(1);
    });
  });

  describe("fileExists", () => {
    it("should return true for existing file", async () => {
      const filePath = path.join(tempDir, "test.txt");
      await fs.writeFile(filePath, "test");

      expect(await fileExists(filePath)).toBe(true);
    });

    it("should return false for non-existing file", async () => {
      const filePath = path.join(tempDir, "nonexistent.txt");
      expect(await fileExists(filePath)).toBe(false);
    });
  });

  describe("createExampleConfig", () => {
    it("should create valid example configuration", () => {
      const config = createExampleConfig();

      expect(config.name).toBe("Example Toolset");
      expect(config.servers).toHaveLength(3);
      expect(config.options).toBeDefined();

      // Check that it has diverse patterns
      const gitServer = config.servers.find((s) => s.serverName === "git");
      const dockerServer = config.servers.find(
        (s) => s.serverName === "docker"
      );
      const contextServer = config.servers.find(
        (s) => s.serverName === "context7"
      );

      expect(gitServer?.tools.includeAll).toBe(true);
      expect(dockerServer?.tools.include).toBeDefined();
      expect(contextServer?.tools.includePattern).toBeDefined();
    });
  });
});
