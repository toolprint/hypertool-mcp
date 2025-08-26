/**
 * Tests for PersonaMcpIntegration
 *
 * @fileoverview Comprehensive tests for MCP configuration integration functionality
 */

import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
  type MockedFunction,
} from "vitest";
import { promises as fs } from "fs";
import { join, resolve } from "path";
import {
  PersonaMcpIntegration,
  createPersonaMcpIntegration,
  personaHasMcpConfig,
  validatePersonaMcpConfigFile,
  type McpConfigMergeOptions,
  type McpConfigMergeResult,
} from "./mcp-integration.js";
import type { MCPConfig, ServerEntry } from "../types/config.js";
import type { PersonaAssets } from "./types.js";
import { PersonaErrorCode } from "./types.js";

// Mock fs promises
vi.mock("fs", () => ({
  promises: {
    access: vi.fn(),
    readFile: vi.fn(),
  },
}));

// Mock MCPConfigParser
vi.mock("../config/mcpConfigParser.js", () => ({
  MCPConfigParser: vi.fn().mockImplementation(() => ({
    parseFile: vi.fn(),
  })),
}));

const mockedFs = fs as any;

import { MCPConfigParser } from "../config/mcpConfigParser.js";
const MockedMCPConfigParser = MCPConfigParser as any;

describe("PersonaMcpIntegration", () => {
  let mockGetCurrentConfig: MockedFunction<() => Promise<MCPConfig | null>>;
  let mockSetCurrentConfig: MockedFunction<
    (config: MCPConfig) => Promise<void>
  >;
  let mockRestartConnections: MockedFunction<() => Promise<void>>;
  let integration: PersonaMcpIntegration;

  const sampleBaseConfig: MCPConfig = {
    mcpServers: {
      "base-server": {
        type: "stdio",
        command: "base-command",
        args: ["arg1"],
        env: { BASE_VAR: "base-value" },
      },
    },
  };

  const samplePersonaConfig: MCPConfig = {
    mcpServers: {
      "persona-server": {
        type: "http",
        url: "http://localhost:3000",
        headers: { Authorization: "Bearer token" },
      },
      "base-server": {
        type: "stdio",
        command: "persona-command",
        args: ["arg2"],
        env: { PERSONA_VAR: "persona-value" },
      },
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockGetCurrentConfig = vi.fn();
    mockSetCurrentConfig = vi.fn();
    mockRestartConnections = vi.fn();

    // Setup default mock for MCPConfigParser
    MockedMCPConfigParser.mockImplementation(() => ({
      parseFile: vi.fn().mockResolvedValue({
        success: true,
        config: samplePersonaConfig,
      }),
    }));

    integration = new PersonaMcpIntegration(
      mockGetCurrentConfig,
      mockSetCurrentConfig,
      mockRestartConnections
    );
  });

  afterEach(() => {
    integration.dispose();
  });

  describe("constructor", () => {
    it("should create integration with default merge options", () => {
      expect(integration).toBeInstanceOf(PersonaMcpIntegration);
      expect(integration.hasBackup()).toBe(false);
    });

    it("should accept custom merge options", () => {
      const customOptions: Partial<McpConfigMergeOptions> = {
        conflictResolution: "base-wins",
        preserveBaseEnv: false,
      };

      const customIntegration = new PersonaMcpIntegration(
        mockGetCurrentConfig,
        mockSetCurrentConfig,
        mockRestartConnections,
        customOptions
      );

      expect(customIntegration).toBeInstanceOf(PersonaMcpIntegration);
      customIntegration.dispose();
    });
  });

  describe("createNullIntegration", () => {
    it("should create a null integration for personas without MCP configs", () => {
      const nullIntegration = PersonaMcpIntegration.createNullIntegration();

      expect(nullIntegration).toBeInstanceOf(PersonaMcpIntegration);
      expect(nullIntegration.hasBackup()).toBe(false);

      nullIntegration.dispose();
    });
  });

  describe("applyPersonaConfig", () => {
    const testConfigPath = "/test/persona/mcp.json";

    it("should apply persona config when no base config exists", async () => {
      mockGetCurrentConfig.mockResolvedValue(null);

      const result = await integration.applyPersonaConfig(testConfigPath);

      expect(result.success).toBe(true);
      expect(result.mergedConfig).toEqual(samplePersonaConfig);
      expect(result.conflicts).toHaveLength(0);
      expect(result.stats.baseServersCount).toBe(0);
      expect(result.stats.personaServersCount).toBe(2);
      expect(result.stats.mergedServersCount).toBe(2);

      expect(mockSetCurrentConfig).toHaveBeenCalledWith(samplePersonaConfig);
      expect(mockRestartConnections).toHaveBeenCalled();
    });

    it("should merge configs with persona-wins strategy", async () => {
      mockGetCurrentConfig.mockResolvedValue(sampleBaseConfig);

      const result = await integration.applyPersonaConfig(testConfigPath);

      expect(result.success).toBe(true);
      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts[0]).toContain("base-server");
      expect(result.stats.conflictsResolved).toBe(1);

      // Check merged config has persona server priority
      const mergedConfig = result.mergedConfig!;
      expect(mergedConfig.mcpServers["base-server"]).toEqual(
        expect.objectContaining({
          command: "persona-command",
          args: ["arg2"],
        })
      );

      // Should have both servers
      expect(Object.keys(mergedConfig.mcpServers)).toHaveLength(2);
      expect(mergedConfig.mcpServers["persona-server"]).toBeDefined();
    });

    it("should handle environment variable merging", async () => {
      mockGetCurrentConfig.mockResolvedValue(sampleBaseConfig);

      const result = await integration.applyPersonaConfig(testConfigPath, {
        conflictResolution: "persona-wins",
        mergeEnvironment: true,
        preserveBaseEnv: true,
      });

      expect(result.success).toBe(true);

      // Check environment merging for conflicted server
      const mergedServer = result.mergedConfig!.mcpServers[
        "base-server"
      ] as any;
      expect(mergedServer.env).toEqual({
        BASE_VAR: "base-value", // Preserved from base
        PERSONA_VAR: "persona-value", // Added from persona
      });
    });

    it("should handle file system errors gracefully", async () => {
      // Mock parser to return file error
      MockedMCPConfigParser.mockImplementation(() => ({
        parseFile: vi.fn().mockRejectedValue(new Error("File not found")),
      }));

      // Create new integration instance with the mocked parser
      integration.dispose();
      integration = new PersonaMcpIntegration(
        mockGetCurrentConfig,
        mockSetCurrentConfig,
        mockRestartConnections
      );

      const result = await integration.applyPersonaConfig(testConfigPath);

      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain("File not found");
      expect(mockSetCurrentConfig).not.toHaveBeenCalled();
    });

    it("should handle invalid JSON gracefully", async () => {
      // Mock parser to return parse error
      MockedMCPConfigParser.mockImplementation(() => ({
        parseFile: vi.fn().mockResolvedValue({
          success: false,
          error: "Invalid JSON: Unexpected token",
          config: null,
        }),
      }));

      // Create new integration instance with the mocked parser
      integration.dispose();
      integration = new PersonaMcpIntegration(
        mockGetCurrentConfig,
        mockSetCurrentConfig,
        mockRestartConnections
      );

      const result = await integration.applyPersonaConfig(testConfigPath);

      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain("Failed to apply persona MCP config");
    });

    it("should create backup when merging with existing config", async () => {
      mockGetCurrentConfig.mockResolvedValue(sampleBaseConfig);

      const result = await integration.applyPersonaConfig(testConfigPath);

      expect(result.success).toBe(true);
      expect(integration.hasBackup()).toBe(true);

      const backup = integration.getBackupInfo();
      expect(backup).toBeDefined();
      expect(backup!.originalConfig).toEqual(sampleBaseConfig);
      expect(backup!.source).toBe("persona-integration");
    });

    it("should handle connection restart failures gracefully", async () => {
      mockGetCurrentConfig.mockResolvedValue(null);
      mockRestartConnections.mockRejectedValue(
        new Error("Connection restart failed")
      );

      const result = await integration.applyPersonaConfig(testConfigPath);

      expect(result.success).toBe(true); // Should still succeed
      expect(result.warnings).toContain(
        "Connection restart failed: Connection restart failed"
      );
    });
  });

  describe("restoreOriginalConfig", () => {
    const testConfigPath = "/test/persona/mcp.json";

    it("should restore original configuration", async () => {
      mockGetCurrentConfig.mockResolvedValue(sampleBaseConfig);

      // First apply a config to create backup
      await integration.applyPersonaConfig(testConfigPath);
      expect(integration.hasBackup()).toBe(true);

      // Clear the mock calls
      mockSetCurrentConfig.mockClear();
      mockRestartConnections.mockClear();

      // Restore the config
      await integration.restoreOriginalConfig();

      expect(mockSetCurrentConfig).toHaveBeenCalledWith(sampleBaseConfig);
      expect(mockRestartConnections).toHaveBeenCalled();
      expect(integration.hasBackup()).toBe(false);
    });

    it("should handle missing backup gracefully", async () => {
      // No backup created
      expect(integration.hasBackup()).toBe(false);

      await expect(
        integration.restoreOriginalConfig()
      ).resolves.toBeUndefined();
      expect(mockSetCurrentConfig).not.toHaveBeenCalled();
    });

    it("should handle restoration errors", async () => {
      mockGetCurrentConfig.mockResolvedValue(sampleBaseConfig);
      await integration.applyPersonaConfig(testConfigPath);

      mockSetCurrentConfig.mockRejectedValue(
        new Error("Config restore failed")
      );

      await expect(integration.restoreOriginalConfig()).rejects.toThrow(
        "Failed to restore original MCP config"
      );
    });

    it("should handle connection restart errors during restore", async () => {
      mockGetCurrentConfig.mockResolvedValue(sampleBaseConfig);
      await integration.applyPersonaConfig(testConfigPath);

      mockRestartConnections.mockRejectedValue(
        new Error("Connection restart failed")
      );

      // Should not throw, just log warning
      await expect(
        integration.restoreOriginalConfig()
      ).resolves.toBeUndefined();
      expect(integration.hasBackup()).toBe(false);
    });
  });

  describe("configuration merging", () => {
    const testConfigPath = "/test/persona/mcp.json";

    beforeEach(() => {
      mockedFs.access.mockResolvedValue(undefined);
    });

    it("should handle base-wins conflict resolution", async () => {
      mockedFs.readFile.mockResolvedValue(JSON.stringify(samplePersonaConfig));
      mockGetCurrentConfig.mockResolvedValue(sampleBaseConfig);

      const result = await integration.applyPersonaConfig(testConfigPath, {
        conflictResolution: "base-wins",
      });

      expect(result.success).toBe(true);
      const mergedServer = result.mergedConfig!.mcpServers[
        "base-server"
      ] as any;
      expect(mergedServer.command).toBe("base-command"); // Base wins
      expect(result.warnings).toContain(
        'Using base config for server "base-server"'
      );
    });

    it("should handle user-choice conflict resolution", async () => {
      mockedFs.readFile.mockResolvedValue(JSON.stringify(samplePersonaConfig));
      mockGetCurrentConfig.mockResolvedValue(sampleBaseConfig);

      const result = await integration.applyPersonaConfig(testConfigPath, {
        conflictResolution: "user-choice",
      });

      expect(result.success).toBe(true);
      expect(
        result.warnings.some((w) => w.includes("Auto-resolved conflict"))
      ).toBe(true);
    });

    it("should handle error conflict resolution", async () => {
      mockedFs.readFile.mockResolvedValue(JSON.stringify(samplePersonaConfig));
      mockGetCurrentConfig.mockResolvedValue(sampleBaseConfig);

      const result = await integration.applyPersonaConfig(testConfigPath, {
        conflictResolution: "error",
      });

      expect(result.success).toBe(false);
      expect(result.errors).toContain(
        'Configuration conflict for server "base-server" - resolution required'
      );
    });

    it("should use custom conflict resolver", async () => {
      mockedFs.readFile.mockResolvedValue(JSON.stringify(samplePersonaConfig));
      mockGetCurrentConfig.mockResolvedValue(sampleBaseConfig);

      const customResolver = vi.fn().mockReturnValue({
        type: "stdio",
        command: "custom-command",
        env: {},
      });

      const result = await integration.applyPersonaConfig(testConfigPath, {
        conflictResolution: "persona-wins",
        customResolver,
      });

      expect(result.success).toBe(true);
      expect(customResolver).toHaveBeenCalledWith(
        "base-server",
        expect.any(Object),
        expect.any(Object)
      );

      const mergedServer = result.mergedConfig!.mcpServers[
        "base-server"
      ] as any;
      expect(mergedServer.command).toBe("custom-command");
    });
  });

  describe("validateMcpConfig", () => {
    it("should validate correct MCP config structure", () => {
      expect(PersonaMcpIntegration.validateMcpConfig(sampleBaseConfig)).toBe(
        true
      );
    });

    it("should reject invalid config structures", () => {
      expect(PersonaMcpIntegration.validateMcpConfig(null)).toBe(false);
      expect(PersonaMcpIntegration.validateMcpConfig(undefined)).toBe(false);
      expect(PersonaMcpIntegration.validateMcpConfig("string")).toBe(false);
      expect(PersonaMcpIntegration.validateMcpConfig({})).toBe(false);
      expect(
        PersonaMcpIntegration.validateMcpConfig({ mcpServers: "invalid" })
      ).toBe(false);
    });
  });
});

describe("helper functions", () => {
  describe("personaHasMcpConfig", () => {
    it("should return true when persona has MCP config file", () => {
      const assets: PersonaAssets = {
        configFile: "/test/persona.yaml",
        mcpConfigFile: "/test/mcp.json",
      };

      expect(personaHasMcpConfig(assets)).toBe(true);
    });

    it("should return false when persona lacks MCP config file", () => {
      const assets: PersonaAssets = {
        configFile: "/test/persona.yaml",
      };

      expect(personaHasMcpConfig(assets)).toBe(false);
    });

    it("should return false when mcpConfigFile is undefined", () => {
      const assets: PersonaAssets = {
        configFile: "/test/persona.yaml",
        mcpConfigFile: undefined,
      };

      expect(personaHasMcpConfig(assets)).toBe(false);
    });
  });

  describe("validatePersonaMcpConfigFile", () => {
    const testPath = "/test/mcp.json";

    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("should validate accessible and parseable MCP config file", async () => {
      mockedFs.access.mockResolvedValue(undefined);
      mockedFs.readFile.mockResolvedValue(
        JSON.stringify({
          mcpServers: {
            "test-server": {
              type: "stdio",
              command: "test-command",
            },
          },
        })
      );

      const result = await validatePersonaMcpConfigFile(testPath);

      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("should handle file access errors", async () => {
      mockedFs.access.mockRejectedValue(new Error("Permission denied"));

      const result = await validatePersonaMcpConfigFile(testPath);

      expect(result.isValid).toBe(false);
      expect(result.error).toBe("File access error: Permission denied");
    });

    it("should handle parsing errors", async () => {
      mockedFs.access.mockResolvedValue(undefined);
      mockedFs.readFile.mockResolvedValue("{ invalid json }");

      const result = await validatePersonaMcpConfigFile(testPath);

      expect(result.isValid).toBe(false);
      expect(result.error).toContain("Invalid JSON");
    });

    it("should handle validation errors", async () => {
      mockedFs.access.mockResolvedValue(undefined);
      mockedFs.readFile.mockResolvedValue(
        JSON.stringify({
          // Missing mcpServers field
          servers: {},
        })
      );

      const result = await validatePersonaMcpConfigFile(testPath);

      expect(result.isValid).toBe(false);
      expect(result.error).toContain("missing 'mcpServers' field");
    });
  });

  describe("createPersonaMcpIntegration", () => {
    it("should create integration with provided handlers", () => {
      const getCurrentConfig = vi.fn();
      const setCurrentConfig = vi.fn();
      const restartConnections = vi.fn();

      const integration = createPersonaMcpIntegration(
        getCurrentConfig,
        setCurrentConfig,
        restartConnections
      );

      expect(integration).toBeInstanceOf(PersonaMcpIntegration);
      integration.dispose();
    });

    it("should create integration with merge options", () => {
      const getCurrentConfig = vi.fn();
      const setCurrentConfig = vi.fn();
      const mergeOptions: Partial<McpConfigMergeOptions> = {
        conflictResolution: "base-wins",
      };

      const integration = createPersonaMcpIntegration(
        getCurrentConfig,
        setCurrentConfig,
        undefined,
        mergeOptions
      );

      expect(integration).toBeInstanceOf(PersonaMcpIntegration);
      integration.dispose();
    });
  });
});

describe("merge scenarios", () => {
  let mockGetCurrentConfig: MockedFunction<() => Promise<MCPConfig | null>>;
  let mockSetCurrentConfig: MockedFunction<
    (config: MCPConfig) => Promise<void>
  >;
  let integration: PersonaMcpIntegration;

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCurrentConfig = vi.fn();
    mockSetCurrentConfig = vi.fn();

    mockedFs.access.mockResolvedValue(undefined);

    integration = new PersonaMcpIntegration(
      mockGetCurrentConfig,
      mockSetCurrentConfig
    );
  });

  afterEach(() => {
    integration.dispose();
  });

  it("should handle complex merging scenario with multiple conflicts", async () => {
    const complexBase: MCPConfig = {
      mcpServers: {
        "server-a": {
          type: "stdio",
          command: "base-a",
          env: { BASE_A: "value-a" },
        },
        "server-b": {
          type: "http",
          url: "http://base-b.com",
          headers: { "X-Base": "base-b" },
        },
        "server-c": {
          type: "sse",
          url: "http://base-c.com",
        },
      },
    };

    const complexPersona: MCPConfig = {
      mcpServers: {
        "server-a": {
          type: "stdio",
          command: "persona-a",
          env: { PERSONA_A: "persona-value-a" },
        },
        "server-d": {
          type: "http",
          url: "http://persona-d.com",
        },
      },
    };

    mockGetCurrentConfig.mockResolvedValue(complexBase);
    mockedFs.readFile.mockResolvedValue(JSON.stringify(complexPersona));

    const result = await integration.applyPersonaConfig("/test/mcp.json", {
      conflictResolution: "persona-wins",
      mergeEnvironment: true,
      preserveBaseEnv: true,
    });

    expect(result.success).toBe(true);
    expect(result.conflicts).toHaveLength(1); // Only server-a conflicts
    expect(result.stats.baseServersCount).toBe(3);
    expect(result.stats.personaServersCount).toBe(2);
    expect(result.stats.mergedServersCount).toBe(4); // server-a, server-b, server-c, server-d

    const merged = result.mergedConfig!;

    // Check merged server-a (conflict resolved with persona-wins + env merge)
    const serverA = merged.mcpServers["server-a"] as any;
    expect(serverA.command).toBe("persona-a"); // Persona wins
    expect(serverA.env).toEqual({
      BASE_A: "value-a", // Preserved from base
      PERSONA_A: "persona-value-a", // Added from persona
    });

    // Check preserved base servers
    expect(merged.mcpServers["server-b"]).toEqual(
      complexBase.mcpServers["server-b"]
    );
    expect(merged.mcpServers["server-c"]).toEqual(
      complexBase.mcpServers["server-c"]
    );

    // Check added persona server
    expect(merged.mcpServers["server-d"]).toEqual(
      complexPersona.mcpServers["server-d"]
    );
  });
});
