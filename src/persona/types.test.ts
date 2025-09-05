/**
 * PersonaTypes Test Suite
 *
 * Comprehensive tests for persona system types and interfaces,
 * including type validation, interface compliance, and enum values.
 */

import { describe, it, expect } from "vitest";
import {
  PersonaErrorCode,
  PersonaEvents,
  type PersonaToolset,
  type PersonaConfig,
  type PersonaAssets,
  type LoadedPersona,
  type PersonaDiscoveryResult,
  type PersonaReference,
  type ValidationResult,
  type PersonaValidationErrorInfo,
  type ActivationResult,
  type PersonaCacheConfig,
  type PersonaCacheStats,
  type PersonaDiscoveryConfig,
} from "./types.js";

describe("PersonaTypes", () => {
  describe("PersonaToolset Interface", () => {
    it("should define valid toolset structure", () => {
      const toolset: PersonaToolset = {
        name: "test-toolset",
        toolIds: ["git.status", "docker.ps", "filesystem.read"],
      };

      expect(toolset.name).toBe("test-toolset");
      expect(toolset.toolIds).toHaveLength(3);
      expect(toolset.toolIds[0]).toBe("git.status");
    });

    it("should allow empty toolIds array", () => {
      const toolset: PersonaToolset = {
        name: "empty-toolset",
        toolIds: [],
      };

      expect(toolset.name).toBe("empty-toolset");
      expect(toolset.toolIds).toHaveLength(0);
    });

    it("should require name and toolIds properties", () => {
      // This is a compile-time test - the types should enforce required properties
      const validToolset: PersonaToolset = {
        name: "valid",
        toolIds: ["tool1"],
      };

      expect(validToolset).toBeDefined();
      expect(validToolset.name).toBeDefined();
      expect(validToolset.toolIds).toBeDefined();
    });
  });

  describe("PersonaConfig Interface", () => {
    it("should define minimal valid configuration", () => {
      const config: PersonaConfig = {
        name: "minimal-persona",
        description: "A minimal persona configuration",
      };

      expect(config.name).toBe("minimal-persona");
      expect(config.description).toBe("A minimal persona configuration");
      expect(config.toolsets).toBeUndefined();
      expect(config.defaultToolset).toBeUndefined();
    });

    it("should support complete configuration with all fields", () => {
      const config: PersonaConfig = {
        name: "complete-persona",
        description: "A complete persona configuration",
        version: "1.0.0",
        toolsets: [
          {
            name: "development",
            toolIds: ["git.status", "npm.install"],
          },
          {
            name: "testing",
            toolIds: ["jest.run", "coverage.check"],
          },
        ],
        defaultToolset: "development",
        metadata: {
          author: "Test Author",
          tags: ["development", "testing"],
          created: "2024-01-01T00:00:00Z",
          lastModified: "2024-01-01T12:00:00Z",
        },
      };

      expect(config.name).toBe("complete-persona");
      expect(config.toolsets).toHaveLength(2);
      expect(config.defaultToolset).toBe("development");
      expect(config.metadata?.author).toBe("Test Author");
      expect(config.metadata?.tags).toContain("development");
    });

    it("should handle empty toolsets array", () => {
      const config: PersonaConfig = {
        name: "no-toolsets",
        description: "Persona with empty toolsets",
        toolsets: [],
      };

      expect(config.toolsets).toHaveLength(0);
    });

    it("should support optional metadata fields", () => {
      const configWithPartialMetadata: PersonaConfig = {
        name: "partial-metadata",
        description: "Persona with partial metadata",
        metadata: {
          author: "Test Author",
        },
      };

      expect(configWithPartialMetadata.metadata?.author).toBe("Test Author");
      expect(configWithPartialMetadata.metadata?.tags).toBeUndefined();
      expect(configWithPartialMetadata.metadata?.created).toBeUndefined();
    });
  });

  describe("PersonaAssets Interface", () => {
    it("should define minimal assets structure", () => {
      const assets: PersonaAssets = {
        configFile: "/path/to/persona.yaml",
      };

      expect(assets.configFile).toBe("/path/to/persona.yaml");
      expect(assets.mcpConfigFile).toBeUndefined();
      expect(assets.assetFiles).toBeUndefined();
      expect(assets.isArchived).toBeUndefined();
    });

    it("should support complete assets structure", () => {
      const assets: PersonaAssets = {
        configFile: "/path/to/persona.yaml",
        mcpConfigFile: "/path/to/mcp.json",
        assetFiles: ["/path/to/README.md", "/path/to/script.sh"],
        isArchived: false,
      };

      expect(assets.configFile).toBe("/path/to/persona.yaml");
      expect(assets.mcpConfigFile).toBe("/path/to/mcp.json");
      expect(assets.assetFiles).toHaveLength(2);
      expect(assets.isArchived).toBe(false);
    });

    it("should support archived persona assets", () => {
      const assets: PersonaAssets = {
        configFile: "/temp/extracted/persona.yaml",
        isArchived: true,
        archivePath: "/path/to/persona.htp",
      };

      expect(assets.isArchived).toBe(true);
      expect(assets.archivePath).toBe("/path/to/persona.htp");
    });
  });

  describe("LoadedPersona Interface", () => {
    it("should define complete loaded persona structure", () => {
      const loadedPersona: LoadedPersona = {
        config: {
          name: "test-persona",
          description: "Test persona",
        },
        assets: {
          configFile: "/path/to/persona.yaml",
        },
        validation: {
          isValid: true,
          errors: [],
          warnings: [],
        },
        loadedAt: new Date("2024-01-01T00:00:00Z"),
        sourcePath: "/path/to/persona",
      };

      expect(loadedPersona.config.name).toBe("test-persona");
      expect(loadedPersona.assets.configFile).toBe("/path/to/persona.yaml");
      expect(loadedPersona.validation.isValid).toBe(true);
      expect(loadedPersona.loadedAt.toISOString()).toBe(
        "2024-01-01T00:00:00.000Z"
      );
      expect(loadedPersona.sourcePath).toBe("/path/to/persona");
    });

    it("should support persona with MCP configuration", () => {
      const loadedPersona: LoadedPersona = {
        config: {
          name: "test-persona",
          description: "Test persona",
        },
        assets: {
          configFile: "/path/to/persona.yaml",
          mcpConfigFile: "/path/to/mcp.json",
        },
        mcpConfig: {
          mcpServers: {
            git: {
              command: "git-mcp",
              args: ["--stdio"],
            },
          },
        },
        validation: {
          isValid: true,
          errors: [],
          warnings: [],
        },
        loadedAt: new Date(),
        sourcePath: "/path/to/persona",
      };

      expect(loadedPersona.mcpConfig).toBeDefined();
      expect(loadedPersona.mcpConfig?.mcpServers.git.command).toBe("git-mcp");
    });
  });

  describe("PersonaDiscoveryResult Interface", () => {
    it("should define discovery result structure", () => {
      const discoveryResult: PersonaDiscoveryResult = {
        personas: [],
        errors: [],
        warnings: [],
        searchPaths: ["/home/user/.personas", "/etc/personas"],
      };

      expect(discoveryResult.personas).toHaveLength(0);
      expect(discoveryResult.errors).toHaveLength(0);
      expect(discoveryResult.warnings).toHaveLength(0);
      expect(discoveryResult.searchPaths).toContain("/home/user/.personas");
    });

    it("should support discovery result with personas and issues", () => {
      const discoveryResult: PersonaDiscoveryResult = {
        personas: [
          {
            name: "dev-persona",
            path: "/path/to/dev-persona",
            isArchive: false,
            description: "Development persona",
            isValid: true,
          },
        ],
        errors: ["Failed to read /invalid/path"],
        warnings: ["Persona 'old-persona' uses deprecated format"],
        searchPaths: ["/home/user/.personas"],
      };

      expect(discoveryResult.personas).toHaveLength(1);
      expect(discoveryResult.errors).toHaveLength(1);
      expect(discoveryResult.warnings).toHaveLength(1);
      expect(discoveryResult.personas[0].name).toBe("dev-persona");
    });
  });

  describe("PersonaReference Interface", () => {
    it("should define persona reference structure", () => {
      const reference: PersonaReference = {
        name: "ref-persona",
        path: "/path/to/ref-persona",
        isArchive: false,
        isValid: true,
      };

      expect(reference.name).toBe("ref-persona");
      expect(reference.path).toBe("/path/to/ref-persona");
      expect(reference.isArchive).toBe(false);
      expect(reference.isValid).toBe(true);
      expect(reference.description).toBeUndefined();
      expect(reference.issues).toBeUndefined();
    });

    it("should support reference with description and issues", () => {
      const reference: PersonaReference = {
        name: "invalid-persona",
        path: "/path/to/invalid-persona",
        isArchive: true,
        description: "A persona with issues",
        isValid: false,
        issues: ["Missing toolsets array", "Invalid name format"],
      };

      expect(reference.description).toBe("A persona with issues");
      expect(reference.isValid).toBe(false);
      expect(reference.issues).toHaveLength(2);
      expect(reference.issues?.[0]).toBe("Missing toolsets array");
    });
  });

  describe("ValidationResult Interface", () => {
    it("should define validation result structure", () => {
      const validResult: ValidationResult = {
        isValid: true,
        errors: [],
        warnings: [],
      };

      expect(validResult.isValid).toBe(true);
      expect(validResult.errors).toHaveLength(0);
      expect(validResult.warnings).toHaveLength(0);
    });

    it("should support validation result with errors and warnings", () => {
      const invalidResult: ValidationResult = {
        isValid: false,
        errors: [
          {
            type: "schema",
            field: "name",
            message: "Name must be in hyphen-delimited lowercase",
            suggestion: "Change name to 'my-persona' format",
            severity: "error",
          },
        ],
        warnings: [
          {
            type: "business",
            field: "defaultToolset",
            message: "Default toolset not specified",
            suggestion: "Consider setting a default toolset",
            severity: "warning",
          },
        ],
      };

      expect(invalidResult.isValid).toBe(false);
      expect(invalidResult.errors).toHaveLength(1);
      expect(invalidResult.warnings).toHaveLength(1);
      expect(invalidResult.errors[0].type).toBe("schema");
      expect(invalidResult.warnings[0].severity).toBe("warning");
    });
  });

  describe("PersonaValidationErrorInfo Interface", () => {
    it("should define validation error info structure", () => {
      const errorInfo: PersonaValidationErrorInfo = {
        type: "schema",
        field: "toolsets",
        message: "Toolsets must be an array",
        suggestion: "Ensure toolsets is defined as an array",
        severity: "error",
      };

      expect(errorInfo.type).toBe("schema");
      expect(errorInfo.field).toBe("toolsets");
      expect(errorInfo.severity).toBe("error");
    });

    it("should support error info without field", () => {
      const errorInfo: PersonaValidationErrorInfo = {
        type: "tool-resolution",
        message: "Failed to resolve tools",
        severity: "error",
      };

      expect(errorInfo.type).toBe("tool-resolution");
      expect(errorInfo.field).toBeUndefined();
      expect(errorInfo.suggestion).toBeUndefined();
    });

    it("should support all validation error types", () => {
      const schemaError: PersonaValidationErrorInfo = {
        type: "schema",
        message: "Schema validation failed",
        severity: "error",
      };

      const businessError: PersonaValidationErrorInfo = {
        type: "business",
        message: "Business rule violation",
        severity: "warning",
      };

      const toolResolutionError: PersonaValidationErrorInfo = {
        type: "tool-resolution",
        message: "Tool resolution failed",
        severity: "error",
      };

      const mcpConfigError: PersonaValidationErrorInfo = {
        type: "mcp-config",
        message: "MCP configuration error",
        severity: "error",
      };

      expect(schemaError.type).toBe("schema");
      expect(businessError.type).toBe("business");
      expect(toolResolutionError.type).toBe("tool-resolution");
      expect(mcpConfigError.type).toBe("mcp-config");
    });
  });

  describe("ActivationResult Interface", () => {
    it("should define successful activation result", () => {
      const result: ActivationResult = {
        success: true,
        personaName: "test-persona",
        activatedToolset: "development",
      };

      expect(result.success).toBe(true);
      expect(result.personaName).toBe("test-persona");
      expect(result.activatedToolset).toBe("development");
      expect(result.errors).toBeUndefined();
      expect(result.warnings).toBeUndefined();
    });

    it("should define failed activation result", () => {
      const result: ActivationResult = {
        success: false,
        personaName: "failed-persona",
        errors: ["Tool resolution failed", "MCP server not available"],
        warnings: ["Some tools may not work as expected"],
      };

      expect(result.success).toBe(false);
      expect(result.personaName).toBe("failed-persona");
      expect(result.errors).toHaveLength(2);
      expect(result.warnings).toHaveLength(1);
      expect(result.activatedToolset).toBeUndefined();
    });
  });

  describe("PersonaCacheConfig Interface", () => {
    it("should define cache configuration structure", () => {
      const config: PersonaCacheConfig = {
        ttl: 300000, // 5 minutes
        maxSize: 50,
        enableStats: true,
      };

      expect(config.ttl).toBe(300000);
      expect(config.maxSize).toBe(50);
      expect(config.enableStats).toBe(true);
    });

    it("should support minimal cache configuration", () => {
      const config: PersonaCacheConfig = {};

      expect(config.ttl).toBeUndefined();
      expect(config.maxSize).toBeUndefined();
      expect(config.enableStats).toBeUndefined();
    });
  });

  describe("PersonaCacheStats Interface", () => {
    it("should define cache statistics structure", () => {
      const stats: PersonaCacheStats = {
        hits: 150,
        misses: 25,
        size: 12,
        hitRate: 0.857,
        memoryUsage: 1024768,
      };

      expect(stats.hits).toBe(150);
      expect(stats.misses).toBe(25);
      expect(stats.size).toBe(12);
      expect(stats.hitRate).toBe(0.857);
      expect(stats.memoryUsage).toBe(1024768);
    });

    it("should support stats without memory usage", () => {
      const stats: PersonaCacheStats = {
        hits: 50,
        misses: 10,
        size: 5,
        hitRate: 0.833,
      };

      expect(stats.memoryUsage).toBeUndefined();
    });
  });

  describe("PersonaDiscoveryConfig Interface", () => {
    it("should define discovery configuration structure", () => {
      const config: PersonaDiscoveryConfig = {
        additionalPaths: ["/custom/path", "/another/path"],
        maxDepth: 3,
        followSymlinks: false,
        ignorePatterns: ["*.bak", "temp*"],
        parallelScan: true,
      };

      expect(config.additionalPaths).toHaveLength(2);
      expect(config.maxDepth).toBe(3);
      expect(config.followSymlinks).toBe(false);
      expect(config.ignorePatterns).toContain("*.bak");
      expect(config.parallelScan).toBe(true);
    });

    it("should support minimal discovery configuration", () => {
      const config: PersonaDiscoveryConfig = {};

      expect(config.additionalPaths).toBeUndefined();
      expect(config.maxDepth).toBeUndefined();
      expect(config.followSymlinks).toBeUndefined();
      expect(config.ignorePatterns).toBeUndefined();
      expect(config.parallelScan).toBeUndefined();
    });
  });

  describe("PersonaErrorCode Enum", () => {
    it("should define all expected error codes", () => {
      const expectedCodes = [
        "PERSONA_NOT_FOUND",
        "INVALID_SCHEMA",
        "VALIDATION_FAILED",
        "ACTIVATION_FAILED",
        "TOOLSET_NOT_FOUND",
        "TOOL_RESOLUTION_FAILED",
        "MCP_CONFIG_CONFLICT",
        "FILE_SYSTEM_ERROR",
        "YAML_PARSE_ERROR",
        "PERMISSION_DENIED",
        "DUPLICATE_PERSONA_NAME",
        "ARCHIVE_EXTRACTION_FAILED",
      ];

      expectedCodes.forEach((code) => {
        expect(PersonaErrorCode[code as keyof typeof PersonaErrorCode]).toBe(
          code
        );
      });
    });

    it("should have correct number of error codes", () => {
      const codeCount = Object.keys(PersonaErrorCode).length;
      expect(codeCount).toBe(12);
    });

    it("should use consistent naming convention", () => {
      Object.values(PersonaErrorCode).forEach((code) => {
        // Should be all uppercase with underscores
        expect(code).toMatch(/^[A-Z][A-Z_]*[A-Z]$/);
        // Should not start or end with underscore
        expect(code).not.toMatch(/^_|_$/);
      });
    });
  });

  describe("PersonaEvents Enum", () => {
    it("should define all expected event names", () => {
      const expectedEvents = [
        "persona:activated",
        "persona:deactivated",
        "persona:discovered",
        "persona:validation:failed",
        "persona:toolset:changed",
      ];

      expectedEvents.forEach((event) => {
        const enumKey = Object.keys(PersonaEvents).find(
          (key) => PersonaEvents[key as keyof typeof PersonaEvents] === event
        );
        expect(enumKey).toBeDefined();
        expect(PersonaEvents[enumKey as keyof typeof PersonaEvents]).toBe(
          event
        );
      });
    });

    it("should have correct number of events", () => {
      const eventCount = Object.keys(PersonaEvents).length;
      expect(eventCount).toBe(5);
    });

    it("should use consistent naming convention", () => {
      Object.values(PersonaEvents).forEach((event) => {
        // Should follow the pattern "persona:action" or "persona:category:action"
        expect(event).toMatch(/^persona:[a-z]+(?::[a-z]+)*$/);
        // Should start with "persona:"
        expect(event).toMatch(/^persona:/);
      });
    });
  });

  describe("Type Compatibility", () => {
    it("should support creating minimal valid configurations", () => {
      // Test that the types work together in real-world scenarios
      const config: PersonaConfig = {
        name: "integration-test",
        description: "Integration test persona",
      };

      const assets: PersonaAssets = {
        configFile: "/path/to/config.yaml",
      };

      const validation: ValidationResult = {
        isValid: true,
        errors: [],
        warnings: [],
      };

      const loadedPersona: LoadedPersona = {
        config,
        assets,
        validation,
        loadedAt: new Date(),
        sourcePath: "/path/to/persona",
      };

      expect(loadedPersona.config).toBe(config);
      expect(loadedPersona.assets).toBe(assets);
      expect(loadedPersona.validation).toBe(validation);
    });

    it("should support creating complex configurations", () => {
      const complexConfig: PersonaConfig = {
        name: "complex-integration-test",
        description: "Complex integration test persona",
        version: "2.0.0",
        toolsets: [
          {
            name: "primary",
            toolIds: ["server.tool1", "server.tool2"],
          },
          {
            name: "secondary",
            toolIds: ["other.tool1"],
          },
        ],
        defaultToolset: "primary",
        metadata: {
          author: "Test Suite",
          tags: ["integration", "complex"],
          created: "2024-01-01T00:00:00Z",
          lastModified: "2024-01-02T00:00:00Z",
        },
      };

      const complexAssets: PersonaAssets = {
        configFile: "/path/to/config.yaml",
        mcpConfigFile: "/path/to/mcp.json",
        assetFiles: ["/path/to/doc.md", "/path/to/script.sh"],
        isArchived: false,
      };

      const complexValidation: ValidationResult = {
        isValid: true,
        errors: [],
        warnings: [
          {
            type: "business",
            message: "Consider adding more tools",
            severity: "warning",
          },
        ],
      };

      const complexLoadedPersona: LoadedPersona = {
        config: complexConfig,
        assets: complexAssets,
        validation: complexValidation,
        loadedAt: new Date(),
        sourcePath: "/path/to/complex",
      };

      expect(complexLoadedPersona.config.toolsets).toHaveLength(2);
      expect(complexLoadedPersona.assets.assetFiles).toHaveLength(2);
      expect(complexLoadedPersona.validation.warnings).toHaveLength(1);
    });
  });

  describe("Interface Extensibility", () => {
    it("should allow extending interfaces where appropriate", () => {
      // Test that optional fields work correctly
      interface ExtendedPersonaConfig extends PersonaConfig {
        customField?: string;
      }

      const extendedConfig: ExtendedPersonaConfig = {
        name: "extended-test",
        description: "Extended test persona",
        customField: "custom value",
      };

      expect(extendedConfig.name).toBe("extended-test");
      expect(extendedConfig.customField).toBe("custom value");
    });

    it("should maintain type safety with required fields", () => {
      // This test ensures that required fields are enforced
      const validConfig: PersonaConfig = {
        name: "required-test",
        description: "Test with all required fields",
      };

      expect(validConfig.name).toBeDefined();
      expect(validConfig.description).toBeDefined();
    });
  });
});
