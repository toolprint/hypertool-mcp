import { describe, it, expect, beforeEach, vi } from "vitest";
import { MCPConfigParser } from "./mcpConfigParser.js";
import { MCPConfig } from "../types/config.js";
import * as fs from "fs/promises";
import * as path from "path";

// Mock fs module
vi.mock("fs/promises");
const mockFs = fs as vi.Mocked<typeof fs>;

describe("MCPConfigParser", () => {
  let parser: MCPConfigParser;

  beforeEach(() => {
    parser = new MCPConfigParser();
    vi.clearAllMocks();
  });

  describe("parseContent", () => {
    it("should parse valid configuration with stdio server", () => {
      const content = JSON.stringify({
        mcpServers: {
          git: {
            type: "stdio",
            command: "uvx",
            args: ["mcp-server-git"],
          },
        },
      });

      const result = parser.parseContent(content);

      expect(result.success).toBe(true);
      expect(result.config).toBeDefined();
      expect(result.config?.mcpServers.git).toMatchObject({
        type: "stdio",
        command: "uvx",
        args: ["mcp-server-git"],
        env: {},
      });
    });

    it("should parse valid configuration with SSE server", () => {
      const content = JSON.stringify({
        mcpServers: {
          context7: {
            type: "sse",
            url: "https://sse.context7.com/sse",
          },
        },
      });

      const result = parser.parseContent(content);

      expect(result.success).toBe(true);
      expect(result.config).toBeDefined();
      expect(result.config?.mcpServers.context7).toMatchObject({
        type: "sse",
        url: "https://sse.context7.com/sse",
        headers: {},
        env: {},
      });
    });

    it("should parse configuration with multiple servers", () => {
      const content = JSON.stringify({
        mcpServers: {
          git: {
            type: "stdio",
            command: "uvx",
            args: ["mcp-server-git"],
          },
          docker: {
            type: "stdio",
            command: "uvx",
            args: ["mcp-server-docker"],
            env: { DOCKER_HOST: "unix:///var/run/docker.sock" },
          },
          context7: {
            type: "sse",
            url: "https://sse.context7.com/sse",
          },
        },
      });

      const result = parser.parseContent(content);

      expect(result.success).toBe(true);
      expect(result.config).toBeDefined();
      expect(Object.keys(result.config!.mcpServers)).toHaveLength(3);
    });

    it("should handle invalid JSON", () => {
      const content = "{ invalid json }";

      const result = parser.parseContent(content);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Invalid JSON");
    });

    it("should validate missing mcpServers field", () => {
      const content = JSON.stringify({});

      const result = parser.parseContent(content);

      expect(result.success).toBe(false);
      expect(result.validationErrors).toContain(
        'Configuration must have an "mcpServers" object'
      );
    });

    it("should allow empty mcpServers", () => {
      const content = JSON.stringify({
        mcpServers: {},
      });

      const result = parser.parseContent(content);

      expect(result.success).toBe(true);
      expect(result.config).toEqual({
        mcpServers: {},
      });
    });

    it("should default to stdio type when type field is missing (legacy behavior test)", () => {
      const content = JSON.stringify({
        mcpServers: {
          git: {
            command: "uvx",
            args: ["mcp-server-git"],
          },
        },
      });

      const result = parser.parseContent(content);

      expect(result.success).toBe(true);
      expect(result.config?.mcpServers.git).toMatchObject({
        type: "stdio",
        command: "uvx",
        args: ["mcp-server-git"],
        env: {},
      });
    });

    it("should validate invalid server type", () => {
      const content = JSON.stringify({
        mcpServers: {
          git: {
            type: "invalid",
          },
        },
      });

      const result = parser.parseContent(content);

      expect(result.success).toBe(false);
      expect(result.validationErrors).toContain(
        'Server "git" has invalid type "invalid". Must be "stdio", "http", "sse", or "dxt-extension"'
      );
    });

    it("should validate missing command for stdio server", () => {
      const content = JSON.stringify({
        mcpServers: {
          git: {
            type: "stdio",
          },
        },
      });

      const result = parser.parseContent(content);

      expect(result.success).toBe(false);
      expect(result.validationErrors).toContain(
        'Stdio server "git" must have a "command" string'
      );
    });

    it("should validate missing url for SSE server", () => {
      const content = JSON.stringify({
        mcpServers: {
          api: {
            type: "sse",
          },
        },
      });

      const result = parser.parseContent(content);

      expect(result.success).toBe(false);
      expect(result.validationErrors).toContain(
        'SSE server "api" must have a "url" string'
      );
    });

    it("should validate invalid URL for SSE server", () => {
      const content = JSON.stringify({
        mcpServers: {
          api: {
            type: "sse",
            url: "not-a-valid-url",
          },
        },
      });

      const result = parser.parseContent(content);

      expect(result.success).toBe(false);
      expect(result.validationErrors).toContain(
        'SSE server "api" has invalid URL: not-a-valid-url'
      );
    });

    it("should validate args must be array for stdio server", () => {
      const content = JSON.stringify({
        mcpServers: {
          git: {
            type: "stdio",
            command: "uvx",
            args: "not-an-array",
          },
        },
      });

      const result = parser.parseContent(content);

      expect(result.success).toBe(false);
      expect(result.validationErrors).toContain(
        'Stdio server "git" args must be an array'
      );
    });

    it("should validate args items must be strings", () => {
      const content = JSON.stringify({
        mcpServers: {
          git: {
            type: "stdio",
            command: "uvx",
            args: ["mcp-server-git", 123, true],
          },
        },
      });

      const result = parser.parseContent(content);

      expect(result.success).toBe(false);
      expect(result.validationErrors).toContain(
        'Stdio server "git" args[1] must be a string'
      );
      expect(result.validationErrors).toContain(
        'Stdio server "git" args[2] must be a string'
      );
    });

    it("should handle SSE server with headers", () => {
      const content = JSON.stringify({
        mcpServers: {
          api: {
            type: "sse",
            url: "https://api.example.com/sse",
            headers: {
              Authorization: "Bearer token",
              "X-Custom-Header": "value",
            },
          },
        },
      });

      const result = parser.parseContent(content);

      expect(result.success).toBe(true);
      expect(result.config?.mcpServers.api).toMatchObject({
        type: "sse",
        url: "https://api.example.com/sse",
        headers: {
          Authorization: "Bearer token",
          "X-Custom-Header": "value",
        },
      });
    });

    it("should handle partial errors in non-strict mode", () => {
      const parser = new MCPConfigParser({ strict: false });
      const content = JSON.stringify({
        mcpServers: {
          git: {
            type: "stdio",
            command: "uvx",
            args: ["mcp-server-git"],
          },
          invalid: {
            type: "stdio",
            // missing command
          },
        },
      });

      const result = parser.parseContent(content);

      expect(result.success).toBe(false);
      expect(result.config?.mcpServers.git).toBeDefined();
      expect(result.config?.mcpServers.invalid).toBeUndefined();
      expect(result.validationErrors).toContain(
        'Stdio server "invalid" must have a "command" string'
      );
    });

    it("should continue parsing when one server has invalid configuration", () => {
      const parser = new MCPConfigParser({ strict: false });

      const content = JSON.stringify({
        mcpServers: {
          good1: {
            type: "stdio",
            command: "uvx",
            args: ["mcp-server-1"],
          },
          malformed: {
            type: "stdio",
            // Missing required command field
          },
          good2: {
            type: "sse",
            url: "https://example.com/sse",
          },
        },
      });

      const result = parser.parseContent(content);

      expect(result.success).toBe(false);
      expect(result.config?.mcpServers.good1).toBeDefined();
      expect(result.config?.mcpServers.good2).toBeDefined();
      expect(result.config?.mcpServers.malformed).toBeUndefined();
      expect(result.validationErrors).toContain(
        'Stdio server "malformed" must have a "command" string'
      );
    });

    it("should handle mix of missing types and invalid configs", () => {
      const parser = new MCPConfigParser({ strict: false });
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      const content = JSON.stringify({
        mcpServers: {
          missingType: {
            // Missing type field - should fail with new validation
            command: "uvx",
            args: ["mcp-server-git"],
          },
          invalidStdio: {
            type: "stdio",
            // Missing required command
          },
          validSse: {
            type: "sse",
            url: "https://example.com/sse",
          },
        },
      });

      const result = parser.parseContent(content);

      expect(result.success).toBe(false);
      expect(result.config?.mcpServers.missingType).toBeDefined(); // Should now be defined with defaulted type
      expect(result.config?.mcpServers.invalidStdio).toBeUndefined();
      expect(result.config?.mcpServers.validSse).toBeDefined();
      // missingType should now be valid with defaulted type
      expect(result.validationErrors).toContain(
        'Stdio server "invalidStdio" must have a "command" string'
      );

      consoleSpy.mockRestore();
    });

    it("should fail completely in strict mode with any error", () => {
      const parser = new MCPConfigParser({ strict: true });
      const content = JSON.stringify({
        mcpServers: {
          git: {
            type: "stdio",
            command: "uvx",
            args: ["mcp-server-git"],
          },
          invalid: {
            type: "stdio",
            // missing command
          },
        },
      });

      const result = parser.parseContent(content);

      expect(result.success).toBe(false);
      expect(result.config).toBeUndefined();
      expect(result.validationErrors).toContain(
        'Stdio server "invalid" must have a "command" string'
      );
    });
  });

  describe("parseFile", () => {
    it("should read and parse file successfully", async () => {
      const content = JSON.stringify({
        mcpServers: {
          git: {
            type: "stdio",
            command: "uvx",
            args: ["mcp-server-git"],
          },
        },
      });

      mockFs.access.mockResolvedValue(undefined);
      mockFs.readFile.mockResolvedValue(content);

      const result = await parser.parseFile("/path/to/.mcp.json");

      expect(result.success).toBe(true);
      expect(result.config).toBeDefined();
      expect(mockFs.access).toHaveBeenCalledWith("/path/to/.mcp.json");
      expect(mockFs.readFile).toHaveBeenCalledWith(
        "/path/to/.mcp.json",
        "utf-8"
      );
    });

    it("should resolve relative paths to absolute paths", async () => {
      const relativePath = "./test-config.json";
      const expectedAbsolutePath = path.resolve(relativePath);
      const content = JSON.stringify({
        mcpServers: {
          git: {
            type: "stdio",
            command: "uvx",
            args: ["mcp-server-git"],
          },
        },
      });

      mockFs.access.mockResolvedValue(undefined);
      mockFs.readFile.mockResolvedValue(content);

      const result = await parser.parseFile(relativePath);

      expect(result.success).toBe(true);
      expect(result.config).toBeDefined();
      expect(mockFs.access).toHaveBeenCalledWith(expectedAbsolutePath);
      expect(mockFs.readFile).toHaveBeenCalledWith(
        expectedAbsolutePath,
        "utf-8"
      );
    });

    it("should handle relative paths with parent directories", async () => {
      const relativePath = "../configs/mcp.json";
      const expectedAbsolutePath = path.resolve(relativePath);
      const content = JSON.stringify({
        mcpServers: {
          test: {
            type: "sse",
            url: "https://example.com/sse",
          },
        },
      });

      mockFs.access.mockResolvedValue(undefined);
      mockFs.readFile.mockResolvedValue(content);

      const result = await parser.parseFile(relativePath);

      expect(result.success).toBe(true);
      expect(result.config).toBeDefined();
      expect(mockFs.access).toHaveBeenCalledWith(expectedAbsolutePath);
      expect(mockFs.readFile).toHaveBeenCalledWith(
        expectedAbsolutePath,
        "utf-8"
      );
    });

    it("should handle file not found error", async () => {
      const error = new Error("ENOENT") as NodeJS.ErrnoException;
      error.code = "ENOENT";
      mockFs.access.mockRejectedValue(error);

      const result = await parser.parseFile("/path/to/missing.json");

      expect(result.success).toBe(false);
      expect(result.error).toContain("Configuration file not found");
    });

    it("should handle file not found error with relative paths", async () => {
      const relativePath = "./missing-config.json";
      const expectedAbsolutePath = path.resolve(relativePath);
      const error = new Error("ENOENT") as NodeJS.ErrnoException;
      error.code = "ENOENT";
      mockFs.access.mockRejectedValue(error);

      const result = await parser.parseFile(relativePath);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Configuration file not found");
      expect(result.error).toContain(relativePath);
      expect(result.error).toContain(expectedAbsolutePath);
    });

    it("should handle file read error", async () => {
      mockFs.access.mockResolvedValue(undefined);
      mockFs.readFile.mockRejectedValue(new Error("Permission denied"));

      const result = await parser.parseFile("/path/to/forbidden.json");

      expect(result.success).toBe(false);
      expect(result.error).toContain(
        "Failed to read configuration file: Permission denied"
      );
    });
  });

  describe("static methods", () => {
    it("should get server names", () => {
      const config: MCPConfig = {
        mcpServers: {
          git: { type: "stdio", command: "uvx", args: ["mcp-server-git"] },
          docker: {
            type: "stdio",
            command: "uvx",
            args: ["mcp-server-docker"],
          },
        },
      };

      const names = MCPConfigParser.getServerNames(config);

      expect(names).toEqual(["git", "docker"]);
    });

    it("should get specific server config", () => {
      const config: MCPConfig = {
        mcpServers: {
          git: { type: "stdio", command: "uvx", args: ["mcp-server-git"] },
          docker: {
            type: "stdio",
            command: "uvx",
            args: ["mcp-server-docker"],
          },
        },
      };

      const gitConfig = MCPConfigParser.getServerConfig(config, "git");
      const missingConfig = MCPConfigParser.getServerConfig(config, "missing");

      expect(gitConfig).toEqual(config.mcpServers.git);
      expect(missingConfig).toBeUndefined();
    });
  });

  describe("path validation", () => {
    it("should skip path validation when disabled", () => {
      const parser = new MCPConfigParser({ validatePaths: false });
      const content = JSON.stringify({
        mcpServers: {
          custom: {
            type: "stdio",
            command: "/non/existent/path",
          },
        },
      });

      const result = parser.parseContent(content);

      expect(result.success).toBe(true);
    });

    it("should handle relative paths when allowed", () => {
      const parser = new MCPConfigParser({ allowRelativePaths: true });
      const content = JSON.stringify({
        mcpServers: {
          local: {
            type: "stdio",
            command: "./bin/sse-server",
          },
        },
      });

      const result = parser.parseContent(content);

      expect(result.success).toBe(true);
      expect(result.config?.mcpServers.local).toMatchObject({
        type: "stdio",
        command: "./bin/sse-server",
      });
    });
  });

  describe("optional type field with stdio default", () => {
    it("should default to stdio type when type field is missing", () => {
      const content = JSON.stringify({
        mcpServers: {
          git: {
            command: "uvx",
            args: ["mcp-server-git"],
          },
        },
      });

      const result = parser.parseContent(content);

      expect(result.success).toBe(true);
      expect(result.config).toBeDefined();
      expect(result.config?.mcpServers.git).toMatchObject({
        type: "stdio",
        command: "uvx",
        args: ["mcp-server-git"],
        env: {},
      });
    });

    it("should default to stdio type when type field is undefined", () => {
      const content = JSON.stringify({
        mcpServers: {
          docker: {
            type: undefined,
            command: "docker-mcp",
            args: ["--port", "8080"],
            env: { DOCKER_HOST: "unix:///var/run/docker.sock" },
          },
        },
      });

      const result = parser.parseContent(content);

      expect(result.success).toBe(true);
      expect(result.config?.mcpServers.docker).toMatchObject({
        type: "stdio",
        command: "docker-mcp",
        args: ["--port", "8080"],
        env: { DOCKER_HOST: "unix:///var/run/docker.sock" },
      });
    });

    it("should default to stdio type when type field is null", () => {
      const content = JSON.stringify({
        mcpServers: {
          filesystem: {
            type: null,
            command: "mcp-server-filesystem",
            args: ["/home/user/projects"],
          },
        },
      });

      const result = parser.parseContent(content);

      expect(result.success).toBe(true);
      expect(result.config?.mcpServers.filesystem).toMatchObject({
        type: "stdio",
        command: "mcp-server-filesystem",
        args: ["/home/user/projects"],
        env: {},
      });
    });

    it("should default to stdio type when type field is empty string", () => {
      const content = JSON.stringify({
        mcpServers: {
          calculator: {
            type: "",
            command: "python",
            args: ["-m", "calculator_mcp"],
          },
        },
      });

      const result = parser.parseContent(content);

      expect(result.success).toBe(true);
      expect(result.config?.mcpServers.calculator).toMatchObject({
        type: "stdio",
        command: "python",
        args: ["-m", "calculator_mcp"],
        env: {},
      });
    });

    it("should handle multiple servers with missing type fields", () => {
      const content = JSON.stringify({
        mcpServers: {
          git: {
            command: "uvx",
            args: ["mcp-server-git"],
          },
          docker: {
            command: "uvx",
            args: ["mcp-server-docker"],
            env: { DOCKER_HOST: "unix:///var/run/docker.sock" },
          },
          api: {
            type: "sse",
            url: "https://api.example.com/sse",
          },
        },
      });

      const result = parser.parseContent(content);

      expect(result.success).toBe(true);
      expect(result.config).toBeDefined();
      expect(Object.keys(result.config!.mcpServers)).toHaveLength(3);
      expect(result.config?.mcpServers.git).toMatchObject({
        type: "stdio",
        command: "uvx",
        args: ["mcp-server-git"],
        env: {},
      });
      expect(result.config?.mcpServers.docker).toMatchObject({
        type: "stdio",
        command: "uvx",
        args: ["mcp-server-docker"],
        env: { DOCKER_HOST: "unix:///var/run/docker.sock" },
      });
      expect(result.config?.mcpServers.api).toMatchObject({
        type: "sse",
        url: "https://api.example.com/sse",
        headers: {},
        env: {},
      });
    });

    it("should still validate stdio requirements when type is defaulted", () => {
      const content = JSON.stringify({
        mcpServers: {
          missingCommand: {
            // Missing command - should fail validation
            args: ["--verbose"],
          },
        },
      });

      const result = parser.parseContent(content);

      expect(result.success).toBe(false);
      expect(result.validationErrors).toContain(
        'Stdio server "missingCommand" must have a "command" string'
      );
    });

    it("should validate args array when type is defaulted", () => {
      const content = JSON.stringify({
        mcpServers: {
          invalidArgs: {
            command: "uvx",
            args: "not-an-array",
          },
        },
      });

      const result = parser.parseContent(content);

      expect(result.success).toBe(false);
      expect(result.validationErrors).toContain(
        'Stdio server "invalidArgs" args must be an array'
      );
    });

    it("should validate args items are strings when type is defaulted", () => {
      const content = JSON.stringify({
        mcpServers: {
          mixedArgs: {
            command: "python",
            args: ["-m", "server", 123, true, null],
          },
        },
      });

      const result = parser.parseContent(content);

      expect(result.success).toBe(false);
      expect(result.validationErrors).toContain(
        'Stdio server "mixedArgs" args[2] must be a string'
      );
      expect(result.validationErrors).toContain(
        'Stdio server "mixedArgs" args[3] must be a string'
      );
      expect(result.validationErrors).toContain(
        'Stdio server "mixedArgs" args[4] must be a string'
      );
    });
  });

  describe("graceful handling of individual config failures", () => {
    it("should continue processing valid configs when one has missing type and invalid command", () => {
      const parser = new MCPConfigParser({ strict: false });
      const content = JSON.stringify({
        mcpServers: {
          validServer: {
            type: "stdio",
            command: "uvx",
            args: ["mcp-server-git"],
          },
          invalidServer: {
            // Missing type (should default to stdio) but also missing command
            args: ["--verbose"],
          },
          anotherValidServer: {
            type: "sse",
            url: "https://example.com/sse",
          },
        },
      });

      const result = parser.parseContent(content);

      expect(result.success).toBe(false);
      expect(result.config?.mcpServers.validServer).toBeDefined();
      expect(result.config?.mcpServers.anotherValidServer).toBeDefined();
      expect(result.config?.mcpServers.invalidServer).toBeUndefined();
      expect(result.validationErrors).toContain(
        'Stdio server "invalidServer" must have a "command" string'
      );
      expect(Object.keys(result.config!.mcpServers)).toHaveLength(2);
    });

    it("should handle mix of missing types and explicit types with errors", () => {
      const parser = new MCPConfigParser({ strict: false });
      const content = JSON.stringify({
        mcpServers: {
          noTypeValid: {
            // Should default to stdio and be valid
            command: "uvx",
            args: ["mcp-server-1"],
          },
          noTypeInvalid: {
            // Should default to stdio but missing command
            args: ["--config", "path"],
          },
          explicitStdioInvalid: {
            type: "stdio",
            // Missing command
          },
          explicitSseInvalid: {
            type: "sse",
            // Missing URL
          },
          explicitSseValid: {
            type: "sse",
            url: "https://api.example.com/sse",
          },
        },
      });

      const result = parser.parseContent(content);

      expect(result.success).toBe(false);
      expect(result.config?.mcpServers.noTypeValid).toBeDefined();
      expect(result.config?.mcpServers.explicitSseValid).toBeDefined();
      expect(result.config?.mcpServers.noTypeInvalid).toBeUndefined();
      expect(result.config?.mcpServers.explicitStdioInvalid).toBeUndefined();
      expect(result.config?.mcpServers.explicitSseInvalid).toBeUndefined();

      expect(result.validationErrors).toContain(
        'Stdio server "noTypeInvalid" must have a "command" string'
      );
      expect(result.validationErrors).toContain(
        'Stdio server "explicitStdioInvalid" must have a "command" string'
      );
      expect(result.validationErrors).toContain(
        'SSE server "explicitSseInvalid" must have a "url" string'
      );
      expect(Object.keys(result.config!.mcpServers)).toHaveLength(2);
    });

    it("should log warnings for invalid configs in non-strict mode", () => {
      const parser = new MCPConfigParser({ strict: false });
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      const content = JSON.stringify({
        mcpServers: {
          valid: {
            command: "uvx",
            args: ["mcp-server"],
          },
          invalid: {
            // Missing command, should default to stdio but fail validation
            args: ["--verbose"],
          },
        },
      });

      const result = parser.parseContent(content);

      expect(result.success).toBe(false);
      expect(result.config?.mcpServers.valid).toBeDefined();
      expect(result.config?.mcpServers.invalid).toBeUndefined();

      consoleSpy.mockRestore();
    });

    it("should still fail completely in strict mode even with default type", () => {
      const parser = new MCPConfigParser({ strict: true });
      const content = JSON.stringify({
        mcpServers: {
          valid: {
            command: "uvx",
            args: ["mcp-server"],
          },
          invalid: {
            // Missing command, should default to stdio but fail validation
            args: ["--verbose"],
          },
        },
      });

      const result = parser.parseContent(content);

      expect(result.success).toBe(false);
      expect(result.config).toBeUndefined();
      expect(result.validationErrors).toContain(
        'Stdio server "invalid" must have a "command" string'
      );
    });

    it("should preserve env and other fields when type is defaulted", () => {
      const content = JSON.stringify({
        mcpServers: {
          withEnv: {
            // Type omitted, should default to stdio
            command: "python",
            args: ["-m", "myserver"],
            env: {
              PYTHONPATH: "/custom/path",
              DEBUG: "true",
            },
          },
        },
      });

      const result = parser.parseContent(content);

      expect(result.success).toBe(true);
      expect(result.config?.mcpServers.withEnv).toMatchObject({
        type: "stdio",
        command: "python",
        args: ["-m", "myserver"],
        env: {
          PYTHONPATH: "/custom/path",
          DEBUG: "true",
        },
      });
    });

    it("should handle empty mcpServers object gracefully", () => {
      const content = JSON.stringify({
        mcpServers: {},
      });

      const result = parser.parseContent(content);

      expect(result.success).toBe(true);
      expect(result.config).toEqual({
        mcpServers: {},
      });
    });

    it("should handle whitespace-only type values as empty", () => {
      const content = JSON.stringify({
        mcpServers: {
          whitespaceType: {
            type: "   ",
            command: "uvx",
            args: ["mcp-server"],
          },
        },
      });

      const result = parser.parseContent(content);

      expect(result.success).toBe(true);
      expect(result.config?.mcpServers.whitespaceType).toMatchObject({
        type: "stdio",
        command: "uvx",
        args: ["mcp-server"],
        env: {},
      });
    });

    it("should handle multiple servers with various type field issues", () => {
      const parser = new MCPConfigParser({ strict: false });
      const content = JSON.stringify({
        mcpServers: {
          missing: {
            command: "uvx",
            args: ["mcp-1"],
          },
          empty: {
            type: "",
            command: "uvx",
            args: ["mcp-2"],
          },
          whitespace: {
            type: "  \t  ",
            command: "uvx",
            args: ["mcp-3"],
          },
          nullType: {
            type: null,
            command: "uvx",
            args: ["mcp-4"],
          },
          undefinedType: {
            type: undefined,
            command: "uvx",
            args: ["mcp-5"],
          },
          explicit: {
            type: "stdio",
            command: "uvx",
            args: ["mcp-6"],
          },
          invalidButMissingCommand: {
            // Should default to stdio but fail on missing command
            args: ["--help"],
          },
        },
      });

      const result = parser.parseContent(content);

      expect(result.success).toBe(false);
      expect(Object.keys(result.config!.mcpServers)).toHaveLength(6);

      // All should default to stdio type
      expect(result.config?.mcpServers.missing?.type).toBe("stdio");
      expect(result.config?.mcpServers.empty?.type).toBe("stdio");
      expect(result.config?.mcpServers.whitespace?.type).toBe("stdio");
      expect(result.config?.mcpServers.nullType?.type).toBe("stdio");
      expect(result.config?.mcpServers.undefinedType?.type).toBe("stdio");
      expect(result.config?.mcpServers.explicit?.type).toBe("stdio");

      // The invalid one should not be included
      expect(
        result.config?.mcpServers.invalidButMissingCommand
      ).toBeUndefined();

      // Should have validation error for the missing command
      expect(result.validationErrors).toContain(
        'Stdio server "invalidButMissingCommand" must have a "command" string'
      );
    });
  });
});
