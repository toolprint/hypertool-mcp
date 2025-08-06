import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import * as path from "path";
import * as fs from "fs/promises";
import {
  discoverMcpConfigFile,
  loadMcpConfigFile,
} from "./mcpConfigFileLoader.js";
import { loadUserPreferences, saveUserPreferences } from "./preferenceStore.js";
import { MCPConfigParser } from "./mcpConfigParser.js";

// Mock modules
vi.mock("fs/promises");
vi.mock("./preferenceStore.js");
vi.mock("./mcpConfigParser.js");

const mockFs = fs as vi.Mocked<typeof fs>;
const mockLoadUserPreferences = vi.mocked(loadUserPreferences);
const mockSaveUserPreferences = vi.mocked(saveUserPreferences);
const mockMCPConfigParser = vi.mocked(MCPConfigParser);

describe("mcpConfigFileLoader", () => {
  let mockUserPreferences: any;

  beforeEach(() => {
    mockUserPreferences = { mcpConfigPath: undefined };

    vi.clearAllMocks();

    // Default mock implementations
    mockLoadUserPreferences.mockResolvedValue(mockUserPreferences);
    mockSaveUserPreferences.mockResolvedValue(undefined);

    // Mock MCPConfigParser
    const mockParserInstance = {
      parseFile: vi.fn(),
    };
    mockMCPConfigParser.mockImplementation(() => mockParserInstance as any);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("discoverMcpConfigFile - CLI Path Resolution", () => {
    it("should resolve relative CLI paths to absolute paths", async () => {
      const relativePath = "./test-config.json";
      const expectedAbsolutePath = path.resolve(relativePath);

      // Mock file exists at resolved path
      mockFs.access.mockImplementation((path) => {
        if (path === expectedAbsolutePath) {
          return Promise.resolve();
        }
        return Promise.reject(new Error("ENOENT"));
      });

      const result = await discoverMcpConfigFile(relativePath, true);

      expect(result.configPath).toBe(expectedAbsolutePath);
      expect(result.source).toBe("cli");
      expect(result.errorMessage).toBeUndefined();
      expect(mockFs.access).toHaveBeenCalledWith(expectedAbsolutePath);
    });

    it("should handle relative paths with parent directories", async () => {
      const relativePath = "../configs/mcp.json";
      const expectedAbsolutePath = path.resolve(relativePath);

      mockFs.access.mockImplementation((path) => {
        if (path === expectedAbsolutePath) {
          return Promise.resolve();
        }
        return Promise.reject(new Error("ENOENT"));
      });

      const result = await discoverMcpConfigFile(relativePath, true);

      expect(result.configPath).toBe(expectedAbsolutePath);
      expect(result.source).toBe("cli");
      expect(result.errorMessage).toBeUndefined();
    });

    it("should preserve absolute paths unchanged", async () => {
      const absolutePath = "/absolute/path/to/config.json";

      mockFs.access.mockImplementation((path) => {
        if (path === absolutePath) {
          return Promise.resolve();
        }
        return Promise.reject(new Error("ENOENT"));
      });

      const result = await discoverMcpConfigFile(absolutePath, true);

      expect(result.configPath).toBe(absolutePath);
      expect(result.source).toBe("cli");
      expect(result.errorMessage).toBeUndefined();
    });

    it("should provide meaningful error messages for non-existent relative paths", async () => {
      const relativePath = "./non-existent.json";
      const expectedAbsolutePath = path.resolve(relativePath);

      mockFs.access.mockRejectedValue(new Error("ENOENT"));

      const result = await discoverMcpConfigFile(relativePath);

      expect(result.configPath).toBeNull();
      expect(result.source).toBe("none");
      expect(result.errorMessage).toContain(relativePath);
      expect(result.errorMessage).toContain(expectedAbsolutePath);
    });

    it("should resolve paths based on current working directory at call time", async () => {
      const relativePath = "./config.json";
      const expectedAbsolutePath = path.resolve(relativePath);

      mockFs.access.mockImplementation((path) => {
        if (path === expectedAbsolutePath) {
          return Promise.resolve();
        }
        return Promise.reject(new Error("ENOENT"));
      });

      const result = await discoverMcpConfigFile(relativePath, true);

      expect(result.configPath).toBe(expectedAbsolutePath);
      expect(result.source).toBe("cli");
      expect(result.errorMessage).toBeUndefined();
      expect(mockFs.access).toHaveBeenCalledWith(expectedAbsolutePath);
    });

    it("should store resolved absolute path in user preferences", async () => {
      const relativePath = "./config.json";
      const expectedAbsolutePath = path.resolve(relativePath);

      mockFs.access.mockImplementation((path) => {
        if (path === expectedAbsolutePath) {
          return Promise.resolve();
        }
        return Promise.reject(new Error("ENOENT"));
      });

      await discoverMcpConfigFile(relativePath, true);

      expect(mockLoadUserPreferences).toHaveBeenCalled();
      expect(mockSaveUserPreferences).toHaveBeenCalledWith(
        expect.objectContaining({
          mcpConfigPath: expectedAbsolutePath,
        })
      );
    });

    it("should not update preferences when updatePreference is false", async () => {
      const relativePath = "./config.json";
      const expectedAbsolutePath = path.resolve(relativePath);

      mockFs.access.mockImplementation((path) => {
        if (path === expectedAbsolutePath) {
          return Promise.resolve();
        }
        return Promise.reject(new Error("ENOENT"));
      });

      await discoverMcpConfigFile(relativePath, false);

      expect(mockLoadUserPreferences).not.toHaveBeenCalled();
      expect(mockSaveUserPreferences).not.toHaveBeenCalled();
    });
  });

  describe("loadMcpConfigFile", () => {
    it("should load config file successfully", async () => {
      const configPath = "/path/to/config.json";
      const mockConfig = {
        mcpServers: { test: { type: "stdio", command: "test" } },
      };

      const mockParserInstance = new MCPConfigParser();
      vi.mocked(mockParserInstance.parseFile).mockResolvedValue({
        success: true,
        config: mockConfig,
      });

      const result = await loadMcpConfigFile(configPath);

      expect(result).toEqual({
        ...mockConfig,
        _metadata: expect.objectContaining({
          path: configPath,
          loadedAt: expect.any(String),
        }),
      });
    });

    it("should handle parser errors", async () => {
      const configPath = "/path/to/config.json";

      const mockParserInstance = new MCPConfigParser();
      vi.mocked(mockParserInstance.parseFile).mockResolvedValue({
        success: false,
        error: "Parse error",
      });

      await expect(loadMcpConfigFile(configPath)).rejects.toThrow(
        "Failed to parse MCP config: Parse error"
      );
    });
  });

  describe("Edge cases", () => {
    it("should handle test environment config override", async () => {
      const testConfigPath = "/test/config.json";

      // Set environment variables
      const originalNodeEnv = process.env.NODE_ENV;
      const originalTestConfig = process.env.HYPERTOOL_TEST_CONFIG;

      try {
        process.env.NODE_ENV = "test";
        process.env.HYPERTOOL_TEST_CONFIG = testConfigPath;

        mockFs.access.mockImplementation((path) => {
          if (path === testConfigPath) {
            return Promise.resolve();
          }
          return Promise.reject(new Error("ENOENT"));
        });

        const result = await discoverMcpConfigFile("./some-path.json");

        expect(result.configPath).toBe(testConfigPath);
        expect(result.source).toBe("cli");
        expect(result.errorMessage).toBeUndefined();
      } finally {
        process.env.NODE_ENV = originalNodeEnv;
        process.env.HYPERTOOL_TEST_CONFIG = originalTestConfig;
      }
    });

    it("should handle preference save failure gracefully", async () => {
      const relativePath = "./config.json";
      const expectedAbsolutePath = path.resolve(relativePath);

      mockFs.access.mockImplementation((path) => {
        if (path === expectedAbsolutePath) {
          return Promise.resolve();
        }
        return Promise.reject(new Error("ENOENT"));
      });

      mockSaveUserPreferences.mockRejectedValue(new Error("Save failed"));

      // Should still succeed even if preference save fails
      const result = await discoverMcpConfigFile(relativePath, true);

      expect(result.configPath).toBe(expectedAbsolutePath);
      expect(result.source).toBe("cli");
      expect(result.errorMessage).toBeUndefined();
    });
  });
});
