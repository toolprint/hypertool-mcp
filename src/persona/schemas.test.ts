/**
 * PersonaSchemas Test Suite
 *
 * Comprehensive tests for Zod schemas used in persona configuration validation,
 * including structure validation, format requirements, business rules, and
 * error message generation.
 */

import { describe, it, expect } from "vitest";
import {
  PersonaNameSchema,
  ToolIdSchema,
  PersonaToolsetSchema,
  PersonaMetadataSchema,
  PersonaConfigSchema,
  validatePersonaConfig,
  validatePersonaToolsets,
  createValidationErrorSummary,
  SUPPORTED_PERSONA_FILES,
  isSupportedPersonaFile,
  extractPersonaNameFromPath,
  type PersonaConfigData,
  type PersonaToolsetData,
  type PersonaMetadataData,
  type SchemaValidationResult,
} from "./schemas.js";

describe("PersonaSchemas", () => {
  describe("PersonaNameSchema", () => {
    describe("Valid Names", () => {
      const validNames = [
        "dev",
        "dev-tools",
        "backend-api",
        "frontend-dev",
        "test-automation",
        "db-admin",
        "kubernetes-ops",
        "full-stack-dev",
        "api-testing",
        "data-science",
        "web-dev",
        "mobile-dev",
        "devops-pipeline",
        "security-audit",
        "performance-test",
      ];

      validNames.forEach((name) => {
        it(`should accept valid name: ${name}`, () => {
          const result = PersonaNameSchema.safeParse(name);
          expect(result.success).toBe(true);
        });
      });
    });

    describe("Invalid Names", () => {
      const invalidNames = [
        { name: "", error: "too_small" },
        { name: "a", error: "too_small" },
        { name: "DevTools", error: "invalid_string" },
        { name: "dev_tools", error: "invalid_string" },
        { name: "dev tools", error: "invalid_string" },
        { name: "dev--tools", error: "custom" }, // consecutive hyphens
        { name: "-dev-tools", error: "invalid_string" },
        { name: "dev-tools-", error: "invalid_string" },
        { name: "dev.tools", error: "invalid_string" },
        { name: "123-dev", error: "invalid_string" },
        { name: "dev@tools", error: "invalid_string" },
        { name: "a".repeat(64), error: "too_big" }, // too long
      ];

      invalidNames.forEach(({ name, error }) => {
        it(`should reject invalid name: "${name}" (${error})`, () => {
          const result = PersonaNameSchema.safeParse(name);
          expect(result.success).toBe(false);
          if (!result.success) {
            expect(result.error.issues[0].code).toBe(error);
          }
        });
      });
    });

    describe("Edge Cases", () => {
      it("should handle minimum valid length", () => {
        const result = PersonaNameSchema.safeParse("ab");
        expect(result.success).toBe(true);
      });

      it("should handle maximum valid length", () => {
        const longName = "a" + "b".repeat(61); // 63 characters total
        const result = PersonaNameSchema.safeParse(longName);
        expect(result.success).toBe(true);
      });

      it("should reject null and undefined", () => {
        expect(PersonaNameSchema.safeParse(null).success).toBe(false);
        expect(PersonaNameSchema.safeParse(undefined).success).toBe(false);
      });

      it("should reject numbers and objects", () => {
        expect(PersonaNameSchema.safeParse(123).success).toBe(false);
        expect(PersonaNameSchema.safeParse({}).success).toBe(false);
        expect(PersonaNameSchema.safeParse([]).success).toBe(false);
      });
    });
  });

  describe("ToolIdSchema", () => {
    describe("Valid Tool IDs", () => {
      const validToolIds = [
        "git.status",
        "docker.ps",
        "npm.install",
        "kubernetes.deploy",
        "terraform.apply",
        "linear.create-issue",
        "github.create-pr",
        "jira.create-ticket",
        "slack.send-message",
        "database.query",
        "redis.get",
        "elasticsearch.search",
        "monitoring.check-health",
        "backup.create-snapshot",
        "ci.run-pipeline",
      ];

      validToolIds.forEach((toolId) => {
        it(`should accept valid tool ID: ${toolId}`, () => {
          const result = ToolIdSchema.safeParse(toolId);
          expect(result.success).toBe(true);
        });
      });
    });

    describe("Invalid Tool IDs", () => {
      const invalidToolIds = [
        { id: "", error: "too_small" },
        { id: "ab", error: "too_small" },
        { id: "git", error: "invalid_string" }, // missing dot
        { id: "git.", error: "invalid_string" }, // missing tool name
        { id: ".status", error: "invalid_string" }, // missing server name
        { id: "Git.Status", error: "invalid_string" }, // uppercase
        { id: "git_server.status", error: "invalid_string" }, // underscore
        { id: "git server.status", error: "invalid_string" }, // space
        { id: "git.create_issue", error: "invalid_string" }, // underscore in tool name
        { id: "git.status.extra", error: "invalid_string" }, // too many dots
        { id: "123.status", error: "invalid_string" }, // number start
        { id: "git.123", error: "invalid_string" }, // number start in tool
      ];

      invalidToolIds.forEach(({ id, error }) => {
        it(`should reject invalid tool ID: "${id}" (${error})`, () => {
          const result = ToolIdSchema.safeParse(id);
          expect(result.success).toBe(false);
          if (!result.success) {
            expect(result.error.issues[0].code).toBe(error);
          }
        });
      });
    });
  });

  describe("PersonaToolsetSchema", () => {
    it("should accept valid toolset", () => {
      const toolset = {
        name: "development",
        toolIds: ["git.status", "docker.ps", "npm.install"],
      };

      const result = PersonaToolsetSchema.safeParse(toolset);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe("development");
        expect(result.data.toolIds).toHaveLength(3);
      }
    });

    it("should require name field", () => {
      const toolset = {
        toolIds: ["git.status"],
      };

      const result = PersonaToolsetSchema.safeParse(toolset);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some(issue => issue.path.includes("name"))).toBe(true);
      }
    });

    it("should require toolIds field", () => {
      const toolset = {
        name: "development",
      };

      const result = PersonaToolsetSchema.safeParse(toolset);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some(issue => issue.path.includes("toolIds"))).toBe(true);
      }
    });

    it("should require at least one tool ID", () => {
      const toolset = {
        name: "development",
        toolIds: [],
      };

      const result = PersonaToolsetSchema.safeParse(toolset);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].code).toBe("too_small");
      }
    });

    it("should validate tool ID format", () => {
      const toolset = {
        name: "development",
        toolIds: ["git.status", "invalid-tool", "docker.ps"],
      };

      const result = PersonaToolsetSchema.safeParse(toolset);
      expect(result.success).toBe(false);
      if (!result.success) {
        const toolIdError = result.error.issues.find(issue => 
          issue.path.includes("toolIds")
        );
        expect(toolIdError).toBeDefined();
      }
    });
  });

  describe("PersonaMetadataSchema", () => {
    it("should accept empty metadata", () => {
      const result = PersonaMetadataSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it("should accept complete metadata", () => {
      const metadata = {
        author: "Test Author",
        tags: ["development", "testing", "automation"],
        created: "2024-01-01T00:00:00Z",
        lastModified: "2024-01-02T12:00:00Z",
      };

      const result = PersonaMetadataSchema.safeParse(metadata);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.author).toBe("Test Author");
        expect(result.data.tags).toHaveLength(3);
      }
    });

    it("should accept partial metadata", () => {
      const metadata = {
        author: "Test Author",
        tags: ["development"],
      };

      const result = PersonaMetadataSchema.safeParse(metadata);
      expect(result.success).toBe(true);
    });

    it("should reject empty tags", () => {
      const metadata = {
        tags: ["development", "", "testing"],
      };

      const result = PersonaMetadataSchema.safeParse(metadata);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some(issue => 
          issue.message.includes("Tag cannot be empty")
        )).toBe(true);
      }
    });

    it("should be strict about unknown fields", () => {
      const metadata = {
        author: "Test Author",
        unknownField: "value",
      };

      const result = PersonaMetadataSchema.safeParse(metadata);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].code).toBe("unrecognized_keys");
      }
    });
  });

  describe("PersonaConfigSchema", () => {
    describe("Valid Configurations", () => {
      it("should accept minimal valid configuration", () => {
        const config = {
          name: "minimal-persona",
          description: "A minimal persona configuration for testing purposes",
        };

        const result = PersonaConfigSchema.safeParse(config);
        expect(result.success).toBe(true);
      });

      it("should accept complete configuration", () => {
        const config = {
          name: "complete-persona",
          description: "A complete persona configuration with all optional fields",
          version: "1.0.0",
          toolsets: [
            {
              name: "development",
              toolIds: ["git.status", "npm.install"],
            },
            {
              name: "testing",
              toolIds: ["jest.run", "coverage.report"],
            },
          ],
          defaultToolset: "development",
          metadata: {
            author: "Test Suite",
            tags: ["development", "testing"],
            created: "2024-01-01T00:00:00Z",
            lastModified: "2024-01-01T12:00:00Z",
          },
        };

        const result = PersonaConfigSchema.safeParse(config);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.name).toBe("complete-persona");
          expect(result.data.toolsets).toHaveLength(2);
          expect(result.data.defaultToolset).toBe("development");
        }
      });

      it("should accept configuration with no toolsets", () => {
        const config = {
          name: "no-toolsets",
          description: "A persona without any toolsets defined",
        };

        const result = PersonaConfigSchema.safeParse(config);
        expect(result.success).toBe(true);
      });
    });

    describe("Required Field Validation", () => {
      it("should require name field", () => {
        const config = {
          description: "Missing name field",
        };

        const result = PersonaConfigSchema.safeParse(config);
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues.some(issue => 
            issue.path.includes("name")
          )).toBe(true);
        }
      });

      it("should require description field", () => {
        const config = {
          name: "missing-description",
        };

        const result = PersonaConfigSchema.safeParse(config);
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues.some(issue => 
            issue.path.includes("description")
          )).toBe(true);
        }
      });
    });

    describe("Description Validation", () => {
      it("should require minimum description length", () => {
        const config = {
          name: "short-desc",
          description: "Too short", // Less than 10 characters
        };

        const result = PersonaConfigSchema.safeParse(config);
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0].code).toBe("too_small");
        }
      });

      it("should enforce maximum description length", () => {
        const config = {
          name: "long-desc",
          description: "x".repeat(501), // More than 500 characters
        };

        const result = PersonaConfigSchema.safeParse(config);
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0].code).toBe("too_big");
        }
      });

      it("should accept description at boundaries", () => {
        const minConfig = {
          name: "min-desc",
          description: "x".repeat(10), // Exactly 10 characters
        };

        const maxConfig = {
          name: "max-desc",
          description: "x".repeat(500), // Exactly 500 characters
        };

        expect(PersonaConfigSchema.safeParse(minConfig).success).toBe(true);
        expect(PersonaConfigSchema.safeParse(maxConfig).success).toBe(true);
      });
    });

    describe("Business Rule Validation", () => {
      it("should validate defaultToolset exists in toolsets", () => {
        const config = {
          name: "invalid-default",
          description: "Configuration with invalid default toolset",
          toolsets: [
            {
              name: "development",
              toolIds: ["git.status"],
            },
          ],
          defaultToolset: "non-existent",
        };

        const result = PersonaConfigSchema.safeParse(config);
        expect(result.success).toBe(false);
        if (!result.success) {
          const defaultToolsetError = result.error.issues.find(issue =>
            issue.path.includes("defaultToolset")
          );
          expect(defaultToolsetError).toBeDefined();
          expect(defaultToolsetError?.message).toContain("non-existent");
          expect(defaultToolsetError?.message).toContain("development");
        }
      });

      it("should reject defaultToolset without toolsets", () => {
        const config = {
          name: "default-without-toolsets",
          description: "Configuration with default toolset but no toolsets array",
          defaultToolset: "development",
        };

        const result = PersonaConfigSchema.safeParse(config);
        expect(result.success).toBe(false);
        if (!result.success) {
          const error = result.error.issues.find(issue =>
            issue.message.includes("Cannot specify defaultToolset")
          );
          expect(error).toBeDefined();
        }
      });

      it("should detect duplicate toolset names", () => {
        const config = {
          name: "duplicate-toolsets",
          description: "Configuration with duplicate toolset names",
          toolsets: [
            {
              name: "development",
              toolIds: ["git.status"],
            },
            {
              name: "testing",
              toolIds: ["jest.run"],
            },
            {
              name: "development", // Duplicate name
              toolIds: ["docker.ps"],
            },
          ],
        };

        const result = PersonaConfigSchema.safeParse(config);
        expect(result.success).toBe(false);
        if (!result.success) {
          const duplicateError = result.error.issues.find(issue =>
            issue.message.includes("Duplicate toolset names")
          );
          expect(duplicateError).toBeDefined();
          expect(duplicateError?.message).toContain("development");
        }
      });

      it("should detect duplicate tool IDs within toolset", () => {
        const config = {
          name: "duplicate-tools",
          description: "Configuration with duplicate tool IDs",
          toolsets: [
            {
              name: "development",
              toolIds: ["git.status", "docker.ps", "git.status"], // Duplicate
            },
          ],
        };

        const result = PersonaConfigSchema.safeParse(config);
        expect(result.success).toBe(false);
        if (!result.success) {
          const duplicateError = result.error.issues.find(issue =>
            issue.message.includes("Duplicate tool IDs")
          );
          expect(duplicateError).toBeDefined();
          expect(duplicateError?.message).toContain("git.status");
        }
      });
    });

    describe("Strict Mode", () => {
      it("should reject unknown fields", () => {
        const config = {
          name: "unknown-fields",
          description: "Configuration with unknown fields",
          unknownField: "should not be allowed",
        };

        const result = PersonaConfigSchema.safeParse(config);
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0].code).toBe("unrecognized_keys");
        }
      });
    });
  });

  describe("validatePersonaConfig Function", () => {
    it("should return success for valid configuration", () => {
      const config = {
        name: "valid-persona",
        description: "A valid persona configuration",
        toolsets: [
          {
            name: "development",
            toolIds: ["git.status", "npm.install"],
          },
        ],
        defaultToolset: "development",
      };

      const result = validatePersonaConfig(config);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });

    it("should return detailed errors for invalid configuration", () => {
      const config = {
        name: "Invalid_Name", // Invalid format
        description: "Short", // Too short
        toolsets: [
          {
            name: "dev",
            toolIds: [], // Empty array
          },
        ],
        defaultToolset: "missing", // Doesn't exist in toolsets
        unknownField: "value", // Unknown field
      };

      const result = validatePersonaConfig(config);

      expect(result.success).toBe(false);
      expect(result.data).toBeUndefined();
      expect(result.errors.length).toBeGreaterThan(0);

      // Check that errors contain path information
      const pathsWithErrors = result.errors.map(error => error.path);
      expect(pathsWithErrors).toContain("name");
      expect(pathsWithErrors).toContain("description");

      // Check that suggestions are provided
      result.errors.forEach(error => {
        expect(error.suggestion).toBeDefined();
        expect(error.suggestion).not.toBe("");
      });
    });

    it("should handle null and undefined input", () => {
      expect(validatePersonaConfig(null).success).toBe(false);
      expect(validatePersonaConfig(undefined).success).toBe(false);
    });

    it("should handle non-object input", () => {
      const results = [
        validatePersonaConfig("string"),
        validatePersonaConfig(123),
        validatePersonaConfig([]),
        validatePersonaConfig(true),
      ];

      results.forEach(result => {
        expect(result.success).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
      });
    });
  });

  describe("validatePersonaToolsets Function", () => {
    it("should validate array of toolsets", () => {
      const toolsets = [
        {
          name: "development",
          toolIds: ["git.status", "npm.install"],
        },
        {
          name: "testing",
          toolIds: ["jest.run"],
        },
      ];

      const result = validatePersonaToolsets(toolsets);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(toolsets);
      expect(result.errors).toHaveLength(0);
    });

    it("should reject invalid toolset structure", () => {
      const toolsets = [
        {
          name: "valid",
          toolIds: ["git.status"],
        },
        {
          // Missing name field
          toolIds: ["npm.install"],
        },
      ];

      const result = validatePersonaToolsets(toolsets);

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it("should handle non-array input", () => {
      const result = validatePersonaToolsets("not an array");
      expect(result.success).toBe(false);
    });
  });

  describe("createValidationErrorSummary Function", () => {
    it("should return no errors message for empty array", () => {
      const summary = createValidationErrorSummary([]);
      expect(summary).toBe("No validation errors");
    });

    it("should format single error", () => {
      const errors = [
        {
          path: "name",
          message: "Invalid format",
          code: "invalid_string",
          suggestion: "Use hyphen-delimited format",
        },
      ];

      const summary = createValidationErrorSummary(errors);

      expect(summary).toContain("Found 1 validation error:");
      expect(summary).toContain("1. name: Invalid format");
      expect(summary).toContain("Suggestion: Use hyphen-delimited format");
    });

    it("should format multiple errors", () => {
      const errors = [
        {
          path: "name",
          message: "Invalid format",
          code: "invalid_string",
          suggestion: "Use hyphen-delimited format",
        },
        {
          path: "description",
          message: "Too short",
          code: "too_small",
          suggestion: "Add more detail",
        },
      ];

      const summary = createValidationErrorSummary(errors);

      expect(summary).toContain("Found 2 validation errors:");
      expect(summary).toContain("1. name: Invalid format");
      expect(summary).toContain("2. description: Too short");
      expect(summary).toContain("Suggestion: Use hyphen-delimited format");
      expect(summary).toContain("Suggestion: Add more detail");
    });

    it("should handle errors without suggestions", () => {
      const errors = [
        {
          path: "root",
          message: "Generic error",
          code: "custom",
        },
      ];

      const summary = createValidationErrorSummary(errors);

      expect(summary).toContain("1. root: Generic error");
      expect(summary).not.toContain("Suggestion:");
    });
  });

  describe("Utility Functions", () => {
    describe("isSupportedPersonaFile", () => {
      it("should identify supported persona files", () => {
        expect(isSupportedPersonaFile("persona.yaml")).toBe(true);
        expect(isSupportedPersonaFile("persona.yml")).toBe(true);
      });

      it("should reject unsupported files", () => {
        expect(isSupportedPersonaFile("persona.json")).toBe(false);
        expect(isSupportedPersonaFile("config.yaml")).toBe(false);
        expect(isSupportedPersonaFile("persona.txt")).toBe(false);
        expect(isSupportedPersonaFile("")).toBe(false);
      });

      it("should be case sensitive", () => {
        expect(isSupportedPersonaFile("PERSONA.YAML")).toBe(false);
        expect(isSupportedPersonaFile("Persona.yaml")).toBe(false);
      });
    });

    describe("extractPersonaNameFromPath", () => {
      it("should extract persona name from Unix path", () => {
        const paths = [
          "/home/user/.personas/dev-tools/persona.yaml",
          "/etc/personas/backend-api/persona.yml",
          "/tmp/test-persona/persona.yaml",
        ];

        expect(extractPersonaNameFromPath(paths[0])).toBe("dev-tools");
        expect(extractPersonaNameFromPath(paths[1])).toBe("backend-api");
        expect(extractPersonaNameFromPath(paths[2])).toBe("test-persona");
      });

      it("should extract persona name from Windows path", () => {
        const path = "C:\\Users\\user\\personas\\web-dev\\persona.yaml";
        expect(extractPersonaNameFromPath(path)).toBe("web-dev");
      });

      it("should handle relative paths", () => {
        const paths = [
          "./personas/mobile-dev/persona.yaml",
          "../shared/api-testing/persona.yml",
        ];

        expect(extractPersonaNameFromPath(paths[0])).toBe("mobile-dev");
        expect(extractPersonaNameFromPath(paths[1])).toBe("api-testing");
      });

      it("should handle paths without parent directory", () => {
        const path = "persona.yaml";
        expect(extractPersonaNameFromPath(path)).toBe("unknown");
      });

      it("should handle malformed paths", () => {
        const paths = [
          "",
          "/persona.yaml",
          "persona.yaml",
        ];

        paths.forEach(path => {
          const result = extractPersonaNameFromPath(path);
          expect(typeof result).toBe("string");
        });
      });

      it("should handle both supported file extensions", () => {
        expect(extractPersonaNameFromPath("/path/test/persona.yaml")).toBe("test");
        expect(extractPersonaNameFromPath("/path/test/persona.yml")).toBe("test");
      });
    });

    describe("SUPPORTED_PERSONA_FILES constant", () => {
      it("should contain expected file names", () => {
        expect(SUPPORTED_PERSONA_FILES).toContain("persona.yaml");
        expect(SUPPORTED_PERSONA_FILES).toContain("persona.yml");
        expect(SUPPORTED_PERSONA_FILES).toHaveLength(2);
      });

      it("should be readonly", () => {
        // This is a compile-time check, but we can verify the type
        const files: readonly string[] = SUPPORTED_PERSONA_FILES;
        expect(files).toBe(SUPPORTED_PERSONA_FILES);
      });
    });
  });

  describe("Type Inference", () => {
    it("should infer PersonaConfigData type correctly", () => {
      const config: PersonaConfigData = {
        name: "test-persona",
        description: "Test persona configuration",
        toolsets: [
          {
            name: "development",
            toolIds: ["git.status"],
          },
        ],
        defaultToolset: "development",
        version: "1.0.0",
        metadata: {
          author: "Test",
          tags: ["test"],
        },
      };

      // Type assertions to ensure proper inference
      expect(typeof config.name).toBe("string");
      expect(typeof config.description).toBe("string");
      expect(Array.isArray(config.toolsets)).toBe(true);
      expect(typeof config.defaultToolset).toBe("string");
    });

    it("should infer PersonaToolsetData type correctly", () => {
      const toolset: PersonaToolsetData = {
        name: "test-toolset",
        toolIds: ["git.status", "docker.ps"],
      };

      expect(typeof toolset.name).toBe("string");
      expect(Array.isArray(toolset.toolIds)).toBe(true);
    });

    it("should infer PersonaMetadataData type correctly", () => {
      const metadata: PersonaMetadataData = {
        author: "Test Author",
        tags: ["development"],
        created: "2024-01-01T00:00:00Z",
      };

      expect(typeof metadata.author).toBe("string");
      expect(Array.isArray(metadata.tags)).toBe(true);
    });
  });

  describe("Error Message Quality", () => {
    it("should provide helpful error messages for common mistakes", () => {
      const commonMistakes = [
        {
          config: { name: "DevTools", description: "Development tools" },
          expectedSuggestion: "hyphen-delimited lowercase",
        },
        {
          config: { name: "dev-tools", description: "Short" },
          expectedSuggestion: "at least 10 characters",
        },
        {
          config: { 
            name: "dev-tools", 
            description: "Development tools", 
            toolsets: [{ name: "dev", toolIds: [] }]
          },
          expectedSuggestion: "at least one tool",
        },
      ];

      commonMistakes.forEach(({ config, expectedSuggestion }) => {
        const result = validatePersonaConfig(config);
        expect(result.success).toBe(false);
        
        const hasExpectedSuggestion = result.errors.some(error =>
          error.suggestion?.toLowerCase().includes(expectedSuggestion.toLowerCase())
        );
        expect(hasExpectedSuggestion).toBe(true);
      });
    });

    it("should provide specific error paths", () => {
      const config = {
        name: "test",
        description: "Test configuration",
        toolsets: [
          {
            name: "invalid_name",
            toolIds: ["invalid-tool-id"],
          },
        ],
      };

      const result = validatePersonaConfig(config);
      expect(result.success).toBe(false);

      const toolsetNameError = result.errors.find(error =>
        error.path.includes("toolsets") && error.path.includes("name")
      );
      const toolIdError = result.errors.find(error =>
        error.path.includes("toolIds")
      );

      expect(toolsetNameError).toBeDefined();
      expect(toolIdError).toBeDefined();
    });
  });
});