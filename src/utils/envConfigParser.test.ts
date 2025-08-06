/**
 * Tests for environment configuration parser
 */
import { describe, it, expect } from "vitest";
import {
  parseEnvDotNotation,
  hasSmitheryConfig,
  getConfigSourceDescription,
  validateParsedConfig,
} from "./envConfigParser.js";

describe("envConfigParser", () => {
  describe("parseEnvDotNotation", () => {
    it("should parse simple mcpServers configuration", () => {
      const env = {
        "mcpServers.git.command": "uvx",
        "mcpServers.git.type": "stdio",
        "mcpServers.memory.command": "npx",
      };

      const result = parseEnvDotNotation(env);

      expect(result).toEqual({
        mcpServers: {
          git: {
            command: "uvx",
            type: "stdio",
          },
          memory: {
            command: "npx",
          },
        },
      });
    });

    it("should parse array values using numeric indices", () => {
      const env = {
        "mcpServers.git.args.0": "mcp-server-git",
        "mcpServers.git.args.1": "--repository",
        "mcpServers.git.args.2": "/app",
      };

      const result = parseEnvDotNotation(env);

      expect(result).toEqual({
        mcpServers: {
          git: {
            args: ["mcp-server-git", "--repository", "/app"],
          },
        },
      });
    });

    it("should handle nested environment variables", () => {
      const env = {
        "mcpServers.git.env.PYTHONUNBUFFERED": "1",
        "mcpServers.git.env.UV_SYSTEM_PYTHON": "1",
        "mcpServers.filesystem.env.NODE_ENV": "production",
      };

      const result = parseEnvDotNotation(env);

      expect(result).toEqual({
        mcpServers: {
          git: {
            env: {
              PYTHONUNBUFFERED: "1",
              UV_SYSTEM_PYTHON: "1",
            },
          },
          filesystem: {
            env: {
              NODE_ENV: "production",
            },
          },
        },
      });
    });

    it("should coerce boolean values correctly", () => {
      const env = {
        debug: "true",
        "mcpServers.git.secure": "false",
      };

      const result = parseEnvDotNotation(env);

      expect(result.debug).toBe(true);
      expect(result.mcpServers?.git?.secure).toBe(false);
    });

    it("should coerce numeric values correctly", () => {
      const env = {
        "mcpServers.server.port": "3000",
        "mcpServers.server.timeout": "5000",
      };

      const result = parseEnvDotNotation(env);

      expect(result.mcpServers?.server?.port).toBe(3000);
      expect(result.mcpServers?.server?.timeout).toBe(5000);
    });

    it("should parse JSON values correctly", () => {
      const env = {
        "mcpServers.git.metadata": '{"version": "1.0", "tags": ["git", "mcp"]}',
      };

      const result = parseEnvDotNotation(env);

      expect(result.mcpServers?.git?.metadata).toEqual({
        version: "1.0",
        tags: ["git", "mcp"],
      });
    });

    it("should handle mixed configuration patterns", () => {
      const env = {
        "mcpServers.git.command": "uvx",
        "mcpServers.git.args.0": "mcp-server-git",
        "mcpServers.git.args.1": "--repository",
        "mcpServers.git.args.2": "/app",
        "mcpServers.git.env.PYTHONUNBUFFERED": "1",
        "mcpServers.filesystem.command": "npx",
        "mcpServers.filesystem.args.0": "-y",
        "mcpServers.filesystem.args.1":
          "@modelcontextprotocol/server-filesystem",
        "mcpServers.filesystem.args.2": "/tmp",
        DEBUG: "true",
        LOG_LEVEL: "info",
      };

      const result = parseEnvDotNotation(env);

      expect(result).toEqual({
        mcpServers: {
          git: {
            command: "uvx",
            args: ["mcp-server-git", "--repository", "/app"],
            env: {
              PYTHONUNBUFFERED: "1",
            },
          },
          filesystem: {
            command: "npx",
            args: ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
          },
        },
        debug: true,
        logLevel: "info",
      });
    });

    it("should handle empty environment gracefully", () => {
      const result = parseEnvDotNotation({});
      expect(result).toEqual({});
    });

    it("should ignore non-config environment variables", () => {
      const env = {
        PATH: "/usr/bin:/bin",
        HOME: "/home/user",
        "mcpServers.git.command": "uvx",
      };

      const result = parseEnvDotNotation(env);

      expect(result).toEqual({
        mcpServers: {
          git: {
            command: "uvx",
          },
        },
      });
    });
  });

  describe("hasSmitheryConfig", () => {
    it("should detect mcpServers configuration", () => {
      const env = { "mcpServers.git.command": "uvx" };
      expect(hasSmitheryConfig(env)).toBe(true);
    });

    it("should detect config.mcpServers configuration", () => {
      const env = { "config.mcpServers.git.command": "uvx" };
      expect(hasSmitheryConfig(env)).toBe(true);
    });

    it("should detect CONFIG_MCPSERVERS configuration", () => {
      const env = { CONFIG_MCPSERVERS_GIT_COMMAND: "uvx" };
      expect(hasSmitheryConfig(env)).toBe(true);
    });

    it("should return false when no Smithery config present", () => {
      const env = { PATH: "/usr/bin", DEBUG: "true" };
      expect(hasSmitheryConfig(env)).toBe(false);
    });
  });

  describe("getConfigSourceDescription", () => {
    it("should describe configuration sources correctly", () => {
      const config = {
        mcpServers: { git: {}, filesystem: {} },
        debug: true,
        logLevel: "info",
      };

      const description = getConfigSourceDescription(config);
      expect(description).toBe("mcpServers (2 servers), debug, logLevel");
    });

    it("should handle empty configuration", () => {
      const description = getConfigSourceDescription({});
      expect(description).toBe("no configuration");
    });

    it("should handle partial configuration", () => {
      const config = { debug: true };
      const description = getConfigSourceDescription(config);
      expect(description).toBe("debug");
    });
  });

  describe("validateParsedConfig", () => {
    it("should validate correct configuration", () => {
      const config = {
        mcpServers: {
          git: {
            type: "stdio",
            command: "uvx",
          },
        },
        logLevel: "info",
      };

      const result = validateParsedConfig(config);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should detect missing type property", () => {
      const config = {
        mcpServers: {
          git: {
            command: "uvx",
          },
        },
      };

      const result = validateParsedConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        "Server 'git' is missing required 'type' property"
      );
    });

    it("should detect missing command property for stdio type", () => {
      const config = {
        mcpServers: {
          git: {
            type: "stdio",
          },
        },
      };

      const result = validateParsedConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        "Server 'git' is missing required 'command' property for stdio transport"
      );
    });

    it("should detect invalid log level", () => {
      const config = {
        logLevel: "invalid",
      };

      const result = validateParsedConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Invalid log level: invalid");
    });

    it("should detect invalid server configuration", () => {
      const config = {
        mcpServers: {
          git: null,
        },
      };

      const result = validateParsedConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Server 'git' has invalid configuration");
    });
  });
});
