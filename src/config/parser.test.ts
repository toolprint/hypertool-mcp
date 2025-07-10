import { MCPConfigParser } from "./parser";
import { MCPConfig } from "../types/config";
import * as fs from "fs/promises";

// Mock fs module
jest.mock("fs/promises");
const mockFs = fs as jest.Mocked<typeof fs>;

describe("MCPConfigParser", () => {
  let parser: MCPConfigParser;

  beforeEach(() => {
    parser = new MCPConfigParser();
    jest.clearAllMocks();
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
            url: "https://mcp.context7.com/sse",
          },
        },
      });

      const result = parser.parseContent(content);

      expect(result.success).toBe(true);
      expect(result.config).toBeDefined();
      expect(result.config?.mcpServers.context7).toMatchObject({
        type: "sse",
        url: "https://mcp.context7.com/sse",
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
            url: "https://mcp.context7.com/sse",
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

    it("should validate empty mcpServers", () => {
      const content = JSON.stringify({
        mcpServers: {},
      });

      const result = parser.parseContent(content);

      expect(result.success).toBe(false);
      expect(result.validationErrors).toContain(
        "Configuration must define at least one server"
      );
    });

    it("should validate missing server type", () => {
      const content = JSON.stringify({
        mcpServers: {
          git: {
            command: "uvx",
          },
        },
      });

      const result = parser.parseContent(content);

      expect(result.success).toBe(false);
      expect(result.validationErrors).toContain(
        'Server "git" must have a "type" field'
      );
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
        'Server "git" has invalid type "invalid". Must be "stdio" or "sse"'
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

    it("should handle file not found error", async () => {
      const error = new Error("ENOENT") as NodeJS.ErrnoException;
      error.code = "ENOENT";
      mockFs.access.mockRejectedValue(error);

      const result = await parser.parseFile("/path/to/missing.json");

      expect(result.success).toBe(false);
      expect(result.error).toContain("Configuration file not found");
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
            command: "./bin/mcp-server",
          },
        },
      });

      const result = parser.parseContent(content);

      expect(result.success).toBe(true);
      expect(result.config?.mcpServers.local).toMatchObject({
        type: "stdio",
        command: "./bin/mcp-server",
      });
    });
  });
});
