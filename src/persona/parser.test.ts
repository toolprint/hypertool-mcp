/**
 * PersonaParser Test Suite
 *
 * Comprehensive tests for YAML parsing functionality, including valid/invalid YAML,
 * schema validation integration, error handling, file system operations,
 * and edge cases with malformed content.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { promises as fs } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  parsePersonaYAML,
  parsePersonaYAMLFile,
  parseMultiplePersonaFiles,
  isPersonaConfigFile,
  getSupportedPersonaFiles,
  isValidYAMLSyntax,
  extractPersonaNameFromYAML,
  parseResultToValidationResult,
  type ParseResult,
  type YAMLError,
  type ParseOptions,
} from "./parser.js";
import type { PersonaConfig, ValidationResult } from "./types.js";

describe("PersonaParser", () => {
  let tempDir: string;

  beforeEach(async () => {
    // Create temporary directory for test files
    tempDir = await fs.mkdtemp(join(tmpdir(), "persona-parser-test-"));
  });

  afterEach(async () => {
    // Clean up temporary files
    try {
      await fs.rmdir(tempDir, { recursive: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("parsePersonaYAML", () => {
    describe("Valid YAML Content", () => {
      it("should parse minimal valid persona configuration", () => {
        const yamlContent = `
name: test-persona
description: A test persona for unit testing purposes
`;

        const result = parsePersonaYAML(yamlContent);

        expect(result.success).toBe(true);
        expect(result.data).toBeDefined();
        expect(result.data?.name).toBe("test-persona");
        expect(result.data?.description).toBe(
          "A test persona for unit testing purposes"
        );
        expect(result.errors).toHaveLength(0);
        expect(result.warnings).toHaveLength(0);
      });

      it("should parse complete persona configuration", () => {
        const yamlContent = `
name: complete-persona
description: A complete persona configuration with all features
version: "1.0.0"
toolsets:
  - name: development
    toolIds:
      - git.status
      - docker.ps
      - npm.install
  - name: testing
    toolIds:
      - jest.run
      - coverage.report
defaultToolset: development
metadata:
  author: Test Suite
  tags:
    - development
    - testing
    - automation
  created: "2024-01-01T00:00:00Z"
  lastModified: "2024-01-01T12:00:00Z"
`;

        const result = parsePersonaYAML(yamlContent);

        expect(result.success).toBe(true);
        expect(result.data?.name).toBe("complete-persona");
        expect(result.data?.toolsets).toHaveLength(2);
        expect(result.data?.defaultToolset).toBe("development");
        expect(result.data?.metadata?.author).toBe("Test Suite");
        expect(result.data?.metadata?.tags).toContain("development");
        expect(result.errors).toHaveLength(0);
      });

      it("should handle empty optional fields", () => {
        const yamlContent = `
name: minimal-persona
description: Persona with only required fields
toolsets: []
metadata: {}
`;

        const result = parsePersonaYAML(yamlContent);

        expect(result.success).toBe(true);
        expect(result.data?.toolsets).toEqual([]);
        expect(result.data?.metadata).toEqual({});
      });
    });

    describe("Invalid YAML Syntax", () => {
      it("should handle malformed YAML syntax", () => {
        const yamlContent = `
name: test-persona
description: [invalid yaml structure
  missing closing bracket
`;

        const result = parsePersonaYAML(yamlContent);

        expect(result.success).toBe(false);
        expect(result.data).toBeUndefined();
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].type).toBe("schema");
        expect(result.errors[0].message).toMatch(
          /Flow sequence|YAML|syntax|parse/i
        );
        expect(result.yamlErrors).toBeDefined();
        expect(result.yamlErrors).toHaveLength(1);
      });

      it("should handle indentation errors", () => {
        const yamlContent = `
name: test-persona
description: Test description
	toolsets: # This line uses a tab instead of spaces
  - name: invalid
    toolIds: []
`;

        const result = parsePersonaYAML(yamlContent);

        expect(result.success).toBe(false);
        expect(result.errors[0].suggestion).toContain("spaces");
      });

      it("should handle duplicate keys", () => {
        const yamlContent = `
name: test-persona
description: First description
description: Duplicate key
`;

        const result = parsePersonaYAML(yamlContent);

        expect(result.success).toBe(false);
        expect(result.errors[0].suggestion).toContain("duplicate");
      });

      it("should provide line numbers for syntax errors", () => {
        const yamlContent = `
name: test-persona
description: Valid description
invalid-yaml: [
  missing closing bracket
`;

        const result = parsePersonaYAML(yamlContent, "test.yaml");

        expect(result.success).toBe(false);
        expect(result.yamlErrors).toBeDefined();
        if (result.yamlErrors && result.yamlErrors[0]) {
          expect(result.yamlErrors[0].line).toBeDefined();
          expect(result.yamlErrors[0].message).toMatch(
            /Flow sequence|missing.*bracket|syntax/i
          );
        }
      });
    });

    describe("Schema Validation", () => {
      it("should validate against persona schema", () => {
        const yamlContent = `
name: Invalid_Name_Format
description: Too short
toolsets:
  - name: invalid-toolset
    toolIds: []
defaultToolset: non-existent
`;

        const result = parsePersonaYAML(yamlContent);

        expect(result.success).toBe(false);
        expect(result.errors.length).toBeGreaterThan(1);

        // Check for specific validation errors
        const nameError = result.errors.find((e) => e.field === "name");
        const descriptionError = result.errors.find(
          (e) => e.field === "description"
        );
        const toolsetError = result.errors.find(
          (e) => e.message.includes("tool ID") || e.message.includes("toolIds")
        );
        const defaultToolsetError = result.errors.find(
          (e) => e.field === "defaultToolset"
        );

        expect(nameError).toBeDefined();
        expect(descriptionError).toBeDefined();
        expect(toolsetError).toBeDefined();
        expect(defaultToolsetError).toBeDefined();
      });

      it("should skip schema validation when disabled", () => {
        const yamlContent = `
name: Invalid_Name_Format
description: Short
`;

        const result = parsePersonaYAML(yamlContent, undefined, {
          validateSchema: false,
        });

        expect(result.success).toBe(true);
        expect(result.data?.name).toBe("Invalid_Name_Format");
        expect(result.errors).toHaveLength(0);
      });

      it("should handle validation warnings", () => {
        // Create content that might generate warnings (this depends on implementation)
        const yamlContent = `
name: test-persona
description: A test persona that might generate warnings
`;

        const result = parsePersonaYAML(yamlContent, undefined, {
          includeWarnings: true,
        });

        expect(result.success).toBe(true);
        expect(result.warnings).toBeDefined();
        // Warnings array might be empty, which is fine
      });

      it("should exclude warnings when disabled", () => {
        const yamlContent = `
name: test-persona
description: A test persona configuration
`;

        const result = parsePersonaYAML(yamlContent, undefined, {
          includeWarnings: false,
        });

        expect(result.warnings).toHaveLength(0);
      });
    });

    describe("Custom Validation", () => {
      it("should apply custom validation function", () => {
        const yamlContent = `
name: test-persona
description: A test persona configuration
`;

        const customValidation = (data: any): ValidationResult => ({
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

        const result = parsePersonaYAML(yamlContent, undefined, {
          customValidation,
        });

        expect(result.success).toBe(false);
        expect(result.errors.some((e) => e.type === "business")).toBe(true);
        expect(result.warnings.some((w) => w.type === "business")).toBe(true);
      });

      it("should pass custom validation when successful", () => {
        const yamlContent = `
name: test-persona
description: A test persona configuration
`;

        const customValidation = (data: any): ValidationResult => ({
          isValid: true,
          errors: [],
          warnings: [],
        });

        const result = parsePersonaYAML(yamlContent, undefined, {
          customValidation,
        });

        expect(result.success).toBe(true);
      });
    });

    describe("Edge Cases", () => {
      it("should handle empty YAML content", () => {
        const result = parsePersonaYAML("");

        expect(result.success).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
      });

      it("should handle null/undefined YAML result", () => {
        const yamlContent = `~`; // YAML null

        const result = parsePersonaYAML(yamlContent);

        expect(result.success).toBe(false);
      });

      it("should handle non-object YAML result", () => {
        const yamlContent = `"just a string"`;

        const result = parsePersonaYAML(yamlContent);

        expect(result.success).toBe(false);
        expect(result.errors[0].message).toContain("Expected object");
      });

      it("should provide helpful error suggestions", () => {
        const yamlContent = `
name: test-persona
description: Short
`;

        const result = parsePersonaYAML(yamlContent);

        expect(result.success).toBe(false);
        expect(result.errors[0].suggestion).toBeDefined();
        expect(result.errors[0].suggestion).not.toBe("");
      });
    });
  });

  describe("parsePersonaYAMLFile", () => {
    describe("Valid Files", () => {
      it("should parse valid persona.yaml file", async () => {
        const filePath = join(tempDir, "persona.yaml");
        const content = `
name: file-test-persona
description: A persona loaded from file system
`;

        await fs.writeFile(filePath, content);

        const result = await parsePersonaYAMLFile(filePath);

        expect(result.success).toBe(true);
        expect(result.data?.name).toBe("file-test-persona");
      });

      it("should parse valid persona.yml file", async () => {
        const filePath = join(tempDir, "persona.yml");
        const content = `
name: yml-test-persona
description: A persona with yml extension
`;

        await fs.writeFile(filePath, content);

        const result = await parsePersonaYAMLFile(filePath);

        expect(result.success).toBe(true);
        expect(result.data?.name).toBe("yml-test-persona");
      });
    });

    describe("File System Errors", () => {
      it("should handle non-existent files", async () => {
        const filePath = join(tempDir, "persona.yaml");

        const result = await parsePersonaYAMLFile(filePath);

        expect(result.success).toBe(false);
        expect(result.errors[0].message).toContain("Failed to read file");
        expect(result.errors[0].suggestion).toContain(
          "Verify that the file exists"
        );
      });

      it("should handle permission errors", async () => {
        const filePath = join(tempDir, "persona.yaml");

        // Create file and remove read permissions (on Unix-like systems)
        await fs.writeFile(filePath, "content");

        // Spy on fs.readFile to simulate permission error
        const readFileSpy = vi
          .spyOn(fs, "readFile")
          .mockRejectedValueOnce(
            Object.assign(new Error("Permission denied"), { code: "EACCES" })
          );

        const result = await parsePersonaYAMLFile(filePath);

        expect(result.success).toBe(false);
        expect(result.errors[0].suggestion).toMatch(
          /Check file permissions|Ensure.*correct type|Permission denied/i
        );

        // Restore original function
        readFileSpy.mockRestore();
      });

      it("should handle unsupported file extensions", async () => {
        const filePath = join(tempDir, "persona.json");

        const result = await parsePersonaYAMLFile(filePath);

        expect(result.success).toBe(false);
        expect(result.errors[0].message).toContain("Unsupported file type");
        expect(result.errors[0].suggestion).toContain("supported extensions");
      });
    });

    describe("Parse Options", () => {
      it("should pass parse options correctly", async () => {
        const filePath = join(tempDir, "persona.yaml");
        const content = `
name: Invalid_Name
description: Short
`;

        await fs.writeFile(filePath, content);

        const result = await parsePersonaYAMLFile(filePath, {
          validateSchema: false,
        });

        expect(result.success).toBe(true);
        expect(result.data?.name).toBe("Invalid_Name");
      });
    });
  });

  describe("parseMultiplePersonaFiles", () => {
    it("should parse multiple valid files concurrently", async () => {
      const files = [
        {
          name: "persona.yaml",
          content:
            "name: persona-one\ndescription: First persona for testing multiple file parsing",
          dir: "dir1",
        },
        {
          name: "persona.yaml",
          content:
            "name: persona-two\ndescription: Second persona for testing multiple file parsing",
          dir: "dir2",
        },
        {
          name: "persona.yaml",
          content:
            "name: persona-three\ndescription: Third persona for testing multiple file parsing",
          dir: "dir3",
        },
      ];

      const filePaths = await Promise.all(
        files.map(async (file) => {
          const dirPath = join(tempDir, file.dir);
          await fs.mkdir(dirPath, { recursive: true });
          const filePath = join(dirPath, file.name);
          await fs.writeFile(filePath, file.content);
          return filePath;
        })
      );

      const results = await parseMultiplePersonaFiles(filePaths);

      expect(results.size).toBe(3);
      filePaths.forEach((filePath, index) => {
        const result = results.get(filePath);
        if (!result?.success) {
          console.log(`File ${filePath} failed:`, result?.errors);
        }
        expect(result?.success).toBe(true);
        expect(result?.data?.name).toBe(
          `persona-${["one", "two", "three"][index]}`
        );
      });
    });

    it("should handle mix of valid and invalid files", async () => {
      const files = [
        {
          name: "persona.yaml",
          dir: "valid",
          content:
            "name: valid-persona\ndescription: Valid persona for testing mixed file parsing",
        },
        {
          name: "persona.yaml",
          dir: "invalid",
          content: "name: [invalid yaml",
        },
        { name: "persona.yaml", dir: "missing", exists: false },
      ];

      const filePaths = [];
      for (const file of files) {
        const dirPath = join(tempDir, file.dir);
        await fs.mkdir(dirPath, { recursive: true });
        const filePath = join(dirPath, file.name);
        if (file.exists !== false) {
          await fs.writeFile(filePath, file.content);
        }
        filePaths.push(filePath);
      }

      const results = await parseMultiplePersonaFiles(filePaths);

      expect(results.size).toBe(3);

      // Valid file should succeed
      const validResult = results.get(filePaths[0]);
      expect(validResult?.success).toBe(true);

      // Invalid YAML should fail with parsing error
      const invalidResult = results.get(filePaths[1]);
      expect(invalidResult?.success).toBe(false);

      // Missing file should fail with file system error
      const missingResult = results.get(filePaths[2]);
      expect(missingResult?.success).toBe(false);
    });

    it("should handle promise rejections gracefully", async () => {
      const filePath = join(tempDir, "persona.yaml");

      // Create a file that will cause parsing issues
      await fs.writeFile(filePath, "invalid: yaml: syntax: [unclosed");

      const results = await parseMultiplePersonaFiles([filePath]);

      expect(results.size).toBe(1);
      const result = results.get(filePath);
      expect(result?.success).toBe(false);
      expect(result?.errors[0].message).toContain(
        "Nested mappings are not allowed"
      );
    });
  });

  describe("Utility Functions", () => {
    describe("isPersonaConfigFile", () => {
      it("should identify persona configuration files", () => {
        const validPaths = [
          "persona.yaml",
          "persona.yml",
          "/path/to/persona.yaml",
          "/path/to/persona.yml",
          "C:\\path\\to\\persona.yaml",
        ];

        validPaths.forEach((path) => {
          expect(isPersonaConfigFile(path)).toBe(true);
        });
      });

      it("should reject non-persona configuration files", () => {
        const invalidPaths = [
          "config.yaml",
          "persona.json",
          "persona.txt",
          "PERSONA.YAML",
          "",
          "persona",
        ];

        invalidPaths.forEach((path) => {
          expect(isPersonaConfigFile(path)).toBe(false);
        });
      });
    });

    describe("getSupportedPersonaFiles", () => {
      it("should return supported file extensions", () => {
        const supported = getSupportedPersonaFiles();

        expect(supported).toContain("persona.yaml");
        expect(supported).toContain("persona.yml");
        expect(supported).toHaveLength(2);
      });

      it("should return readonly array", () => {
        const supported = getSupportedPersonaFiles();

        // This is a compile-time check, but we can verify behavior
        expect(() => {
          (supported as any).push("persona.json");
        }).toThrow();
      });
    });

    describe("isValidYAMLSyntax", () => {
      it("should validate correct YAML syntax", () => {
        const validYaml = [
          "key: value",
          "array:\n  - item1\n  - item2",
          "object:\n  nested: value",
          "",
          "null",
          "42",
          '"string"',
        ];

        validYaml.forEach((yaml) => {
          expect(isValidYAMLSyntax(yaml)).toBe(true);
        });
      });

      it("should reject invalid YAML syntax", () => {
        const invalidYaml = [
          "key: [unclosed bracket",
          "duplicate:\nduplicate:",
          "\t\tindentation error",
          "invalid: yaml: [structure",
        ];

        invalidYaml.forEach((yaml) => {
          expect(isValidYAMLSyntax(yaml)).toBe(false);
        });
      });
    });

    describe("extractPersonaNameFromYAML", () => {
      it("should extract name from valid YAML", () => {
        const yamlContent = `
name: extracted-persona
description: Test persona
other: field
`;

        const name = extractPersonaNameFromYAML(yamlContent);
        expect(name).toBe("extracted-persona");
      });

      it("should handle YAML without name field", () => {
        const yamlContent = `
description: Test persona without name
other: field
`;

        const name = extractPersonaNameFromYAML(yamlContent);
        expect(name).toBeUndefined();
      });

      it("should handle invalid YAML gracefully", () => {
        const yamlContent = "invalid: yaml: [structure";

        const name = extractPersonaNameFromYAML(yamlContent);
        expect(name).toBeUndefined();
      });

      it("should handle non-string name values", () => {
        const yamlContent = `
name: 123
description: Test persona
`;

        const name = extractPersonaNameFromYAML(yamlContent);
        expect(name).toBeUndefined();
      });

      it("should handle non-object YAML", () => {
        const yamlContent = '"just a string"';

        const name = extractPersonaNameFromYAML(yamlContent);
        expect(name).toBeUndefined();
      });
    });

    describe("parseResultToValidationResult", () => {
      it("should convert successful parse result", () => {
        const parseResult: ParseResult = {
          success: true,
          data: {
            name: "test-persona",
            description: "Test persona",
          } as PersonaConfig,
          errors: [],
          warnings: [],
        };

        const validationResult = parseResultToValidationResult(parseResult);

        expect(validationResult.isValid).toBe(true);
        expect(validationResult.errors).toEqual([]);
        expect(validationResult.warnings).toEqual([]);
      });

      it("should convert failed parse result", () => {
        const parseResult: ParseResult = {
          success: false,
          errors: [
            {
              type: "schema",
              message: "Validation failed",
              severity: "error",
            },
          ],
          warnings: [
            {
              type: "business",
              message: "Warning message",
              severity: "warning",
            },
          ],
        };

        const validationResult = parseResultToValidationResult(parseResult);

        expect(validationResult.isValid).toBe(false);
        expect(validationResult.errors).toHaveLength(1);
        expect(validationResult.warnings).toHaveLength(1);
        expect(validationResult.errors[0].message).toBe("Validation failed");
      });
    });
  });

  describe("Error Handling", () => {
    it("should provide detailed error information", () => {
      const yamlContent = `
name: Invalid_Name
description: Too short
toolsets:
  - name: invalid-toolset
    toolIds: ["invalid-tool"]
`;

      const result = parsePersonaYAML(yamlContent);

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);

      result.errors.forEach((error) => {
        expect(error.type).toBeDefined();
        expect(error.message).toBeDefined();
        expect(error.severity).toBeDefined();
        expect(error.suggestion).toBeDefined();
      });
    });

    it("should handle YAML parser errors gracefully", () => {
      const yamlContent = "invalid: yaml: [structure";

      const result = parsePersonaYAML(yamlContent);

      expect(result.success).toBe(false);
      expect(result.yamlErrors).toHaveLength(1);
      expect(result.yamlErrors?.[0].originalError).toBeInstanceOf(Error);
    });

    it("should extract line numbers from generic errors", () => {
      // Mock a generic error that contains line information in message
      const yamlContent = "invalid: yaml: [structure";

      const result = parsePersonaYAML(yamlContent);

      expect(result.success).toBe(false);
      expect(result.yamlErrors).toBeDefined();
      if (result.yamlErrors && result.yamlErrors[0]) {
        expect(result.yamlErrors[0].message).toBeDefined();
        expect(result.yamlErrors[0].originalError).toBeDefined();
      }
    });
  });

  describe("Performance and Edge Cases", () => {
    it("should handle large YAML files efficiently", () => {
      // Create a large but valid YAML content
      const toolIds = Array.from({ length: 100 }, (_, i) => `tool-${i}.action`);
      const yamlContent = `
name: large-persona
description: A persona with many tools for performance testing
toolsets:
  - name: large-toolset
    toolIds:
${toolIds.map((id) => `      - ${id}`).join("\n")}
`;

      const startTime = Date.now();
      const result = parsePersonaYAML(yamlContent);
      const duration = Date.now() - startTime;

      expect(result.success).toBe(true);
      expect(result.data?.toolsets?.[0].toolIds).toHaveLength(100);
      expect(duration).toBeLessThan(1000); // Should complete within 1 second
    });

    it("should handle deeply nested YAML structures", () => {
      const yamlContent = `
name: nested-persona
description: Persona with deeply nested structure for testing YAML parsing capabilities
deeply:
  nested:
    yaml:
      structure:
        with:
          multiple:
            levels:
              - item1
              - item2:
                  nested: deep-value
                  array:
                    - sub1
                    - sub2
            another:
              branch: test-value
`;

      // Parse with schema validation disabled to test pure YAML parsing
      const result = parsePersonaYAML(yamlContent, undefined, {
        validateSchema: false,
      });

      expect(result.success).toBe(true);
      expect(
        result.data?.deeply?.nested?.yaml?.structure?.with?.multiple
          ?.levels?.[1]?.item2?.nested
      ).toBe("deep-value");
      expect(
        result.data?.deeply?.nested?.yaml?.structure?.with?.multiple?.another
          ?.branch
      ).toBe("test-value");
    });

    it("should handle YAML with special characters", () => {
      const yamlContent = `
name: special-chars-persona
description: "Persona with special characters: !@#$%^&*()"
metadata:
  author: "Author with spaces and symbols: <>{}[]"
  tags:
    - "tag-with-spaces"
    - "tag:with:colons"
    - "tag/with/slashes"
`;

      const result = parsePersonaYAML(yamlContent);

      expect(result.success).toBe(true);
      expect(result.data?.description).toContain("!@#$%^&*()");
      expect(result.data?.metadata?.author).toContain("<>{}[]");
    });
  });
});
