/**
 * PersonaScanner Test Suite
 *
 * Comprehensive tests for file system scanning functionality, including directory traversal,
 * permission handling, ignore patterns, parallel/sequential scanning, and edge cases
 * with various file system scenarios.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { promises as fs, constants as fsConstants } from "fs";
import { join, resolve } from "path";
import { tmpdir, homedir } from "os";
import {
  scanForPersonas,
  scanDirectory,
  isPersonaDirectory,
  isPersonaArchive,
  getStandardSearchPaths,
  validateSearchPath,
  hasPersonasInPaths,
} from "./scanner.js";
import { clearDiscoveryCache } from "./discovery.js";
import type { PersonaReference, PersonaDiscoveryConfig } from "./types.js";

// Mock console.warn to avoid noise in tests
const originalConsoleWarn = console.warn;
beforeEach(() => {
  console.warn = vi.fn();
});

afterEach(() => {
  console.warn = originalConsoleWarn;
});

describe("PersonaScanner", () => {
  let tempDir: string;
  let testStructure: {
    [key: string]: string | { [key: string]: string };
  };

  beforeEach(async () => {
    // Create temporary directory for test files
    tempDir = await fs.mkdtemp(join(tmpdir(), "persona-scanner-test-"));

    // Override persona directory to use temp directory for tests
    process.env.HYPERTOOL_PERSONA_DIR = tempDir;

    // Define test directory structure
    testStructure = {
      // Valid persona directories
      "valid-persona": {
        "persona.yaml": `
name: valid-persona
description: A valid persona for testing
toolsets:
  - name: development
    toolIds: ["git.status", "docker.ps"]
`,
        "assets/README.md": "# Valid Persona Documentation",
      },

      "yaml-persona": {
        "persona.yml": `
name: yaml-persona
description: A persona with .yml extension
`,
      },

      "minimal-persona": {
        "persona.yaml": `
name: minimal-persona
description: Minimal persona configuration
`,
      },

      // Invalid persona directories
      "invalid-persona": {
        "persona.yaml": `invalid yaml content: [unclosed`,
      },

      "no-config-persona": {
        "README.md": "This directory has no persona config",
        "other.yaml": "not a persona config",
      },

      // Nested structure
      nested: {
        level1: {
          "nested-persona": {
            "persona.yaml": `
name: nested-persona
description: A persona in nested directory
`,
          },
        },
        "level1/deep": {
          "deep-persona": {
            "persona.yaml": `
name: deep-persona
description: A deeply nested persona
`,
          },
        },
      },

      // Ignored directories
      node_modules: {
        "ignored-persona": {
          "persona.yaml": "should be ignored",
        },
      },

      ".git": {
        "ignored-persona": {
          "persona.yaml": "should be ignored",
        },
      },

      // Archive files
      "archive-persona.htp": "mock archive content",
      "invalid-archive.zip": "not a supported archive",

      // Symbolic links (we'll create these separately)
    };

    // Create test directory structure
    await createTestStructure(tempDir, testStructure);

    // Create symbolic link tests (if supported on the platform)
    try {
      await fs.mkdir(join(tempDir, "symlink-target"));
      await fs.writeFile(
        join(tempDir, "symlink-target", "persona.yaml"),
        "name: symlink-persona\ndescription: Persona accessed via symlink"
      );
      await fs.symlink(
        join(tempDir, "symlink-target"),
        join(tempDir, "symlink-persona")
      );
    } catch {
      // Ignore symlink creation failures (Windows without admin rights)
    }
  });

  afterEach(async () => {
    // Clear discovery cache to prevent test pollution
    clearDiscoveryCache();

    // Clean up environment variable
    delete process.env.HYPERTOOL_PERSONA_DIR;

    // Clean up temporary files
    try {
      await fs.rmdir(tempDir, { recursive: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("scanForPersonas", () => {
    describe("Basic Scanning", () => {
      it("should discover valid persona directories", async () => {
        const config: PersonaDiscoveryConfig = {
          additionalPaths: [tempDir],
          maxDepth: 3,
        };

        const result = await scanForPersonas(config);

        // Filter out any discovered personas from standard paths
        const testPersonas = result.personas.filter((p) =>
          p.path.startsWith(tempDir)
        );

        expect(testPersonas.length).toBeGreaterThanOrEqual(3);

        const personaNames = testPersonas.map((p) => p.name);
        expect(personaNames).toContain("valid-persona");
        expect(personaNames).toContain("yaml-persona");
        expect(personaNames).toContain("minimal-persona");

        // Check persona properties
        const validPersona = testPersonas.find(
          (p) => p.name === "valid-persona"
        );
        expect(validPersona).toBeDefined();
        expect(validPersona?.isArchive).toBe(false);
        expect(validPersona?.isValid).toBe(true);
        expect(validPersona?.path).toBe(join(tempDir, "valid-persona"));
        expect(validPersona?.description).toContain("valid persona");
      });

      it("should discover archive files", async () => {
        const config: PersonaDiscoveryConfig = {
          additionalPaths: [tempDir],
        };

        const result = await scanForPersonas(config);
        const testPersonas = result.personas.filter((p) =>
          p.path.startsWith(tempDir)
        );

        const archivePersona = testPersonas.find(
          (p) => p.name === "archive-persona"
        );
        expect(archivePersona).toBeDefined();
        expect(archivePersona?.isArchive).toBe(true);
        expect(archivePersona?.path).toBe(join(tempDir, "archive-persona.htp"));
      });

      it("should handle nested directories within depth limit", async () => {
        const config: PersonaDiscoveryConfig = {
          additionalPaths: [tempDir],
          maxDepth: 3,
        };

        const result = await scanForPersonas(config);
        const testPersonas = result.personas.filter((p) =>
          p.path.startsWith(tempDir)
        );

        const nestedPersona = testPersonas.find(
          (p) => p.name === "nested-persona"
        );
        expect(nestedPersona).toBeDefined();
        expect(nestedPersona?.path).toBe(
          join(tempDir, "nested/level1/nested-persona")
        );
      });

      it("should respect max depth limit", async () => {
        const config: PersonaDiscoveryConfig = {
          additionalPaths: [tempDir],
          maxDepth: 2, // Should not reach nested-persona at level 3, or deep-persona at level 4
        };

        const result = await scanForPersonas(config);
        const testPersonas = result.personas.filter((p) =>
          p.path.startsWith(tempDir)
        );

        const deepPersona = testPersonas.find((p) => p.name === "deep-persona");
        expect(deepPersona).toBeUndefined();

        const nestedPersona = testPersonas.find(
          (p) => p.name === "nested-persona"
        );
        expect(nestedPersona).toBeUndefined(); // Should not be found - it's at depth 3

        // But with maxDepth = 4, nested-persona should be found
        const config4: PersonaDiscoveryConfig = {
          additionalPaths: [tempDir],
          maxDepth: 4,
        };
        const result4 = await scanForPersonas(config4);
        const testPersonas4 = result4.personas.filter((p) =>
          p.path.startsWith(tempDir)
        );
        const nestedPersona4 = testPersonas4.find(
          (p) => p.name === "nested-persona"
        );
        expect(nestedPersona4).toBeDefined(); // Should be found at depth 3 with maxDepth 4
      });
    });

    describe("Ignore Patterns", () => {
      it("should ignore default patterns", async () => {
        const config: PersonaDiscoveryConfig = {
          additionalPaths: [tempDir],
        };

        const result = await scanForPersonas(config);
        const testPersonas = result.personas.filter((p) =>
          p.path.startsWith(tempDir)
        );

        // Should not find personas in node_modules or .git
        const ignoredPersonas = testPersonas.filter(
          (p) => p.path.includes("node_modules") || p.path.includes(".git")
        );
        expect(ignoredPersonas).toHaveLength(0);
      });

      it("should apply custom ignore patterns", async () => {
        const config: PersonaDiscoveryConfig = {
          additionalPaths: [tempDir],
          ignorePatterns: ["**/valid-persona/**", "**/minimal-persona"],
        };

        const result = await scanForPersonas(config);
        const testPersonas = result.personas.filter((p) =>
          p.path.startsWith(tempDir)
        );

        const ignoredPersonas = testPersonas.filter(
          (p) => p.name === "valid-persona" || p.name === "minimal-persona"
        );
        expect(ignoredPersonas).toHaveLength(0);

        // Should still find yaml-persona
        const yamlPersona = testPersonas.find((p) => p.name === "yaml-persona");
        expect(yamlPersona).toBeDefined();
      });
    });

    describe("Parallel vs Sequential Scanning", () => {
      it("should scan in parallel by default", async () => {
        const config: PersonaDiscoveryConfig = {
          additionalPaths: [tempDir],
          parallelScan: true,
        };

        const startTime = Date.now();
        const result = await scanForPersonas(config);
        const duration = Date.now() - startTime;

        expect(result.personas).toBeDefined();
        // Parallel scanning should be reasonably fast
        expect(duration).toBeLessThan(5000);
      });

      it("should scan sequentially when requested", async () => {
        const config: PersonaDiscoveryConfig = {
          additionalPaths: [tempDir],
          parallelScan: false,
        };

        const result = await scanForPersonas(config);
        const testPersonas = result.personas.filter((p) =>
          p.path.startsWith(tempDir)
        );

        expect(testPersonas.length).toBeGreaterThan(0);
      });
    });

    describe("Symbolic Links", () => {
      it("should ignore symbolic links by default", async () => {
        const config: PersonaDiscoveryConfig = {
          additionalPaths: [tempDir],
          followSymlinks: false,
        };

        const result = await scanForPersonas(config);
        const testPersonas = result.personas.filter((p) =>
          p.path.startsWith(tempDir)
        );

        const symlinkPersona = testPersonas.find(
          (p) => p.name === "symlink-persona"
        );
        // Should not be found when not following symlinks
        expect(symlinkPersona).toBeUndefined();
      });

      it("should follow symbolic links when enabled", async () => {
        // Skip this test if symlinks weren't created successfully
        try {
          await fs.access(join(tempDir, "symlink-persona"));
        } catch {
          // Symlink creation failed, skip test
          return;
        }

        const config: PersonaDiscoveryConfig = {
          additionalPaths: [tempDir],
          followSymlinks: true,
        };

        const result = await scanForPersonas(config);
        const testPersonas = result.personas.filter((p) =>
          p.path.startsWith(tempDir)
        );

        const symlinkPersona = testPersonas.find(
          (p) => p.name === "symlink-persona"
        );
        expect(symlinkPersona).toBeDefined();
      });
    });

    describe("Error Handling", () => {
      it("should handle permission denied errors gracefully", async () => {
        // Create a directory without read permissions (on Unix systems)
        const restrictedDir = join(tempDir, "restricted");
        await fs.mkdir(restrictedDir);

        try {
          await fs.chmod(restrictedDir, 0o000); // Remove all permissions
        } catch {
          // Skip test on systems that don't support chmod
          return;
        }

        const config: PersonaDiscoveryConfig = {
          additionalPaths: [tempDir],
        };

        // Should not throw, but might log warnings
        const result = await scanForPersonas(config);
        expect(result.personas).toBeDefined();

        // Restore permissions for cleanup
        try {
          await fs.chmod(restrictedDir, 0o755);
        } catch {
          // Ignore cleanup errors
        }
      });

      it("should handle non-existent directories", async () => {
        const config: PersonaDiscoveryConfig = {
          additionalPaths: ["/non/existent/path"],
        };

        const result = await scanForPersonas(config);
        expect(result.personas).toBeDefined();
        expect(console.warn).toHaveBeenCalled();
      });
    });

    describe("Deduplication", () => {
      it("should remove duplicate personas found in multiple paths", async () => {
        const config: PersonaDiscoveryConfig = {
          additionalPaths: [tempDir, tempDir], // Same path twice
        };

        const result = await scanForPersonas(config);
        const testPersonas = result.personas.filter((p) =>
          p.path.startsWith(tempDir)
        );

        // Should not have duplicates based on path
        const uniquePaths = new Set(testPersonas.map((p) => p.path));
        expect(testPersonas).toHaveLength(uniquePaths.size);
      });
    });
  });

  describe("scanDirectory", () => {
    it("should scan a specific directory", async () => {
      const personas = await scanDirectory(tempDir);

      expect(personas.length).toBeGreaterThan(0);
      const personaNames = personas.map((p) => p.name);
      expect(personaNames).toContain("valid-persona");
    });

    it("should handle directory scan options", async () => {
      const personas = await scanDirectory(tempDir, {
        maxDepth: 1,
        ignorePatterns: ["**/valid-persona"],
      });

      const validPersona = personas.find((p) => p.name === "valid-persona");
      expect(validPersona).toBeUndefined();
    });

    it("should handle non-existent directory", async () => {
      await expect(scanDirectory("/non/existent/path")).rejects.toThrow();
    });
  });

  describe("isPersonaDirectory", () => {
    it("should identify valid persona directories", async () => {
      const validDir = join(tempDir, "valid-persona");
      const isPersona = await isPersonaDirectory(validDir);
      expect(isPersona).toBe(true);
    });

    it("should reject directories without persona config", async () => {
      const invalidDir = join(tempDir, "no-config-persona");
      const isPersona = await isPersonaDirectory(invalidDir);
      expect(isPersona).toBe(false);
    });

    it("should reject non-existent directories", async () => {
      const nonExistentDir = join(tempDir, "does-not-exist");
      const isPersona = await isPersonaDirectory(nonExistentDir);
      expect(isPersona).toBe(false);
    });

    it("should reject files", async () => {
      const filePath = join(tempDir, "archive-persona.htp");
      const isPersona = await isPersonaDirectory(filePath);
      expect(isPersona).toBe(false);
    });
  });

  describe("isPersonaArchive", () => {
    it("should identify valid persona archives", async () => {
      const archivePath = join(tempDir, "archive-persona.htp");
      const isArchive = await isPersonaArchive(archivePath);
      expect(isArchive).toBe(true);
    });

    it("should reject unsupported archive formats", async () => {
      const invalidArchive = join(tempDir, "invalid-archive.zip");
      const isArchive = await isPersonaArchive(invalidArchive);
      expect(isArchive).toBe(false);
    });

    it("should reject directories", async () => {
      const dirPath = join(tempDir, "valid-persona");
      const isArchive = await isPersonaArchive(dirPath);
      expect(isArchive).toBe(false);
    });

    it("should reject non-existent files", async () => {
      const nonExistentFile = join(tempDir, "does-not-exist.htp");
      const isArchive = await isPersonaArchive(nonExistentFile);
      expect(isArchive).toBe(false);
    });
  });

  describe("getStandardSearchPaths", () => {
    it("should return configured persona directory", () => {
      // Temporarily clear environment variable to test default paths
      const originalEnv = process.env.HYPERTOOL_PERSONA_DIR;
      delete process.env.HYPERTOOL_PERSONA_DIR;
      try {
        const paths = getStandardSearchPaths();

        expect(paths).toHaveLength(1); // Changed from 3 to 1
        expect(paths[0]).toContain(".toolprint");
        expect(paths[0]).toContain("hypertool-mcp");
        expect(paths[0]).toContain("personas");
      } finally {
        if (originalEnv) {
          process.env.HYPERTOOL_PERSONA_DIR = originalEnv;
        }
      }
    });

    it("should return absolute path", () => {
      const paths = getStandardSearchPaths();

      // Path should be absolute (no ~ or relative paths)
      expect(paths[0]).not.toContain("~");
      expect(paths[0]).toMatch(/^\/|^[A-Z]:\\/); // Unix absolute or Windows absolute
    });
  });

  describe("validateSearchPath", () => {
    it("should validate existing accessible directories", async () => {
      const isValid = await validateSearchPath(tempDir);
      expect(isValid).toBe(true);
    });

    it("should reject non-existent paths", async () => {
      const isValid = await validateSearchPath("/non/existent/path");
      expect(isValid).toBe(false);
    });

    it("should reject files", async () => {
      const filePath = join(tempDir, "archive-persona.htp");
      const isValid = await validateSearchPath(filePath);
      expect(isValid).toBe(false);
    });

    it("should expand tilde paths", async () => {
      const isValid = await validateSearchPath("~");
      expect(isValid).toBe(true); // Home directory should exist
    });
  });

  describe("hasPersonasInPaths", () => {
    it("should detect presence of personas", async () => {
      const config: PersonaDiscoveryConfig = {
        additionalPaths: [tempDir],
      };

      const hasPersonas = await hasPersonasInPaths(config);
      expect(hasPersonas).toBe(true);
    });

    it("should return false for paths without personas", async () => {
      const emptyDir = join(tempDir, "empty");
      await fs.mkdir(emptyDir);

      const config: PersonaDiscoveryConfig = {
        additionalPaths: [emptyDir],
      };

      const hasPersonas = await hasPersonasInPaths(config);
      expect(hasPersonas).toBe(false);
    });

    it("should handle non-existent paths", async () => {
      const config: PersonaDiscoveryConfig = {
        additionalPaths: ["/non/existent/path"],
      };

      const hasPersonas = await hasPersonasInPaths(config);
      expect(hasPersonas).toBe(false);
    });
  });

  describe("Edge Cases and Error Handling", () => {
    it("should handle circular symbolic links gracefully", async () => {
      try {
        // Create circular symlinks
        const link1 = join(tempDir, "link1");
        const link2 = join(tempDir, "link2");

        await fs.symlink(link2, link1);
        await fs.symlink(link1, link2);

        const config: PersonaDiscoveryConfig = {
          additionalPaths: [tempDir],
          followSymlinks: true,
          maxDepth: 2, // Limit depth to prevent infinite loops
        };

        const result = await scanForPersonas(config);
        expect(result.personas).toBeDefined();
      } catch {
        // Skip test if symlinks aren't supported
      }
    });

    it("should handle very deep directory structures", async () => {
      // Create a deep directory structure
      let deepPath = tempDir;
      for (let i = 0; i < 10; i++) {
        deepPath = join(deepPath, `level${i}`);
        await fs.mkdir(deepPath);
      }

      // Add a persona at the deepest level
      await fs.writeFile(
        join(deepPath, "persona.yaml"),
        "name: deep-persona\ndescription: Very deep persona"
      );

      const config: PersonaDiscoveryConfig = {
        additionalPaths: [tempDir],
        maxDepth: 15, // Allow deep scanning
      };

      const result = await scanForPersonas(config);
      const deepPersona = result.personas.find(
        (p) => p.name === "deep-persona"
      );
      expect(deepPersona).toBeDefined();
    });

    it("should handle directories with many entries", async () => {
      const manyEntriesDir = join(tempDir, "many-entries");
      await fs.mkdir(manyEntriesDir);

      // Create many files and directories
      for (let i = 0; i < 100; i++) {
        await fs.writeFile(join(manyEntriesDir, `file${i}.txt`), "content");
      }

      // Add one persona
      const personaDir = join(manyEntriesDir, "test-persona");
      await fs.mkdir(personaDir);
      await fs.writeFile(
        join(personaDir, "persona.yaml"),
        "name: test-persona\ndescription: Persona among many entries"
      );

      const personas = await scanDirectory(manyEntriesDir);
      const testPersona = personas.find((p) => p.name === "test-persona");
      expect(testPersona).toBeDefined();
    });

    it("should handle invalid YAML content gracefully", async () => {
      const personas = await scanDirectory(tempDir);
      const invalidPersona = personas.find((p) => p.name === "invalid-persona");

      expect(invalidPersona).toBeDefined();
      expect(invalidPersona?.isValid).toBe(true); // Scanner only checks file existence
      expect(invalidPersona?.description).toBeUndefined(); // Failed to parse description
    });
  });

  describe("Performance", () => {
    it("should complete scanning within reasonable time", async () => {
      const startTime = Date.now();

      const config: PersonaDiscoveryConfig = {
        additionalPaths: [tempDir],
        parallelScan: true,
      };

      await scanForPersonas(config);

      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
    });
  });
});

// Helper function to create test directory structure
async function createTestStructure(
  basePath: string,
  structure: { [key: string]: string | { [key: string]: string } }
): Promise<void> {
  for (const [name, content] of Object.entries(structure)) {
    const itemPath = join(basePath, name);

    if (typeof content === "string") {
      // It's a file
      const dir = itemPath.substring(0, itemPath.lastIndexOf("/"));
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(itemPath, content);
    } else {
      // It's a directory structure
      await fs.mkdir(itemPath, { recursive: true });
      await createTestStructure(itemPath, content);
    }
  }
}
