/**
 * PersonaErrors Test Suite
 *
 * Comprehensive tests for persona error classes and factory functions,
 * including error inheritance, error codes, suggestion formatting,
 * and serialization capabilities.
 */

import { describe, it, expect } from "vitest";
import {
  PersonaError,
  PersonaDiscoveryError,
  PersonaValidationError,
  PersonaActivationError,
  PersonaRuntimeError,
  createPersonaNotFoundError,
  createSchemaValidationError,
  createYamlParseError,
  createToolResolutionError,
  createToolsetNotFoundError,
  createPermissionError,
  createFileSystemError,
  createMcpConfigConflictError,
  createDuplicatePersonaNameError,
  createActivationFailedError,
  createArchiveExtractionError,
  isPersonaError,
  isRecoverableError,
  getErrorCode,
  formatErrorForUser,
  createErrorSummary,
} from "./errors.js";
import { PersonaErrorCode } from "./types.js";

describe("PersonaErrors", () => {
  describe("PersonaError Base Class", () => {
    it("should create basic persona error", () => {
      const error = new PersonaError(
        PersonaErrorCode.VALIDATION_FAILED,
        "Test validation failed"
      );

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(PersonaError);
      expect(error.name).toBe("PersonaError");
      expect(error.code).toBe(PersonaErrorCode.VALIDATION_FAILED);
      expect(error.message).toBe("Test validation failed");
      expect(error.details).toEqual({});
      expect(error.suggestions).toEqual([]);
      expect(error.recoverable).toBe(false);
    });

    it("should create persona error with options", () => {
      const details = { field: "name", value: "invalid" };
      const suggestions = ["Use hyphen-delimited format", "Lowercase only"];

      const error = new PersonaError(
        PersonaErrorCode.INVALID_SCHEMA,
        "Invalid schema format",
        {
          details,
          suggestions,
          recoverable: true,
        }
      );

      expect(error.code).toBe(PersonaErrorCode.INVALID_SCHEMA);
      expect(error.message).toBe("Invalid schema format");
      expect(error.details).toBe(details);
      expect(error.suggestions).toBe(suggestions);
      expect(error.recoverable).toBe(true);
    });

    it("should create persona error with cause", () => {
      const cause = new Error("Original error");
      const error = new PersonaError(
        PersonaErrorCode.FILE_SYSTEM_ERROR,
        "File system error occurred",
        { cause }
      );

      expect((error as any).cause).toBe(cause);
    });

    it("should format error message with suggestions", () => {
      const error = new PersonaError(
        PersonaErrorCode.ACTIVATION_FAILED,
        "Activation failed",
        {
          suggestions: ["Check MCP servers", "Validate configuration"],
          details: { persona: "test-persona" },
        }
      );

      const formatted = error.getFormattedMessage();

      expect(formatted).toContain("[ACTIVATION_FAILED] Activation failed");
      expect(formatted).toContain("Suggestions:");
      expect(formatted).toContain("1. Check MCP servers");
      expect(formatted).toContain("2. Validate configuration");
      expect(formatted).toContain("Details: {");
      expect(formatted).toContain('"persona": "test-persona"');
    });

    it("should serialize error to JSON", () => {
      const error = new PersonaError(
        PersonaErrorCode.TOOL_RESOLUTION_FAILED,
        "Tool resolution failed",
        {
          details: { tools: ["git.status"] },
          suggestions: ["Check MCP servers"],
          recoverable: true,
        }
      );

      const json = error.toJSON();

      expect(json.name).toBe("PersonaError");
      expect(json.code).toBe(PersonaErrorCode.TOOL_RESOLUTION_FAILED);
      expect(json.message).toBe("Tool resolution failed");
      expect(json.details.tools).toEqual(["git.status"]);
      expect(json.suggestions).toEqual(["Check MCP servers"]);
      expect(json.recoverable).toBe(true);
      expect(json.stack).toBeDefined();
    });

    it("should capture stack trace", () => {
      const error = new PersonaError(
        PersonaErrorCode.VALIDATION_FAILED,
        "Test error"
      );

      expect(error.stack).toBeDefined();
      expect(error.stack).toContain("PersonaError");
    });
  });

  describe("PersonaDiscoveryError", () => {
    it("should create discovery error with correct inheritance", () => {
      const error = new PersonaDiscoveryError(
        PersonaErrorCode.PERSONA_NOT_FOUND,
        "Persona not found"
      );

      expect(error).toBeInstanceOf(PersonaError);
      expect(error).toBeInstanceOf(PersonaDiscoveryError);
      expect(error.name).toBe("PersonaDiscoveryError");
      expect(error.code).toBe(PersonaErrorCode.PERSONA_NOT_FOUND);
      expect(error.recoverable).toBe(true); // Default for discovery errors
    });

    it("should accept discovery-specific error codes", () => {
      const codes = [
        PersonaErrorCode.PERSONA_NOT_FOUND,
        PersonaErrorCode.PERMISSION_DENIED,
        PersonaErrorCode.FILE_SYSTEM_ERROR,
      ];

      codes.forEach((code) => {
        const error = new PersonaDiscoveryError(code, "Test message");
        expect(error.code).toBe(code);
      });
    });

    it("should override recoverable setting", () => {
      const error = new PersonaDiscoveryError(
        PersonaErrorCode.PERMISSION_DENIED,
        "Permission denied",
        { recoverable: false }
      );

      expect(error.recoverable).toBe(false);
    });
  });

  describe("PersonaValidationError", () => {
    it("should create validation error with correct inheritance", () => {
      const error = new PersonaValidationError(
        PersonaErrorCode.INVALID_SCHEMA,
        "Invalid schema"
      );

      expect(error).toBeInstanceOf(PersonaError);
      expect(error).toBeInstanceOf(PersonaValidationError);
      expect(error.name).toBe("PersonaValidationError");
      expect(error.code).toBe(PersonaErrorCode.INVALID_SCHEMA);
      expect(error.recoverable).toBe(true); // Default for validation errors
    });

    it("should accept validation-specific error codes", () => {
      const codes = [
        PersonaErrorCode.INVALID_SCHEMA,
        PersonaErrorCode.VALIDATION_FAILED,
        PersonaErrorCode.YAML_PARSE_ERROR,
        PersonaErrorCode.DUPLICATE_PERSONA_NAME,
      ];

      codes.forEach((code) => {
        const error = new PersonaValidationError(code, "Test message");
        expect(error.code).toBe(code);
      });
    });
  });

  describe("PersonaActivationError", () => {
    it("should create activation error with correct inheritance", () => {
      const error = new PersonaActivationError(
        PersonaErrorCode.ACTIVATION_FAILED,
        "Activation failed"
      );

      expect(error).toBeInstanceOf(PersonaError);
      expect(error).toBeInstanceOf(PersonaActivationError);
      expect(error.name).toBe("PersonaActivationError");
      expect(error.code).toBe(PersonaErrorCode.ACTIVATION_FAILED);
      expect(error.recoverable).toBe(false); // Default for activation errors
    });

    it("should accept activation-specific error codes", () => {
      const codes = [
        PersonaErrorCode.ACTIVATION_FAILED,
        PersonaErrorCode.TOOLSET_NOT_FOUND,
        PersonaErrorCode.TOOL_RESOLUTION_FAILED,
        PersonaErrorCode.MCP_CONFIG_CONFLICT,
      ];

      codes.forEach((code) => {
        const error = new PersonaActivationError(code, "Test message");
        expect(error.code).toBe(code);
      });
    });
  });

  describe("PersonaRuntimeError", () => {
    it("should create runtime error with correct inheritance", () => {
      const error = new PersonaRuntimeError(
        PersonaErrorCode.FILE_SYSTEM_ERROR,
        "File system error"
      );

      expect(error).toBeInstanceOf(PersonaError);
      expect(error).toBeInstanceOf(PersonaRuntimeError);
      expect(error.name).toBe("PersonaRuntimeError");
      expect(error.code).toBe(PersonaErrorCode.FILE_SYSTEM_ERROR);
      expect(error.recoverable).toBe(false); // Default for runtime errors
    });

    it("should accept runtime-specific error codes", () => {
      const codes = [
        PersonaErrorCode.FILE_SYSTEM_ERROR,
        PersonaErrorCode.ARCHIVE_EXTRACTION_FAILED,
      ];

      codes.forEach((code) => {
        const error = new PersonaRuntimeError(code, "Test message");
        expect(error.code).toBe(code);
      });
    });
  });

  describe("Factory Functions", () => {
    describe("createPersonaNotFoundError", () => {
      it("should create persona not found error", () => {
        const error = createPersonaNotFoundError("test-persona");

        expect(error).toBeInstanceOf(PersonaDiscoveryError);
        expect(error.code).toBe(PersonaErrorCode.PERSONA_NOT_FOUND);
        expect(error.message).toContain("test-persona");
        expect(error.message).toContain("not found");
        expect(error.details.personaName).toBe("test-persona");
        expect(error.suggestions).toContain(
          'Verify that the persona name "test-persona" is correct'
        );
        expect(error.recoverable).toBe(true);
      });

      it("should include search paths in error", () => {
        const searchPaths = ["/home/user/.personas", "/etc/personas"];
        const error = createPersonaNotFoundError("test-persona", searchPaths);

        expect(error.details.searchPaths).toEqual(searchPaths);
        expect(
          error.suggestions.some((s) => s.includes("/home/user/.personas"))
        ).toBe(true);
      });
    });

    describe("createSchemaValidationError", () => {
      it("should create schema validation error", () => {
        const error = createSchemaValidationError(
          "name",
          "InvalidName",
          "hyphen-delimited string"
        );

        expect(error).toBeInstanceOf(PersonaValidationError);
        expect(error.code).toBe(PersonaErrorCode.INVALID_SCHEMA);
        expect(error.message).toContain("name");
        expect(error.message).toContain("hyphen-delimited string");
        expect(error.details.field).toBe("name");
        expect(error.details.value).toBe("InvalidName");
        expect(error.details.expectedType).toBe("hyphen-delimited string");
        expect(error.suggestions).toContain(
          'Ensure field "name" is of type hyphen-delimited string'
        );
      });

      it("should include cause if provided", () => {
        const cause = new Error("Original validation error");
        const error = createSchemaValidationError(
          "field",
          "value",
          "string",
          cause
        );

        expect((error as any).cause).toBe(cause);
      });
    });

    describe("createYamlParseError", () => {
      it("should create YAML parse error", () => {
        const error = createYamlParseError("/path/to/persona.yaml");

        expect(error).toBeInstanceOf(PersonaValidationError);
        expect(error.code).toBe(PersonaErrorCode.YAML_PARSE_ERROR);
        expect(error.message).toContain("/path/to/persona.yaml");
        expect(error.details.filePath).toBe("/path/to/persona.yaml");
        expect(error.suggestions).toContain(
          "Check the YAML file for syntax errors"
        );
      });

      it("should include line and column information", () => {
        const error = createYamlParseError("/path/to/persona.yaml", 10, 5);

        expect(error.message).toContain("line 10, column 5");
        expect(error.details.line).toBe(10);
        expect(error.details.column).toBe(5);
        expect(
          error.suggestions.some((s) => s.includes("line 10, column 5"))
        ).toBe(true);
      });
    });

    describe("createToolResolutionError", () => {
      it("should create tool resolution error", () => {
        const toolIds = ["git.status", "docker.ps", "missing.tool"];
        const unavailableTools = ["missing.tool"];

        const error = createToolResolutionError(toolIds, unavailableTools);

        expect(error).toBeInstanceOf(PersonaActivationError);
        expect(error.code).toBe(PersonaErrorCode.TOOL_RESOLUTION_FAILED);
        expect(error.message).toContain("1 out of 3 tools");
        expect(error.details.requestedTools).toEqual(toolIds);
        expect(error.details.unavailableTools).toEqual(unavailableTools);
        expect(error.suggestions).toContain("Unavailable tools: missing.tool");
        expect(error.recoverable).toBe(false);
      });

      it("should truncate long unavailable tools list", () => {
        const toolIds = ["tool1", "tool2", "tool3", "tool4", "tool5"];
        const unavailableTools = ["tool1", "tool2", "tool3", "tool4"];

        const error = createToolResolutionError(toolIds, unavailableTools);

        expect(
          error.suggestions.some((s) =>
            s.includes("First few unavailable tools")
          )
        ).toBe(true);
      });
    });

    describe("createToolsetNotFoundError", () => {
      it("should create toolset not found error", () => {
        const error = createToolsetNotFoundError("missing-toolset", [
          "dev",
          "prod",
        ]);

        expect(error).toBeInstanceOf(PersonaActivationError);
        expect(error.code).toBe(PersonaErrorCode.TOOLSET_NOT_FOUND);
        expect(error.message).toContain("missing-toolset");
        expect(error.details.requestedToolset).toBe("missing-toolset");
        expect(error.details.availableToolsets).toEqual(["dev", "prod"]);
        expect(error.suggestions).toContain("Available toolsets: dev, prod");
      });

      it("should handle empty available toolsets", () => {
        const error = createToolsetNotFoundError("missing-toolset", []);

        expect(error.suggestions).toContain(
          "No toolsets are defined in this persona"
        );
      });
    });

    describe("createPermissionError", () => {
      it("should create permission error", () => {
        const error = createPermissionError("reading", "/protected/path");

        expect(error).toBeInstanceOf(PersonaDiscoveryError);
        expect(error.code).toBe(PersonaErrorCode.PERMISSION_DENIED);
        expect(error.message).toContain("reading");
        expect(error.message).toContain("/protected/path");
        expect(error.details.operation).toBe("reading");
        expect(error.details.path).toBe("/protected/path");
        expect(error.suggestions).toContain(
          'Check file permissions for "/protected/path"'
        );
      });
    });

    describe("createFileSystemError", () => {
      it("should create file system error", () => {
        const error = createFileSystemError("writing", "/read-only/file");

        expect(error).toBeInstanceOf(PersonaRuntimeError);
        expect(error.code).toBe(PersonaErrorCode.FILE_SYSTEM_ERROR);
        expect(error.message).toContain("writing");
        expect(error.message).toContain("/read-only/file");
        expect(error.details.operation).toBe("writing");
        expect(error.details.path).toBe("/read-only/file");
        expect(error.suggestions).toContain(
          'Verify that the path "/read-only/file" exists'
        );
      });
    });

    describe("createMcpConfigConflictError", () => {
      it("should create MCP config conflict error", () => {
        const error = createMcpConfigConflictError(
          ["git", "docker"],
          "test-persona"
        );

        expect(error).toBeInstanceOf(PersonaActivationError);
        expect(error.code).toBe(PersonaErrorCode.MCP_CONFIG_CONFLICT);
        expect(error.message).toContain("test-persona");
        expect(error.details.conflictingKeys).toEqual(["git", "docker"]);
        expect(error.details.personaName).toBe("test-persona");
        expect(error.suggestions).toContain(
          "Conflicting configuration keys: git, docker"
        );
        expect(error.recoverable).toBe(false);
      });
    });

    describe("createDuplicatePersonaNameError", () => {
      it("should create duplicate persona name error", () => {
        const existingPaths = ["/path1/persona", "/path2/persona"];
        const error = createDuplicatePersonaNameError(
          "duplicate-persona",
          existingPaths
        );

        expect(error).toBeInstanceOf(PersonaValidationError);
        expect(error.code).toBe(PersonaErrorCode.DUPLICATE_PERSONA_NAME);
        expect(error.message).toContain("duplicate-persona");
        expect(error.details.personaName).toBe("duplicate-persona");
        expect(error.details.existingPaths).toEqual(existingPaths);
        expect(error.suggestions).toContain(
          "Existing paths: /path1/persona, /path2/persona"
        );
      });
    });

    describe("createActivationFailedError", () => {
      it("should create activation failed error", () => {
        const error = createActivationFailedError(
          "test-persona",
          "validation failed"
        );

        expect(error).toBeInstanceOf(PersonaActivationError);
        expect(error.code).toBe(PersonaErrorCode.ACTIVATION_FAILED);
        expect(error.message).toContain("test-persona");
        expect(error.message).toContain("validation failed");
        expect(error.details.personaName).toBe("test-persona");
        expect(error.details.reason).toBe("validation failed");
        expect(error.suggestions).toContain(
          "Validate the persona configuration using 'hypertool persona validate'"
        );
      });
    });

    describe("createArchiveExtractionError", () => {
      it("should create archive extraction error", () => {
        const error = createArchiveExtractionError("/path/to/archive.htp");

        expect(error).toBeInstanceOf(PersonaRuntimeError);
        expect(error.code).toBe(PersonaErrorCode.ARCHIVE_EXTRACTION_FAILED);
        expect(error.message).toContain("/path/to/archive.htp");
        expect(error.details.archivePath).toBe("/path/to/archive.htp");
        expect(error.suggestions).toContain(
          "Verify that the archive file is not corrupted"
        );
        expect(error.recoverable).toBe(false);
      });
    });
  });

  describe("Utility Functions", () => {
    describe("isPersonaError", () => {
      it("should identify PersonaError instances", () => {
        const personaError = new PersonaError(
          PersonaErrorCode.VALIDATION_FAILED,
          "Test"
        );
        const validationError = new PersonaValidationError(
          PersonaErrorCode.INVALID_SCHEMA,
          "Test"
        );
        const standardError = new Error("Regular error");

        expect(isPersonaError(personaError)).toBe(true);
        expect(isPersonaError(validationError)).toBe(true);
        expect(isPersonaError(standardError)).toBe(false);
        expect(isPersonaError(null)).toBe(false);
        expect(isPersonaError(undefined)).toBe(false);
        expect(isPersonaError("string")).toBe(false);
      });
    });

    describe("isRecoverableError", () => {
      it("should check if error is recoverable", () => {
        const recoverableError = new PersonaError(
          PersonaErrorCode.VALIDATION_FAILED,
          "Test",
          { recoverable: true }
        );

        const nonRecoverableError = new PersonaError(
          PersonaErrorCode.ACTIVATION_FAILED,
          "Test",
          { recoverable: false }
        );

        expect(isRecoverableError(recoverableError)).toBe(true);
        expect(isRecoverableError(nonRecoverableError)).toBe(false);
      });
    });

    describe("getErrorCode", () => {
      it("should extract error code from PersonaError", () => {
        const error = new PersonaError(
          PersonaErrorCode.TOOL_RESOLUTION_FAILED,
          "Test"
        );
        const standardError = new Error("Standard error");

        expect(getErrorCode(error)).toBe(
          PersonaErrorCode.TOOL_RESOLUTION_FAILED
        );
        expect(getErrorCode(standardError)).toBeUndefined();
        expect(getErrorCode(null)).toBeUndefined();
        expect(getErrorCode(undefined)).toBeUndefined();
      });
    });

    describe("formatErrorForUser", () => {
      it("should format error for user display", () => {
        const error = new PersonaError(
          PersonaErrorCode.ACTIVATION_FAILED,
          "Activation failed",
          {
            suggestions: ["Check configuration", "Restart MCP servers"],
            details: { persona: "test" },
          }
        );

        const formatted = formatErrorForUser(error);

        expect(formatted).toBe(error.getFormattedMessage());
        expect(formatted).toContain("[ACTIVATION_FAILED]");
        expect(formatted).toContain("Suggestions:");
        expect(formatted).toContain("Check configuration");
      });
    });

    describe("createErrorSummary", () => {
      it("should create summary for empty error list", () => {
        const summary = createErrorSummary([]);
        expect(summary).toBe("No errors");
      });

      it("should create summary for single error", () => {
        const error = new PersonaError(
          PersonaErrorCode.VALIDATION_FAILED,
          "Test error"
        );
        const summary = createErrorSummary([error]);

        expect(summary).toContain("Found 1 error:");
        expect(summary).toContain("PersonaError (1):");
        expect(summary).toContain("[VALIDATION_FAILED] Test error");
      });

      it("should create summary for multiple errors", () => {
        const errors = [
          new PersonaValidationError(
            PersonaErrorCode.INVALID_SCHEMA,
            "Schema error"
          ),
          new PersonaActivationError(
            PersonaErrorCode.ACTIVATION_FAILED,
            "Activation error"
          ),
          new PersonaValidationError(
            PersonaErrorCode.YAML_PARSE_ERROR,
            "YAML error"
          ),
        ];

        const summary = createErrorSummary(errors);

        expect(summary).toContain("Found 3 errors:");
        expect(summary).toContain("PersonaValidationError (2):");
        expect(summary).toContain("PersonaActivationError (1):");
        expect(summary).toContain("[INVALID_SCHEMA] Schema error");
        expect(summary).toContain("[ACTIVATION_FAILED] Activation error");
        expect(summary).toContain("[YAML_PARSE_ERROR] YAML error");
      });

      it("should include recoverable error count", () => {
        const errors = [
          new PersonaError(PersonaErrorCode.VALIDATION_FAILED, "Test 1", {
            recoverable: true,
          }),
          new PersonaError(PersonaErrorCode.ACTIVATION_FAILED, "Test 2", {
            recoverable: false,
          }),
          new PersonaError(PersonaErrorCode.TOOL_RESOLUTION_FAILED, "Test 3", {
            recoverable: true,
          }),
        ];

        const summary = createErrorSummary(errors);

        expect(summary).toContain("Note: 2 errors are recoverable");
      });

      it("should handle single recoverable error", () => {
        const errors = [
          new PersonaError(PersonaErrorCode.VALIDATION_FAILED, "Test", {
            recoverable: true,
          }),
        ];

        const summary = createErrorSummary(errors);

        expect(summary).toContain("Note: 1 error is recoverable");
      });
    });
  });

  describe("Error Consistency", () => {
    it("should have consistent error naming convention", () => {
      const errors = [
        new PersonaError(PersonaErrorCode.VALIDATION_FAILED, "Test"),
        new PersonaDiscoveryError(PersonaErrorCode.PERSONA_NOT_FOUND, "Test"),
        new PersonaValidationError(PersonaErrorCode.INVALID_SCHEMA, "Test"),
        new PersonaActivationError(PersonaErrorCode.ACTIVATION_FAILED, "Test"),
        new PersonaRuntimeError(PersonaErrorCode.FILE_SYSTEM_ERROR, "Test"),
      ];

      errors.forEach((error) => {
        expect(error.name).toMatch(/^Persona.*Error$/);
        expect(error.code).toMatch(/^[A-Z][A-Z_]*[A-Z]$/);
      });
    });

    it("should maintain proper inheritance chain", () => {
      const validationError = new PersonaValidationError(
        PersonaErrorCode.INVALID_SCHEMA,
        "Test"
      );

      expect(validationError).toBeInstanceOf(Error);
      expect(validationError).toBeInstanceOf(PersonaError);
      expect(validationError).toBeInstanceOf(PersonaValidationError);
      expect(validationError.name).toBe("PersonaValidationError");
    });

    it("should have consistent JSON serialization", () => {
      const errors = [
        new PersonaError(PersonaErrorCode.VALIDATION_FAILED, "Test"),
        new PersonaValidationError(PersonaErrorCode.INVALID_SCHEMA, "Test"),
        new PersonaActivationError(PersonaErrorCode.ACTIVATION_FAILED, "Test"),
      ];

      errors.forEach((error) => {
        const json = error.toJSON();
        expect(json.name).toBeDefined();
        expect(json.code).toBeDefined();
        expect(json.message).toBeDefined();
        expect(json.details).toBeDefined();
        expect(json.suggestions).toBeDefined();
        expect(json.recoverable).toBeDefined();
        expect(json.stack).toBeDefined();
      });
    });
  });

  describe("Edge Cases", () => {
    it("should handle errors with null/undefined options", () => {
      const error = new PersonaError(
        PersonaErrorCode.VALIDATION_FAILED,
        "Test message",
        {
          details: undefined,
          suggestions: undefined,
          recoverable: undefined,
          cause: undefined,
        } as any
      );

      expect(error.details).toEqual({});
      expect(error.suggestions).toEqual([]);
      expect(error.recoverable).toBe(false);
      expect((error as any).cause).toBeUndefined();
    });

    it("should handle empty formatted message", () => {
      const error = new PersonaError(PersonaErrorCode.VALIDATION_FAILED, "");

      const formatted = error.getFormattedMessage();
      expect(formatted).toContain("[VALIDATION_FAILED]");
    });

    it("should handle error with empty details and suggestions", () => {
      const error = new PersonaError(
        PersonaErrorCode.VALIDATION_FAILED,
        "Test message",
        {
          details: {},
          suggestions: [],
        }
      );

      const formatted = error.getFormattedMessage();
      expect(formatted).not.toContain("Suggestions:");
      expect(formatted).not.toContain("Details:");
    });
  });
});
