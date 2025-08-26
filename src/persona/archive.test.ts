/**
 * Tests for Persona Archive Handler
 *
 * @fileoverview Comprehensive tests for archive pack/unpack functionality
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "fs";
import { join, dirname } from "path";
import { tmpdir } from "os";
import {
  packPersona,
  unpackPersona,
  listArchiveContents,
  isHtpArchive,
  type ArchiveOptions,
} from "./archive.js";
import { PersonaErrorCode } from "./types.js";
import { isPersonaError } from "./errors.js";

// Test utilities
let tempDir: string;
let testPersonaDir: string;
let testArchivePath: string;

/**
 * Create a test persona directory structure
 */
async function createTestPersona(
  dir: string,
  config: any = {
    name: "test-persona",
    description: "A test persona for archive tests",
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

  // Create assets directory with sample files
  const assetsDir = join(dir, "assets");
  await fs.mkdir(assetsDir, { recursive: true });
  await fs.writeFile(
    join(assetsDir, "README.md"),
    "# Test Persona\n\nThis is a test persona for archive functionality.",
    "utf8"
  );
  await fs.writeFile(
    join(assetsDir, "config.json"),
    JSON.stringify({ test: true }, null, 2),
    "utf8"
  );

  // Create optional mcp.json
  const mcpConfig = {
    mcpServers: {
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
 * Create invalid persona directory (missing required files)
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
  tempDir = join(tmpdir(), `persona-archive-test-${Date.now()}`);
  await fs.mkdir(tempDir, { recursive: true });

  testPersonaDir = join(tempDir, "test-persona");
  testArchivePath = join(tempDir, "test-persona.htp");

  // Use a simpler persona configuration that should validate
  const simpleConfig = `name: test-persona
description: A test persona for archive tests
version: "1.0"
toolsets:
  - name: development
    toolIds:
      - git.status
      - npm.run
defaultToolset: development`;

  await fs.mkdir(testPersonaDir, { recursive: true });
  await fs.writeFile(
    join(testPersonaDir, "persona.yaml"),
    simpleConfig,
    "utf8"
  );

  // Create assets directory with both files
  const assetsDir = join(testPersonaDir, "assets");
  await fs.mkdir(assetsDir, { recursive: true });
  await fs.writeFile(
    join(assetsDir, "README.md"),
    "# Test Persona\n\nThis is a test persona for archive functionality.",
    "utf8"
  );
  await fs.writeFile(
    join(assetsDir, "config.json"),
    JSON.stringify({ test: true }, null, 2),
    "utf8"
  );

  // Create mcp.json
  const mcpConfig = {
    mcpServers: {
      "test-server": {
        command: "node",
        args: ["./test-server.js"],
      },
    },
  };
  await fs.writeFile(
    join(testPersonaDir, "mcp.json"),
    JSON.stringify(mcpConfig, null, 2),
    "utf8"
  );
});

afterEach(async () => {
  // Clean up temporary directory
  try {
    await fs.rm(tempDir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
});

describe("Archive Extension Validation", () => {
  it("should identify .htp files as archives", () => {
    expect(isHtpArchive("persona.htp")).toBe(true);
    expect(isHtpArchive("/path/to/persona.htp")).toBe(true);
    expect(isHtpArchive("./relative/path.htp")).toBe(true);
  });

  it("should reject non-.htp files", () => {
    expect(isHtpArchive("persona.zip")).toBe(false);
    expect(isHtpArchive("persona.tar.gz")).toBe(false);
    expect(isHtpArchive("persona.yaml")).toBe(false);
    expect(isHtpArchive("persona")).toBe(false);
  });

  it("should be case insensitive", () => {
    expect(isHtpArchive("persona.HTP")).toBe(true);
    expect(isHtpArchive("persona.Htp")).toBe(true);
  });
});

describe("Pack Persona", () => {
  it("should create archive from valid persona directory", async () => {
    const result = await packPersona(testPersonaDir, testArchivePath);

    expect(result.success).toBe(true);
    expect(result.path).toBe(testArchivePath);
    expect(result.metadata).toBeDefined();
    expect(result.metadata?.personaName).toBe("test-persona");
    expect(result.metadata?.version).toBe("1.0");
    expect(result.errors).toEqual([]);

    // Verify archive file was created
    const stats = await fs.stat(testArchivePath);
    expect(stats.isFile()).toBe(true);
    expect(stats.size).toBeGreaterThan(0);
  });

  it("should include all persona files in archive", async () => {
    await packPersona(testPersonaDir, testArchivePath);
    const contents = await listArchiveContents(testArchivePath);

    expect(contents).toContain("persona.yaml");
    expect(contents).toContain("mcp.json");
    expect(contents).toContain("assets/README.md");
    expect(contents).toContain("assets/config.json");
  });

  it("should reject invalid extension", async () => {
    const invalidPath = join(tempDir, "test-persona.zip");
    const result = await packPersona(testPersonaDir, invalidPath);

    expect(result.success).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors?.[0]).toContain(".htp extension");
  });

  it("should reject non-directory source", async () => {
    const filePath = join(tempDir, "not-a-directory.txt");
    await fs.writeFile(filePath, "test content", "utf8");

    const result = await packPersona(filePath, testArchivePath);

    expect(result.success).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors?.[0]).toContain("must be a directory");
  });

  it("should reject invalid persona structure", async () => {
    const invalidDir = join(tempDir, "invalid-persona");
    await createInvalidPersona(invalidDir);

    const result = await packPersona(invalidDir, testArchivePath);

    expect(result.success).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors?.[0]).toContain("Invalid persona structure");
  });

  it("should not overwrite existing archive without force", async () => {
    // Create archive first
    await packPersona(testPersonaDir, testArchivePath);
    await expect(fs.access(testArchivePath)).resolves.toBeUndefined();

    // Try to create again without force
    const result = await packPersona(testPersonaDir, testArchivePath);

    expect(result.success).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors?.[0]).toContain("already exists");
  });

  it("should overwrite existing archive with force", async () => {
    // Create archive first
    await packPersona(testPersonaDir, testArchivePath);
    const firstStats = await fs.stat(testArchivePath);

    // Wait a bit to ensure different timestamps
    await new Promise((resolve) => setTimeout(resolve, 10));

    // Create again with force
    const result = await packPersona(testPersonaDir, testArchivePath, {
      force: true,
    });

    expect(result.success).toBe(true);

    const secondStats = await fs.stat(testArchivePath);
    expect(secondStats.mtime.getTime()).toBeGreaterThan(
      firstStats.mtime.getTime()
    );
  });

  it("should create output directory if it doesn't exist", async () => {
    const nestedPath = join(tempDir, "nested", "deep", "test-persona.htp");

    const result = await packPersona(testPersonaDir, nestedPath);

    expect(result.success).toBe(true);
    const stats = await fs.stat(nestedPath);
    expect(stats.isFile()).toBe(true);
  });

  it("should handle compression options", async () => {
    const options: ArchiveOptions = {
      compressionLevel: 9,
      preservePermissions: true,
    };

    const result = await packPersona(testPersonaDir, testArchivePath, options);

    expect(result.success).toBe(true);
    const stats = await fs.stat(testArchivePath);
    expect(stats.size).toBeGreaterThan(0);
  });
});

describe("Unpack Persona", () => {
  beforeEach(async () => {
    // Create test archive for unpacking tests
    await packPersona(testPersonaDir, testArchivePath);
  });

  it("should extract archive to directory", async () => {
    const extractPath = join(tempDir, "extracted-persona");
    const result = await unpackPersona(testArchivePath, extractPath);

    expect(result.success).toBe(true);
    expect(result.path).toBe(extractPath);
    expect(result.metadata).toBeDefined();
    expect(result.metadata?.personaName).toBe("test-persona");

    // Verify extracted files
    await expect(
      fs.access(join(extractPath, "persona.yaml"))
    ).resolves.toBeUndefined();
    await expect(
      fs.access(join(extractPath, "mcp.json"))
    ).resolves.toBeUndefined();
    await expect(
      fs.access(join(extractPath, "assets", "README.md"))
    ).resolves.toBeUndefined();
    await expect(
      fs.access(join(extractPath, "assets", "config.json"))
    ).resolves.toBeUndefined();

    // Metadata file should be cleaned up
    await expect(
      fs.access(join(extractPath, ".htp-metadata"))
    ).rejects.toThrow();
  });

  it("should reject invalid extension", async () => {
    const invalidArchive = join(tempDir, "test.zip");
    const extractPath = join(tempDir, "extracted");

    const result = await unpackPersona(invalidArchive, extractPath);

    expect(result.success).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors?.[0]).toContain(".htp extension");
  });

  it("should reject non-existent archive", async () => {
    const nonExistentArchive = join(tempDir, "does-not-exist.htp");
    const extractPath = join(tempDir, "extracted");

    const result = await unpackPersona(nonExistentArchive, extractPath);

    expect(result.success).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors?.[0]).toContain("File system error");
  });

  it("should not overwrite existing directory without force", async () => {
    const extractPath = join(tempDir, "existing-dir");
    await fs.mkdir(extractPath, { recursive: true });
    await fs.writeFile(join(extractPath, "existing.txt"), "content", "utf8");

    const result = await unpackPersona(testArchivePath, extractPath);

    expect(result.success).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors?.[0]).toContain("already exists");
  });

  it("should overwrite existing directory with force", async () => {
    const extractPath = join(tempDir, "existing-dir");
    await fs.mkdir(extractPath, { recursive: true });
    await fs.writeFile(join(extractPath, "existing.txt"), "content", "utf8");

    const result = await unpackPersona(testArchivePath, extractPath, {
      force: true,
    });

    expect(result.success).toBe(true);

    // Original file should be gone, persona files should exist
    await expect(
      fs.access(join(extractPath, "existing.txt"))
    ).rejects.toThrow();
    await expect(
      fs.access(join(extractPath, "persona.yaml"))
    ).resolves.toBeUndefined();
  });

  it("should validate extracted persona structure", async () => {
    // Create invalid archive manually (this is tricky, so we'll simulate)
    const extractPath = join(tempDir, "extracted-invalid");

    // First extract normally
    await unpackPersona(testArchivePath, extractPath, { force: true });

    // Then corrupt the extracted content
    await fs.unlink(join(extractPath, "persona.yaml"));

    // Try to validate by creating a new archive from corrupted content
    const corruptedArchive = join(tempDir, "corrupted.htp");

    // This should fail during packing due to validation
    const packResult = await packPersona(extractPath, corruptedArchive);
    expect(packResult.success).toBe(false);
  });

  it("should handle archives without metadata (backwards compatibility)", async () => {
    // Create archive without our custom metadata by using tar directly
    const tar = await import("tar");
    const simpleArchive = join(tempDir, "simple.htp");

    await tar.create(
      {
        gzip: true,
        file: simpleArchive,
        cwd: testPersonaDir,
      },
      ["."]
    );

    const extractPath = join(tempDir, "extracted-simple");
    const result = await unpackPersona(simpleArchive, extractPath);

    expect(result.success).toBe(true);
    expect(result.metadata).toBeUndefined(); // No metadata in simple archive
    await expect(
      fs.access(join(extractPath, "persona.yaml"))
    ).resolves.toBeUndefined();
  });
});

describe("List Archive Contents", () => {
  beforeEach(async () => {
    await packPersona(testPersonaDir, testArchivePath);
  });

  it("should list all files in archive", async () => {
    const contents = await listArchiveContents(testArchivePath);

    expect(contents).toContain("persona.yaml");
    expect(contents).toContain("mcp.json");
    expect(contents).toContain("assets/README.md");
    expect(contents).toContain("assets/config.json");

    // Metadata file should be hidden from listing
    expect(contents).not.toContain(".htp-metadata");
  });

  it("should reject invalid extension", async () => {
    const invalidPath = join(tempDir, "invalid.zip");

    await expect(listArchiveContents(invalidPath)).rejects.toThrow();

    try {
      await listArchiveContents(invalidPath);
    } catch (error) {
      expect(isPersonaError(error)).toBe(true);
      if (isPersonaError(error)) {
        expect(error.code).toBe(PersonaErrorCode.FILE_SYSTEM_ERROR);
      }
    }
  });

  it("should reject non-existent archive", async () => {
    const nonExistentPath = join(tempDir, "does-not-exist.htp");

    await expect(listArchiveContents(nonExistentPath)).rejects.toThrow();

    try {
      await listArchiveContents(nonExistentPath);
    } catch (error) {
      expect(isPersonaError(error)).toBe(true);
      if (isPersonaError(error)) {
        expect(error.code).toBe(PersonaErrorCode.ARCHIVE_EXTRACTION_FAILED);
      }
    }
  });
});

describe("Archive Round-trip", () => {
  it("should preserve all files through pack/unpack cycle", async () => {
    // Pack the test persona
    const packResult = await packPersona(testPersonaDir, testArchivePath);
    expect(packResult.success).toBe(true);

    // Unpack to new location
    const extractPath = join(tempDir, "round-trip-extracted");
    const unpackResult = await unpackPersona(testArchivePath, extractPath);
    expect(unpackResult.success).toBe(true);

    // Compare original and extracted files
    const compareFiles = [
      "persona.yaml",
      "mcp.json",
      "assets/README.md",
      "assets/config.json",
    ];

    for (const file of compareFiles) {
      const originalContent = await fs.readFile(
        join(testPersonaDir, file),
        "utf8"
      );
      const extractedContent = await fs.readFile(
        join(extractPath, file),
        "utf8"
      );
      expect(extractedContent).toBe(originalContent);
    }
  });

  it("should preserve directory structure", async () => {
    const packResult = await packPersona(testPersonaDir, testArchivePath);
    expect(packResult.success).toBe(true);

    const extractPath = join(tempDir, "structure-test");
    const unpackResult = await unpackPersona(testArchivePath, extractPath);
    expect(unpackResult.success).toBe(true);

    // Check directory structure
    const assetsDir = join(extractPath, "assets");
    const assetsStats = await fs.stat(assetsDir);
    expect(assetsStats.isDirectory()).toBe(true);
  });

  it("should maintain metadata consistency", async () => {
    const packResult = await packPersona(testPersonaDir, testArchivePath);
    expect(packResult.success).toBe(true);
    expect(packResult.metadata).toBeDefined();

    const extractPath = join(tempDir, "metadata-test");
    const unpackResult = await unpackPersona(testArchivePath, extractPath);
    expect(unpackResult.success).toBe(true);
    expect(unpackResult.metadata).toBeDefined();

    // Metadata should match
    expect(unpackResult.metadata?.personaName).toBe(
      packResult.metadata?.personaName
    );
    expect(unpackResult.metadata?.version).toBe(packResult.metadata?.version);
    expect(unpackResult.metadata?.description).toBe(
      packResult.metadata?.description
    );
  });
});

describe("Error Handling", () => {
  it("should clean up partial files on pack failure", async () => {
    // Try to pack to a read-only location (simulate failure)
    const readOnlyDir = join(tempDir, "readonly");
    await fs.mkdir(readOnlyDir, { recursive: true });

    // This might not work on all systems, but let's try
    try {
      await fs.chmod(readOnlyDir, 0o444);
      const readOnlyArchive = join(readOnlyDir, "test.htp");

      const result = await packPersona(testPersonaDir, readOnlyArchive);
      expect(result.success).toBe(false);

      // Archive should not exist
      await expect(fs.access(readOnlyArchive)).rejects.toThrow();
    } finally {
      // Restore permissions for cleanup
      try {
        await fs.chmod(readOnlyDir, 0o755);
      } catch {
        // Ignore
      }
    }
  });

  it("should clean up partial extraction on unpack failure", async () => {
    // Create a valid archive first
    await packPersona(testPersonaDir, testArchivePath);

    // Create a corrupted archive by truncating it
    const corruptedArchive = join(tempDir, "corrupted.htp");
    const originalContent = await fs.readFile(testArchivePath);
    const truncatedContent = originalContent.subarray(0, 100); // Keep only first 100 bytes
    await fs.writeFile(corruptedArchive, truncatedContent);

    const extractPath = join(tempDir, "should-not-exist");
    const result = await unpackPersona(corruptedArchive, extractPath);

    expect(result.success).toBe(false);

    // Extract directory should not exist
    await expect(fs.access(extractPath)).rejects.toThrow();
  });
});
