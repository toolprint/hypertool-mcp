/**
 * PersonaValidator Test Suite
 *
 * Comprehensive tests for multi-layer persona validation system, including
 * schema validation, business rules, tool resolution, MCP config validation,
 * and integration with discovery engines.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { promises as fs } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  PersonaValidator,
  createPersonaValidator,
  validatePersona,
  validateMultiplePersonas,
  type ValidationContext,
  type ValidationOptions,
} from "./validator.js";
import type { PersonaConfig, ValidationResult } from "./types.js";
import type {
  IToolDiscoveryEngine,
  AvailableToolInfo,
} from "../discovery/types.js";

// Mock tool discovery engine for testing
const createMockToolDiscoveryEngine = (
  availableTools: AvailableToolInfo[] = []
): IToolDiscoveryEngine => ({
  getAvailableTools: vi
    .fn()
    .mockImplementation((connectedOnly: boolean = true) =>
      connectedOnly
        ? availableTools.filter((tool) => tool.isConnected)
        : availableTools
    ),
  discoverTools: vi.fn().mockResolvedValue(availableTools),
  isToolAvailable: vi
    .fn()
    .mockImplementation((toolId: string) =>
      availableTools.some((tool) => tool.namespacedName === toolId)
    ),
  clearCache: vi.fn(),
  getStats: vi.fn().mockReturnValue({}),
});

describe("PersonaValidator", () => {
  let tempDir: string;
  let validator: PersonaValidator;
  let mockToolEngine: IToolDiscoveryEngine;

  beforeEach(async () => {
    // Create temporary directory for test files
    tempDir = await fs.mkdtemp(join(tmpdir(), "persona-validator-test-"));

    // Create mock tool discovery engine with some tools
    const mockTools: AvailableToolInfo[] = [
      {
        namespacedName: "git.status",
        toolName: "status",
        serverName: "git",
        description: "Get git status",
        schema: {},
        sourceType: "mcp-server",
        isConnected: true,
        lastSeen: new Date(),
      },
      {
        namespacedName: "git.add",
        toolName: "add",
        serverName: "git",
        description: "Add files to git",
        schema: {},
        sourceType: "mcp-server",
        isConnected: true,
        lastSeen: new Date(),
      },
      {
        namespacedName: "docker.ps",
        toolName: "ps",
        serverName: "docker",
        description: "List docker containers",
        schema: {},
        sourceType: "mcp-server",
        isConnected: true,
        lastSeen: new Date(),
      },
      {
        namespacedName: "offline.tool",
        toolName: "tool",
        serverName: "offline",
        description: "Tool from disconnected server",
        schema: {},
        sourceType: "mcp-server",
        isConnected: false,
        lastSeen: new Date(),
      },
    ];

    mockToolEngine = createMockToolDiscoveryEngine(mockTools);
    validator = new PersonaValidator(mockToolEngine);
  });

  afterEach(async () => {
    // Clean up temporary files
    try {
      await fs.rmdir(tempDir, { recursive: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("PersonaValidator Class", () => {
    describe("validatePersonaConfig", () => {
      it("should validate a valid persona configuration", async () => {
        const config: PersonaConfig = {
          name: "test-persona",
          description: "A valid test persona configuration",
          toolsets: [
            {
              name: "development",
              toolIds: ["git.status", "git.add"],
            },
          ],
          defaultToolset: "development",
        };

        const context: ValidationContext = {
          personaPath: "/test/path",
          expectedPersonaName: "test-persona",
        };

        const result = await validator.validatePersonaConfig(config, context);

        expect(result.isValid).toBe(true);
        expect(result.errors).toHaveLength(0);
        expect(result.warnings).toHaveLength(0);
      });

      it("should detect name mismatch business rule violation", async () => {
        const config: PersonaConfig = {
          name: "wrong-name",
          description: "A persona with wrong name",
        };

        const context: ValidationContext = {
          personaPath: "/test/correct-name",
          expectedPersonaName: "correct-name",
        };

        const result = await validator.validatePersonaConfig(config, context);

        expect(result.isValid).toBe(false);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].type).toBe("business");
        expect(result.errors[0].field).toBe("name");
        expect(result.errors[0].message).toContain(
          "does not match folder name"
        );
      });

      it("should detect invalid default toolset", async () => {
        const config: PersonaConfig = {
          name: "test-persona",
          description: "A persona with invalid default toolset",
          toolsets: [
            {
              name: "development",
              toolIds: ["git.status"],
            },
          ],
          defaultToolset: "non-existent",
        };

        const context: ValidationContext = {
          personaPath: "/test/path",
        };

        const result = await validator.validatePersonaConfig(config, context);

        expect(result.isValid).toBe(false);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].type).toBe("business");
        expect(result.errors[0].field).toBe("defaultToolset");
        expect(result.errors[0].message).toContain(
          "not defined in the toolsets array"
        );
      });

      it("should warn about similar toolset names", async () => {
        const config: PersonaConfig = {
          name: "test-persona",
          description: "A persona with similar toolset names",
          toolsets: [
            {
              name: "dev",
              toolIds: ["git.status"],
            },
            {
              name: "devel", // Similar to "dev"
              toolIds: ["git.add"],
            },
          ],
        };

        const context: ValidationContext = {
          personaPath: "/test/path",
        };

        const result = await validator.validatePersonaConfig(config, context);

        expect(result.isValid).toBe(true);
        expect(result.warnings).toHaveLength(1);
        expect(result.warnings[0].type).toBe("business");
        expect(result.warnings[0].message).toContain(
          "very similar and may be confusing"
        );
      });

      it("should warn when no toolsets are defined", async () => {
        const config: PersonaConfig = {
          name: "test-persona",
          description: "A persona without toolsets",
        };

        const context: ValidationContext = {
          personaPath: "/test/path",
        };

        const result = await validator.validatePersonaConfig(config, context);

        expect(result.isValid).toBe(true);
        expect(result.warnings).toHaveLength(1);
        expect(result.warnings[0].type).toBe("business");
        expect(result.warnings[0].message).toContain("No toolsets defined");
      });

      it("should validate tool resolution", async () => {
        const config: PersonaConfig = {
          name: "test-persona",
          description: "A persona with tool resolution issues",
          toolsets: [
            {
              name: "development",
              toolIds: ["git.status", "non.existent", "offline.tool"],
            },
          ],
        };

        const context: ValidationContext = {
          personaPath: "/test/path",
          toolDiscoveryEngine: mockToolEngine,
        };

        const result = await validator.validatePersonaConfig(config, context);

        expect(result.isValid).toBe(false);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].type).toBe("tool-resolution");
        expect(result.errors[0].message).toContain("non.existent");

        expect(result.warnings).toHaveLength(1);
        expect(result.warnings[0].type).toBe("tool-resolution");
        expect(result.warnings[0].message).toContain("offline.tool");
      });

      it("should skip tool resolution when no discovery engine provided", async () => {
        const config: PersonaConfig = {
          name: "test-persona",
          description: "A persona without tool validation",
          toolsets: [
            {
              name: "development",
              toolIds: ["non.existent"],
            },
          ],
        };

        const context: ValidationContext = {
          personaPath: "/test/path",
        };

        // Create validator without tool discovery engine
        const validatorNoTool = new PersonaValidator();
        const result = await validatorNoTool.validatePersonaConfig(
          config,
          context
        );

        // Should be valid since tool resolution is skipped
        expect(result.isValid).toBe(true);
      });

      it("should handle custom validators", async () => {
        const config: PersonaConfig = {
          name: "test-persona",
          description: "A persona for custom validation testing",
        };

        const context: ValidationContext = {
          personaPath: "/test/path",
        };

        const customValidator = (config: PersonaConfig): ValidationResult => ({
          isValid: false,
          errors: [
            {
              type: "business",
              message: "Custom validation failed",
              severity: "error",
            },
          ],
          warnings: [
            {
              type: "business",
              message: "Custom warning",
              severity: "warning",
            },
          ],
        });

        const options: ValidationOptions = {
          customValidators: [customValidator],
        };

        const result = await validator.validatePersonaConfig(
          config,
          context,
          options
        );

        expect(result.isValid).toBe(false);
        expect(
          result.errors.some((e) =>
            e.message.includes("Custom validation failed")
          )
        ).toBe(true);
        expect(
          result.warnings.some((w) => w.message.includes("Custom warning"))
        ).toBe(true);
      });

      it("should handle custom validator exceptions", async () => {
        const config: PersonaConfig = {
          name: "test-persona",
          description: "A persona for exception testing",
        };

        const context: ValidationContext = {
          personaPath: "/test/path",
        };

        const throwingValidator = (): ValidationResult => {
          throw new Error("Custom validator error");
        };

        const options: ValidationOptions = {
          customValidators: [throwingValidator],
        };

        const result = await validator.validatePersonaConfig(
          config,
          context,
          options
        );

        expect(result.isValid).toBe(false);
        expect(
          result.errors.some((e) =>
            e.message.includes("Custom validation failed")
          )
        ).toBe(true);
      });

      it("should stop on first error when requested", async () => {
        const config: PersonaConfig = {
          name: "wrong-name",
          description: "A persona with multiple issues",
          toolsets: [
            {
              name: "development",
              toolIds: ["non.existent"],
            },
          ],
          defaultToolset: "non-existent-toolset",
        };

        const context: ValidationContext = {
          personaPath: "/test/correct-name",
          expectedPersonaName: "correct-name",
        };

        const options: ValidationOptions = {
          stopOnFirstError: true,
        };

        const result = await validator.validatePersonaConfig(
          config,
          context,
          options
        );

        expect(result.isValid).toBe(false);
        // Should only have business rule errors, not tool resolution errors
        expect(result.errors.length).toBeGreaterThan(0);
        expect(result.errors.every((e) => e.type === "business")).toBe(true);
      });
    });

    describe("validatePersonaFile", () => {
      it("should validate a valid persona file", async () => {
        const personaPath = join(tempDir, "valid-persona.yaml");
        const yamlContent = `
name: valid-persona
description: A valid persona configuration for file testing
toolsets:
  - name: development
    toolIds: ["git.status", "git.add"]
defaultToolset: development
`;
        await fs.writeFile(personaPath, yamlContent);

        const result = await validator.validatePersonaFile(personaPath);

        expect(result.isValid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it("should handle invalid YAML syntax", async () => {
        const personaPath = join(tempDir, "invalid.yaml");
        const yamlContent = "invalid yaml: [unclosed bracket";
        await fs.writeFile(personaPath, yamlContent);

        const result = await validator.validatePersonaFile(personaPath);

        expect(result.isValid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
        expect(result.errors[0].type).toBe("schema");
      });

      it("should handle non-existent files", async () => {
        const personaPath = join(tempDir, "non-existent.yaml");

        const result = await validator.validatePersonaFile(personaPath);

        expect(result.isValid).toBe(false);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].message).toContain("Failed to validate file");
      });

      it("should find and validate MCP config", async () => {
        const personaDir = join(tempDir, "persona-with-mcp");
        await fs.mkdir(personaDir);

        const personaPath = join(personaDir, "persona.yaml");
        const yamlContent = `
name: persona-with-mcp
description: A persona with MCP configuration
`;
        await fs.writeFile(personaPath, yamlContent);

        const mcpPath = join(personaDir, "mcp.json");
        const mcpContent = `{
  "mcpServers": {
    "git": {
      "type": "stdio",
      "command": "git-mcp"
    }
  }
}`;
        await fs.writeFile(mcpPath, mcpContent);

        const result = await validator.validatePersonaFile(personaPath);

        expect(result.isValid).toBe(true);
        // Should not have MCP config errors
        expect(
          result.errors.filter((e) => e.type === "mcp-config")
        ).toHaveLength(0);
      });

      it("should handle invalid MCP config", async () => {
        const personaDir = join(tempDir, "persona-bad-mcp");
        await fs.mkdir(personaDir);

        const personaPath = join(personaDir, "persona.yaml");
        const yamlContent = `
name: persona-bad-mcp
description: A persona with bad MCP configuration
`;
        await fs.writeFile(personaPath, yamlContent);

        const mcpPath = join(personaDir, "mcp.json");
        const mcpContent = "invalid json";
        await fs.writeFile(mcpPath, mcpContent);

        const result = await validator.validatePersonaFile(personaPath);

        expect(result.isValid).toBe(false);
        expect(result.errors.some((e) => e.type === "mcp-config")).toBe(true);
      });
    });

    describe("validatePersonaDirectory", () => {
      it("should validate a persona directory", async () => {
        const personaDir = join(tempDir, "valid-directory-persona");
        await fs.mkdir(personaDir);

        const personaPath = join(personaDir, "persona.yaml");
        const yamlContent = `
name: valid-directory-persona
description: A valid persona in directory form
`;
        await fs.writeFile(personaPath, yamlContent);

        const result = await validator.validatePersonaDirectory(personaDir);

        expect(result.isValid).toBe(true);
      });

      it("should handle directory without persona config", async () => {
        const personaDir = join(tempDir, "no-config-dir");
        await fs.mkdir(personaDir);
        await fs.writeFile(
          join(personaDir, "other.txt"),
          "not a persona config"
        );

        const result = await validator.validatePersonaDirectory(personaDir);

        expect(result.isValid).toBe(false);
        expect(result.errors[0].message).toContain(
          "No persona configuration file found"
        );
      });

      it("should handle non-existent directory", async () => {
        const personaDir = join(tempDir, "non-existent");

        const result = await validator.validatePersonaDirectory(personaDir);

        expect(result.isValid).toBe(false);
        expect(result.errors[0].message).toContain(
          "Failed to validate directory"
        );
      });
    });

    describe("MCP Config Validation", () => {
      it("should validate valid MCP configuration", async () => {
        const mcpPath = join(tempDir, "valid-mcp.json");
        const mcpContent = `{
  "mcpServers": {
    "git": {
      "type": "stdio",
      "command": "git-mcp",
      "args": ["--stdio"]
    },
    "docker": {
      "type": "http",
      "url": "http://localhost:8080"
    },
    "extension": {
      "type": "dxt-extension",
      "path": "./extension.dxt"
    }
  }
}`;
        await fs.writeFile(mcpPath, mcpContent);

        // Access private method for testing
        const result = await (validator as any).validateMcpConfig(mcpPath);

        expect(result.isValid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it("should detect invalid JSON", async () => {
        const mcpPath = join(tempDir, "invalid-mcp.json");
        const mcpContent = "invalid json {";
        await fs.writeFile(mcpPath, mcpContent);

        const result = await (validator as any).validateMcpConfig(mcpPath);

        expect(result.isValid).toBe(false);
        expect(result.errors[0].type).toBe("mcp-config");
        expect(result.errors[0].message).toContain("Invalid JSON");
      });

      it("should detect missing mcpServers", async () => {
        const mcpPath = join(tempDir, "no-servers-mcp.json");
        const mcpContent = '{"other": "field"}';
        await fs.writeFile(mcpPath, mcpContent);

        const result = await (validator as any).validateMcpConfig(mcpPath);

        expect(result.isValid).toBe(false);
        expect(result.errors[0].field).toBe("mcpServers");
      });

      it("should validate transport types", async () => {
        const mcpPath = join(tempDir, "bad-transport-mcp.json");
        const mcpContent = `{
  "mcpServers": {
    "bad": {
      "type": "invalid-transport",
      "command": "test"
    }
  }
}`;
        await fs.writeFile(mcpPath, mcpContent);

        const result = await (validator as any).validateMcpConfig(mcpPath);

        expect(result.isValid).toBe(false);
        expect(result.errors[0].message).toContain("Invalid transport type");
      });

      it("should validate required fields for stdio transport", async () => {
        const mcpPath = join(tempDir, "stdio-no-command.json");
        const mcpContent = `{
  "mcpServers": {
    "git": {
      "type": "stdio"
    }
  }
}`;
        await fs.writeFile(mcpPath, mcpContent);

        const result = await (validator as any).validateMcpConfig(mcpPath);

        expect(result.isValid).toBe(false);
        expect(result.errors[0].field).toContain("command");
      });

      it("should validate required fields for http transport", async () => {
        const mcpPath = join(tempDir, "http-no-url.json");
        const mcpContent = `{
  "mcpServers": {
    "api": {
      "type": "http"
    }
  }
}`;
        await fs.writeFile(mcpPath, mcpContent);

        const result = await (validator as any).validateMcpConfig(mcpPath);

        expect(result.isValid).toBe(false);
        expect(result.errors[0].field).toContain("url");
      });

      it("should warn about common server names", async () => {
        const mcpPath = join(tempDir, "common-names-mcp.json");
        const mcpContent = `{
  "mcpServers": {
    "git": {
      "type": "stdio",
      "command": "git-mcp"
    },
    "filesystem": {
      "type": "stdio",
      "command": "fs-mcp"
    }
  }
}`;
        await fs.writeFile(mcpPath, mcpContent);

        const result = await (validator as any).validateMcpConfig(mcpPath);

        expect(result.isValid).toBe(true);
        expect(result.warnings.length).toBeGreaterThanOrEqual(1);
        expect(
          result.warnings.some((w) => w.message.includes("commonly used"))
        ).toBe(true);
      });
    });

    describe("Utility Methods", () => {
      it("should set tool discovery engine", () => {
        const newValidator = new PersonaValidator();
        const mockEngine = createMockToolDiscoveryEngine();

        newValidator.setToolDiscoveryEngine(mockEngine);

        const stats = newValidator.getValidationStats();
        expect(stats.hasToolDiscoveryEngine).toBe(true);
      });

      it("should provide validation statistics", () => {
        const stats = validator.getValidationStats();

        expect(stats.hasToolDiscoveryEngine).toBe(true);
        expect(stats.supportedFileTypes).toContain("persona.yaml");
        expect(stats.supportedFileTypes).toContain("persona.yml");
        expect(stats.validationLayers).toContain("YAML Syntax & Schema");
        expect(stats.validationLayers).toContain("Business Rules");
        expect(stats.validationLayers).toContain("Tool Resolution");
        expect(stats.validationLayers).toContain("MCP Configuration");
      });

      it("should detect similar names correctly", () => {
        // Test private method
        const areNamesSimilar = (validator as any).areNamesSimilar;

        expect(areNamesSimilar("dev", "devel")).toBe(true);
        expect(areNamesSimilar("test", "testing")).toBe(false);
        expect(areNamesSimilar("api-v1", "api-v2")).toBe(true);
        expect(areNamesSimilar("frontend", "backend")).toBe(false);
      });
    });

    describe("Options Handling", () => {
      it("should respect includeWarnings option", async () => {
        const config: PersonaConfig = {
          name: "test-persona",
          description: "A persona without toolsets",
        };

        const context: ValidationContext = {
          personaPath: "/test/path",
        };

        // With warnings
        const resultWithWarnings = await validator.validatePersonaConfig(
          config,
          context,
          {
            includeWarnings: true,
          }
        );

        // Without warnings
        const resultWithoutWarnings = await validator.validatePersonaConfig(
          config,
          context,
          {
            includeWarnings: false,
          }
        );

        expect(resultWithWarnings.warnings.length).toBeGreaterThan(0);
        expect(resultWithoutWarnings.warnings).toHaveLength(0);
      });

      it("should respect checkToolAvailability option", async () => {
        const config: PersonaConfig = {
          name: "test-persona",
          description: "A persona with unavailable tools",
          toolsets: [
            {
              name: "development",
              toolIds: ["non.existent"],
            },
          ],
        };

        const context: ValidationContext = {
          personaPath: "/test/path",
        };

        // With tool checking
        const resultWithCheck = await validator.validatePersonaConfig(
          config,
          context,
          {
            checkToolAvailability: true,
          }
        );

        // Without tool checking
        const resultWithoutCheck = await validator.validatePersonaConfig(
          config,
          context,
          {
            checkToolAvailability: false,
          }
        );

        expect(
          resultWithCheck.errors.some((e) => e.type === "tool-resolution")
        ).toBe(true);
        expect(
          resultWithoutCheck.errors.some((e) => e.type === "tool-resolution")
        ).toBe(false);
      });
    });
  });

  describe("Factory Functions", () => {
    describe("createPersonaValidator", () => {
      it("should create validator without tool discovery engine", () => {
        const createdValidator = createPersonaValidator();
        const stats = createdValidator.getValidationStats();

        expect(stats.hasToolDiscoveryEngine).toBe(false);
      });

      it("should create validator with tool discovery engine", () => {
        const mockEngine = createMockToolDiscoveryEngine();
        const createdValidator = createPersonaValidator(mockEngine);
        const stats = createdValidator.getValidationStats();

        expect(stats.hasToolDiscoveryEngine).toBe(true);
      });
    });

    describe("validatePersona", () => {
      it("should validate persona file", async () => {
        const personaPath = join(tempDir, "quick-test.yaml");
        const yamlContent = `
name: quick-test
description: A persona for quick validation testing
`;
        await fs.writeFile(personaPath, yamlContent);

        const result = await validatePersona(personaPath);

        expect(result.isValid).toBe(true);
      });

      it("should validate persona directory", async () => {
        const personaDir = join(tempDir, "quick-dir-test");
        await fs.mkdir(personaDir);

        const personaPath = join(personaDir, "persona.yaml");
        const yamlContent = `
name: quick-dir-test
description: A persona directory for quick validation testing
`;
        await fs.writeFile(personaPath, yamlContent);

        const result = await validatePersona(personaDir);

        expect(result.isValid).toBe(true);
      });
    });

    describe("validateMultiplePersonas", () => {
      it("should validate multiple personas", async () => {
        // Create multiple test personas
        const personas = [
          { name: "persona1", valid: true },
          { name: "persona2", valid: false },
          { name: "persona3", valid: true },
        ];

        const paths: string[] = [];

        for (const persona of personas) {
          const personaPath = join(tempDir, `${persona.name}.yaml`);
          const yamlContent = persona.valid
            ? `name: ${persona.name}\ndescription: Valid persona ${persona.name}`
            : `name: ${persona.name}\ndescription: Short`; // Too short description

          await fs.writeFile(personaPath, yamlContent);
          paths.push(personaPath);
        }

        const results = await validateMultiplePersonas(paths);

        expect(results.size).toBe(3);
        expect(results.get(paths[0])?.isValid).toBe(true);
        expect(results.get(paths[1])?.isValid).toBe(false);
        expect(results.get(paths[2])?.isValid).toBe(true);
      });

      it("should handle validation failures gracefully", async () => {
        const paths = ["/non/existent/path1.yaml", "/non/existent/path2.yaml"];

        const results = await validateMultiplePersonas(paths);

        expect(results.size).toBe(2);
        expect(results.get(paths[0])?.isValid).toBe(false);
        expect(results.get(paths[1])?.isValid).toBe(false);
      });
    });
  });

  describe("Error Handling", () => {
    it("should handle tool discovery engine failures", async () => {
      const faultyEngine = {
        ...mockToolEngine,
        getAvailableTools: vi.fn().mockImplementation(() => {
          throw new Error("Discovery engine failure");
        }),
      };

      const config: PersonaConfig = {
        name: "test-persona",
        description: "A persona for testing engine failures",
        toolsets: [
          {
            name: "development",
            toolIds: ["git.status"],
          },
        ],
      };

      const context: ValidationContext = {
        personaPath: "/test/path",
        toolDiscoveryEngine: faultyEngine,
      };

      const result = await validator.validatePersonaConfig(config, context);

      expect(result.isValid).toBe(false);
      expect(
        result.errors.some(
          (e) =>
            e.type === "tool-resolution" &&
            e.message.includes("Failed to validate tool availability")
        )
      ).toBe(true);
    });

    it("should handle MCP config file reading failures", async () => {
      const config: PersonaConfig = {
        name: "test-persona",
        description: "A persona for testing MCP failures",
      };

      const context: ValidationContext = {
        personaPath: "/test/path",
        assets: {
          configFile: "/test/path/persona.yaml",
          mcpConfigFile: "/non/existent/mcp.json",
        },
      };

      const result = await validator.validatePersonaConfig(config, context);

      // Should be treated as warning, not error
      expect(result.isValid).toBe(true);
      expect(result.warnings.some((w) => w.type === "mcp-config")).toBe(true);
    });

    it("should handle general validation exceptions", async () => {
      const config: PersonaConfig = {
        name: "test-persona",
        description: "A persona for testing exceptions",
      };

      // Mock context that might cause issues
      const context: ValidationContext = {
        personaPath: "/test/path",
      };

      // Mock validator methods to throw
      const throwingValidator = new PersonaValidator();
      (throwingValidator as any).validateBusinessRules = vi
        .fn()
        .mockImplementation(() => {
          throw new Error("Validation exception");
        });

      const result = await throwingValidator.validatePersonaConfig(
        config,
        context
      );

      expect(result.isValid).toBe(false);
      expect(
        result.errors.some((e) => e.message.includes("Validation failed"))
      ).toBe(true);
    });
  });

  describe("Integration Tests", () => {
    it("should perform end-to-end validation", async () => {
      // Create a complete persona setup
      const personaDir = join(tempDir, "complete-persona");
      await fs.mkdir(personaDir);

      const personaPath = join(personaDir, "persona.yaml");
      const yamlContent = `
name: complete-persona
description: A complete persona for end-to-end testing
toolsets:
  - name: development
    toolIds: ["git.status", "git.add", "docker.ps"]
  - name: testing
    toolIds: ["git.status"]
defaultToolset: development
metadata:
  author: Test Suite
  tags: ["integration", "testing"]
`;
      await fs.writeFile(personaPath, yamlContent);

      const mcpPath = join(personaDir, "mcp.json");
      const mcpContent = `{
  "mcpServers": {
    "git": {
      "type": "stdio",
      "command": "git-mcp",
      "args": ["--stdio"]
    },
    "docker": {
      "type": "stdio",
      "command": "docker-mcp",
      "args": ["--stdio"]
    }
  }
}`;
      await fs.writeFile(mcpPath, mcpContent);

      const result = await validator.validatePersonaDirectory(personaDir);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      // May have warnings about common server names
    });
  });
});
