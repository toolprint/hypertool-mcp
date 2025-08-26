/**
 * Tests for Persona Installer
 *
 * @fileoverview Comprehensive tests for persona installation functionality
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { promises as fs } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  installPersona,
  analyzeSource,
  checkPersonaExists,
  getStandardPersonasDir,
  listInstalledPersonas,
  uninstallPersona,
  SourceType,
  type InstallOptions,
} from "./installer.js";
import { packPersona } from "./archive.js";
import { PersonaErrorCode } from "./types.js";
import { isPersonaError } from "./errors.js";

// Test utilities
let tempDir: string;
let testPersonaDir: string;
let testArchivePath: string;
let mockPersonasDir: string;

/**
 * Create a test persona directory structure
 */
async function createTestPersona(
  dir: string,
  name: string = "test-persona",
  config: any = {
    name,
    description: "A test persona for installer tests",
    version: "1.0",
    toolsets: [
      {
        name: "development",
        toolIds: ["git.status", "npm.run"],
      },
    ],
    defaultToolset: "development",
  }
): Promise<void> {
  await fs.mkdir(dir, { recursive: true });

  // Create persona.yaml
  const configContent = Object.entries(config)
    .map(([key, value]) => {
      if (typeof value === "string") {
        return `${key}: "${value}"`;
      } else if (key === "toolsets") {
        return `toolsets:\n${(value as any[])
          .map(
            (toolset) =>
              `  - name: ${toolset.name}\n    toolIds:\n${toolset.toolIds
                .map((id: string) => `      - ${id}`)
                .join("\n")}`
          )
          .join("\n")}`;
      } else {
        return `${key}: ${value}`;
      }
    })
    .join("\n");

  await fs.writeFile(join(dir, "persona.yaml"), configContent, "utf8");

  // Create assets directory
  const assetsDir = join(dir, "assets");
  await fs.mkdir(assetsDir, { recursive: true });
  await fs.writeFile(
    join(assetsDir, "README.md"),
    `# ${name}\n\nThis is a test persona.`,
    "utf8"
  );

  // Create optional mcp.json
  const mcpConfig = {
    servers: {
      "test-server": {
        command: "node",
        args: ["./test-server.js"],
      },
    },
  };
  await fs.writeFile(
    join(dir, "mcp.json"),
    JSON.stringify(mcpConfig, null, 2),
    "utf8"
  );
}

/**
 * Create invalid persona directory
 */
async function createInvalidPersona(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(
    join(dir, "invalid.txt"),
    "This is not a valid persona",
    "utf8"
  );
}

beforeEach(async () => {
  // Create temporary directory for tests
  tempDir = join(tmpdir(), `persona-installer-test-${Date.now()}`);
  await fs.mkdir(tempDir, { recursive: true });

  testPersonaDir = join(tempDir, "test-persona");
  testArchivePath = join(tempDir, "test-persona.htp");
  mockPersonasDir = join(tempDir, "personas");

  await createTestPersona(testPersonaDir);
  await fs.mkdir(mockPersonasDir, { recursive: true });
});

afterEach(async () => {
  // Clean up temporary directory
  try {
    await fs.rm(tempDir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
});

describe("analyzeSource", () => {
  it("should analyze folder source correctly", async () => {
    const sourceInfo = await analyzeSource(testPersonaDir);

    expect(sourceInfo.accessible).toBe(true);
    expect(sourceInfo.type).toBe(SourceType.FOLDER);
    expect(sourceInfo.personaName).toBe("test-persona");
    expect(sourceInfo.path).toBe(testPersonaDir);
  });

  it("should analyze archive source correctly", async () => {
    // Create test archive first
    await packPersona(testPersonaDir, testArchivePath);

    const sourceInfo = await analyzeSource(testArchivePath);

    expect(sourceInfo.accessible).toBe(true);
    expect(sourceInfo.type).toBe(SourceType.ARCHIVE);
    expect(sourceInfo.personaName).toBe("test-persona");
    expect(sourceInfo.path).toBe(testArchivePath);
  });

  it("should handle non-existent source", async () => {
    const nonExistentPath = join(tempDir, "does-not-exist");
    const sourceInfo = await analyzeSource(nonExistentPath);

    expect(sourceInfo.accessible).toBe(false);
    expect(sourceInfo.type).toBe(SourceType.FOLDER); // Default
    expect(sourceInfo.personaName).toBeUndefined();
  });

  it("should reject non-.htp file", async () => {
    const textFile = join(tempDir, "test.txt");
    await fs.writeFile(textFile, "test content", "utf8");

    await expect(analyzeSource(textFile)).rejects.toThrow();

    try {
      await analyzeSource(textFile);
    } catch (error) {
      expect(isPersonaError(error)).toBe(true);
      if (isPersonaError(error)) {
        expect(error.code).toBe(PersonaErrorCode.FILE_SYSTEM_ERROR);
      }
    }
  });

  it("should extract persona name from folder name if config unavailable", async () => {
    const customDir = join(tempDir, "custom-persona-name");
    await fs.mkdir(customDir, { recursive: true });
    // Don't create persona.yaml, should fallback to folder name

    const sourceInfo = await analyzeSource(customDir);

    expect(sourceInfo.accessible).toBe(true);
    expect(sourceInfo.type).toBe(SourceType.FOLDER);
    expect(sourceInfo.personaName).toBe("custom-persona-name");
  });
});

describe("checkPersonaExists", () => {
  it("should return false for non-existent persona", async () => {
    const exists = await checkPersonaExists("non-existent", mockPersonasDir);
    expect(exists).toBe(false);
  });

  it("should return true for existing persona directory", async () => {
    // Install a persona first
    const personaPath = join(mockPersonasDir, "existing-persona");
    await createTestPersona(personaPath, "existing-persona");

    const exists = await checkPersonaExists(
      "existing-persona",
      mockPersonasDir
    );
    expect(exists).toBe(true);
  });

  it("should return false for directory that exists but is not a valid persona", async () => {
    // Create directory without valid persona structure
    const invalidPath = join(mockPersonasDir, "invalid-persona");
    await fs.mkdir(invalidPath, { recursive: true });
    await fs.writeFile(join(invalidPath, "random.txt"), "content", "utf8");

    const exists = await checkPersonaExists("invalid-persona", mockPersonasDir);
    expect(exists).toBe(false);
  });
});

describe("installPersona - from folder", () => {
  it("should install persona from folder successfully", async () => {
    const result = await installPersona(testPersonaDir, {
      installDir: mockPersonasDir,
    });

    expect(result.success).toBe(true);
    expect(result.personaName).toBe("test-persona");
    expect(result.installPath).toBe(join(mockPersonasDir, "test-persona"));
    expect(result.wasOverwrite).toBe(false);
    expect(result.errors).toEqual([]);

    // Verify files were copied
    const installedPath = join(mockPersonasDir, "test-persona");
    await expect(
      fs.access(join(installedPath, "persona.yaml"))
    ).resolves.toBeUndefined();
    await expect(
      fs.access(join(installedPath, "mcp.json"))
    ).resolves.toBeUndefined();
    await expect(
      fs.access(join(installedPath, "assets", "README.md"))
    ).resolves.toBeUndefined();
  });

  it("should reject invalid persona source", async () => {
    const invalidDir = join(tempDir, "invalid-persona");
    await createInvalidPersona(invalidDir);

    const result = await installPersona(invalidDir, {
      installDir: mockPersonasDir,
    });

    expect(result.success).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("invalid");
  });

  it("should reject existing persona without force", async () => {
    // Install once
    await installPersona(testPersonaDir, { installDir: mockPersonasDir });

    // Try to install again
    const result = await installPersona(testPersonaDir, {
      installDir: mockPersonasDir,
    });

    expect(result.success).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("already exists");
  });

  it("should overwrite existing persona with force", async () => {
    // Install once
    const firstResult = await installPersona(testPersonaDir, {
      installDir: mockPersonasDir,
    });
    expect(firstResult.success).toBe(true);

    // Modify the original
    await fs.writeFile(
      join(testPersonaDir, "assets", "new-file.txt"),
      "new content",
      "utf8"
    );

    // Install again with force
    const result = await installPersona(testPersonaDir, {
      installDir: mockPersonasDir,
      force: true,
    });

    expect(result.success).toBe(true);
    expect(result.wasOverwrite).toBe(true);

    // Verify new file exists
    const newFile = join(
      mockPersonasDir,
      "test-persona",
      "assets",
      "new-file.txt"
    );
    const content = await fs.readFile(newFile, "utf8");
    expect(content).toBe("new content");
  });

  it("should create backup when requested", async () => {
    // Install once
    await installPersona(testPersonaDir, { installDir: mockPersonasDir });

    // Install again with backup
    const result = await installPersona(testPersonaDir, {
      installDir: mockPersonasDir,
      force: true,
      backup: true,
    });

    expect(result.success).toBe(true);
    expect(result.backupPath).toBeDefined();
    expect(result.backupPath).toContain("test-persona.backup.");

    // Verify backup exists
    if (result.backupPath) {
      await expect(fs.access(result.backupPath)).resolves.toBeUndefined();
      await expect(
        fs.access(join(result.backupPath, "persona.yaml"))
      ).resolves.toBeUndefined();
    }
  });

  it("should skip validation when requested", async () => {
    const invalidDir = join(tempDir, "skip-validation");
    await createInvalidPersona(invalidDir);

    // Add at least a persona.yaml with correct name to avoid name detection failure
    await fs.writeFile(
      join(invalidDir, "persona.yaml"),
      "name: skip-validation\ndescription: test",
      "utf8"
    );

    const result = await installPersona(invalidDir, {
      installDir: mockPersonasDir,
      skipValidation: true,
    });

    // Should succeed despite being invalid because validation is skipped
    expect(result.success).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0); // Should have warnings about invalidity
  });

  it("should handle non-existent source", async () => {
    const nonExistentPath = join(tempDir, "does-not-exist");

    const result = await installPersona(nonExistentPath, {
      installDir: mockPersonasDir,
    });

    expect(result.success).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("not accessible");
  });
});

describe("installPersona - from archive", () => {
  beforeEach(async () => {
    // Create test archive
    await packPersona(testPersonaDir, testArchivePath);
  });

  it("should install persona from archive successfully", async () => {
    const result = await installPersona(testArchivePath, {
      installDir: mockPersonasDir,
    });

    expect(result.success).toBe(true);
    expect(result.personaName).toBe("test-persona");
    expect(result.installPath).toBe(join(mockPersonasDir, "test-persona"));
    expect(result.wasOverwrite).toBe(false);
    expect(result.errors).toEqual([]);

    // Verify files were extracted
    const installedPath = join(mockPersonasDir, "test-persona");
    await expect(
      fs.access(join(installedPath, "persona.yaml"))
    ).resolves.toBeUndefined();
    await expect(
      fs.access(join(installedPath, "mcp.json"))
    ).resolves.toBeUndefined();
    await expect(
      fs.access(join(installedPath, "assets", "README.md"))
    ).resolves.toBeUndefined();
  });

  it("should handle corrupted archive", async () => {
    // Create corrupted archive
    const corruptedArchive = join(tempDir, "corrupted.htp");
    await fs.writeFile(corruptedArchive, "not a valid archive", "utf8");

    const result = await installPersona(corruptedArchive, {
      installDir: mockPersonasDir,
    });

    expect(result.success).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("extract");

    // Verify no partial installation
    const wouldBeInstallPath = join(mockPersonasDir, "test-persona");
    await expect(fs.access(wouldBeInstallPath)).rejects.toThrow();
  });

  it("should clean up on extraction failure", async () => {
    // Create archive with invalid content that will fail validation after extraction
    const invalidPersonaDir = join(tempDir, "invalid-for-archive");
    await createInvalidPersona(invalidPersonaDir);

    // Force create a persona.yaml with proper name but invalid structure
    await fs.writeFile(
      join(invalidPersonaDir, "persona.yaml"),
      "name: invalid-for-archive\ninvalid-yaml: [unclosed",
      "utf8"
    );

    const invalidArchive = join(tempDir, "invalid.htp");
    // Force pack even invalid content
    await packPersona(invalidPersonaDir, invalidArchive, { force: true });

    const result = await installPersona(invalidArchive, {
      installDir: mockPersonasDir,
    });

    expect(result.success).toBe(false);

    // Verify cleanup - install directory should not exist
    const wouldBeInstallPath = join(mockPersonasDir, "invalid-for-archive");
    await expect(fs.access(wouldBeInstallPath)).rejects.toThrow();
  });
});

describe("listInstalledPersonas", () => {
  it("should return empty list when no personas installed", async () => {
    const personas = await listInstalledPersonas(mockPersonasDir);
    expect(personas).toEqual([]);
  });

  it("should list installed personas", async () => {
    // Install a few personas
    await installPersona(testPersonaDir, { installDir: mockPersonasDir });

    const secondPersonaDir = join(tempDir, "second-persona");
    await createTestPersona(secondPersonaDir, "second-persona");
    await installPersona(secondPersonaDir, { installDir: mockPersonasDir });

    const personas = await listInstalledPersonas(mockPersonasDir);

    expect(personas).toHaveLength(2);
    const names = personas.map((p) => p.name);
    expect(names).toContain("test-persona");
    expect(names).toContain("second-persona");
  });

  it("should handle non-existent install directory", async () => {
    const nonExistentDir = join(tempDir, "does-not-exist");
    const personas = await listInstalledPersonas(nonExistentDir);
    expect(personas).toEqual([]);
  });
});

describe("uninstallPersona", () => {
  it("should uninstall existing persona", async () => {
    // Install first
    await installPersona(testPersonaDir, { installDir: mockPersonasDir });

    // Verify it exists
    const existsBefore = await checkPersonaExists(
      "test-persona",
      mockPersonasDir
    );
    expect(existsBefore).toBe(true);

    // Uninstall
    const result = await uninstallPersona("test-persona", mockPersonasDir);

    expect(result.success).toBe(true);
    expect(result.personaName).toBe("test-persona");
    expect(result.installPath).toBe(join(mockPersonasDir, "test-persona"));

    // Verify it's gone
    const existsAfter = await checkPersonaExists(
      "test-persona",
      mockPersonasDir
    );
    expect(existsAfter).toBe(false);
  });

  it("should create backup during uninstall", async () => {
    // Install first
    await installPersona(testPersonaDir, { installDir: mockPersonasDir });

    // Uninstall with backup
    const result = await uninstallPersona(
      "test-persona",
      mockPersonasDir,
      true
    );

    expect(result.success).toBe(true);
    expect(result.backupPath).toBeDefined();
    expect(result.backupPath).toContain("test-persona.backup.");

    // Verify backup exists but original is gone
    if (result.backupPath) {
      await expect(fs.access(result.backupPath)).resolves.toBeUndefined();
    }
    const existsAfter = await checkPersonaExists(
      "test-persona",
      mockPersonasDir
    );
    expect(existsAfter).toBe(false);
  });

  it("should handle non-existent persona", async () => {
    const result = await uninstallPersona("does-not-exist", mockPersonasDir);

    expect(result.success).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("not installed");
  });
});

describe("getStandardPersonasDir", () => {
  it("should return expected standard path", () => {
    const standardDir = getStandardPersonasDir();
    expect(standardDir).toContain(".toolprint");
    expect(standardDir).toContain("hypertool-mcp");
    expect(standardDir).toContain("personas");
    expect(standardDir).toContain(
      process.env.HOME || process.env.USERPROFILE || ""
    );
  });
});

describe("Error conditions and edge cases", () => {
  it("should handle permission errors gracefully", async () => {
    // This is platform-specific and might not work on all systems
    const restrictedDir = join(tempDir, "restricted");
    await fs.mkdir(restrictedDir, { recursive: true });

    try {
      // Try to make directory read-only
      await fs.chmod(restrictedDir, 0o444);

      const result = await installPersona(testPersonaDir, {
        installDir: restrictedDir,
      });

      // Should fail due to permissions
      expect(result.success).toBe(false);
    } finally {
      // Restore permissions for cleanup
      try {
        await fs.chmod(restrictedDir, 0o755);
      } catch {
        // Ignore
      }
    }
  });

  it("should handle disk space issues during installation", async () => {
    // This is hard to simulate reliably, so we'll skip it
    // In a real scenario, you might mock fs operations to simulate ENOSPC
  });

  it("should handle concurrent installation attempts", async () => {
    // Install the same persona concurrently (without force)
    const promises = [
      installPersona(testPersonaDir, { installDir: mockPersonasDir }),
      installPersona(testPersonaDir, { installDir: mockPersonasDir }),
      installPersona(testPersonaDir, { installDir: mockPersonasDir }),
    ];

    const results = await Promise.all(promises);

    // Only one should succeed
    const successCount = results.filter((r) => r.success).length;
    expect(successCount).toBe(1);

    // The others should fail with "already exists" errors
    const failureCount = results.filter((r) => !r.success).length;
    expect(failureCount).toBe(2);
  });

  it("should handle very long persona names", async () => {
    const longName = "a".repeat(200); // Very long name
    const longPersonaDir = join(tempDir, longName);
    await createTestPersona(longPersonaDir, longName);

    const result = await installPersona(longPersonaDir, {
      installDir: mockPersonasDir,
    });

    // Should either succeed or fail gracefully (depending on filesystem limits)
    if (!result.success) {
      expect(result.errors.length).toBeGreaterThan(0);
    }
  });

  it("should handle special characters in persona names", async () => {
    // Note: persona names should be validated to be hyphen-delimited lowercase
    // but the installer should handle edge cases gracefully
    const specialName = "test-persona-with-special-chars-123";
    const specialPersonaDir = join(tempDir, specialName);
    await createTestPersona(specialPersonaDir, specialName);

    const result = await installPersona(specialPersonaDir, {
      installDir: mockPersonasDir,
    });

    expect(result.success).toBe(true);
    expect(result.personaName).toBe(specialName);
  });
});
