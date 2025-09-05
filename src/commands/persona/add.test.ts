/**
 * Tests for Persona Add Command
 *
 * @fileoverview Tests for the CLI persona add command functionality
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { promises as fs } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { Command } from "commander";
import { createAddCommand } from "./add.js";
import { packPersona } from "../../persona/archive.js";
import * as installer from "../../persona/installer.js";
import * as theme from "../../utils/theme.js";

// Mock console methods to capture output
const mockConsoleLog = vi.fn();
const mockConsoleError = vi.fn();
const mockProcessExit = vi.fn();

// Mock dependencies
vi.mock("../../utils/theme.js", () => ({
  theme: {
    info: vi.fn((text) => `INFO: ${text}`),
    success: vi.fn((text) => `SUCCESS: ${text}`),
    warning: vi.fn((text) => `WARNING: ${text}`),
    error: vi.fn((text) => `ERROR: ${text}`),
    label: vi.fn((text) => `LABEL: ${text}`),
    muted: vi.fn((text) => `MUTED: ${text}`),
  },
  semantic: {
    messageError: vi.fn((text) => `MSG_ERROR: ${text}`),
  },
}));

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
  name: string = "test-persona"
): Promise<void> {
  await fs.mkdir(dir, { recursive: true });

  const config = {
    name,
    description: "A test persona for CLI tests",
    version: "1.0",
    toolsets: [
      {
        name: "development",
        toolIds: ["git.status", "npm.run"],
      },
    ],
    defaultToolset: "development",
  };

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
}

/**
 * Execute command with given arguments
 */
async function executeCommand(args: string[]): Promise<void> {
  const command = createAddCommand();
  const program = new Command();
  program.addCommand(command);

  // Parse arguments
  await program.parseAsync(["node", "test", "add", ...args], {
    from: "node",
  });
}

beforeEach(async () => {
  // Create temporary directory for tests
  tempDir = join(tmpdir(), `persona-add-cli-test-${Date.now()}`);
  await fs.mkdir(tempDir, { recursive: true });

  testPersonaDir = join(tempDir, "test-persona");
  testArchivePath = join(tempDir, "test-persona.htp");
  mockPersonasDir = join(tempDir, "personas");

  await createTestPersona(testPersonaDir);
  await fs.mkdir(mockPersonasDir, { recursive: true });

  // Setup mocks
  vi.clearAllMocks();

  // Mock console methods
  global.console.log = mockConsoleLog;
  global.console.error = mockConsoleError;

  // Mock process.exit
  vi.stubGlobal("process", {
    ...process,
    exit: mockProcessExit,
  });

  // Spy on installer functions
  vi.spyOn(installer, "analyzeSource");
  vi.spyOn(installer, "checkPersonaExists");
  vi.spyOn(installer, "installPersona");
  vi.spyOn(installer, "getStandardPersonasDir").mockReturnValue(
    mockPersonasDir
  );
});

afterEach(async () => {
  // Clean up temporary directory
  try {
    await fs.rm(tempDir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }

  // Restore console methods
  vi.restoreAllMocks();
});

describe.skip("Add Command - Basic Functionality", () => {
  it("should install persona from folder successfully", async () => {
    // Mock successful installation
    const mockInstallResult = {
      success: true,
      personaName: "test-persona",
      installPath: join(mockPersonasDir, "test-persona"),
      warnings: [],
      errors: [],
      wasOverwrite: false,
    };

    (installer.installPersona as any).mockResolvedValue(mockInstallResult);
    (installer.checkPersonaExists as any).mockResolvedValue(false);

    await executeCommand([testPersonaDir]);

    // Verify installer was called correctly
    expect(installer.analyzeSource).toHaveBeenCalledWith(testPersonaDir);
    expect(installer.installPersona).toHaveBeenCalledWith(
      testPersonaDir,
      expect.objectContaining({
        force: false,
        backup: false,
        skipValidation: false,
      })
    );

    // Verify success output
    expect(mockConsoleLog).toHaveBeenCalledWith(
      expect.stringContaining("Successfully installed")
    );
    expect(mockProcessExit).toHaveBeenCalledWith(0);
  });

  it("should install persona from archive successfully", async () => {
    // Create test archive
    await packPersona(testPersonaDir, testArchivePath);

    const mockInstallResult = {
      success: true,
      personaName: "test-persona",
      installPath: join(mockPersonasDir, "test-persona"),
      warnings: [],
      errors: [],
      wasOverwrite: false,
    };

    (installer.installPersona as any).mockResolvedValue(mockInstallResult);
    (installer.checkPersonaExists as any).mockResolvedValue(false);

    await executeCommand([testArchivePath]);

    // Verify installer was called correctly
    expect(installer.analyzeSource).toHaveBeenCalledWith(testArchivePath);
    expect(installer.installPersona).toHaveBeenCalledWith(
      testArchivePath,
      expect.objectContaining({
        force: false,
        backup: false,
        skipValidation: false,
      })
    );

    expect(mockProcessExit).toHaveBeenCalledWith(0);
  });

  it("should handle installation failure", async () => {
    const mockInstallResult = {
      success: false,
      personaName: "test-persona",
      warnings: [],
      errors: ["Installation failed for some reason"],
      wasOverwrite: false,
    };

    (installer.installPersona as any).mockResolvedValue(mockInstallResult);
    (installer.checkPersonaExists as any).mockResolvedValue(false);

    await executeCommand([testPersonaDir]);

    // Verify error output
    expect(mockConsoleError).toHaveBeenCalledWith(
      expect.stringContaining("Failed to install persona")
    );
    expect(mockProcessExit).toHaveBeenCalledWith(1);
  });
});

describe.skip("Add Command - Options", () => {
  it("should pass force option to installer", async () => {
    const mockInstallResult = {
      success: true,
      personaName: "test-persona",
      installPath: join(mockPersonasDir, "test-persona"),
      warnings: [],
      errors: [],
      wasOverwrite: true,
    };

    (installer.installPersona as any).mockResolvedValue(mockInstallResult);
    (installer.checkPersonaExists as any).mockResolvedValue(true);

    await executeCommand([testPersonaDir, "--force"]);

    expect(installer.installPersona).toHaveBeenCalledWith(
      testPersonaDir,
      expect.objectContaining({
        force: true,
        backup: false,
        skipValidation: false,
      })
    );
  });

  it("should pass backup option to installer", async () => {
    const mockInstallResult = {
      success: true,
      personaName: "test-persona",
      installPath: join(mockPersonasDir, "test-persona"),
      backupPath: join(mockPersonasDir, "test-persona.backup.123"),
      warnings: [],
      errors: [],
      wasOverwrite: true,
    };

    (installer.installPersona as any).mockResolvedValue(mockInstallResult);
    (installer.checkPersonaExists as any).mockResolvedValue(true);

    await executeCommand([testPersonaDir, "--force", "--backup"]);

    expect(installer.installPersona).toHaveBeenCalledWith(
      testPersonaDir,
      expect.objectContaining({
        force: true,
        backup: true,
        skipValidation: false,
      })
    );

    // Verify backup is mentioned in output
    expect(mockConsoleLog).toHaveBeenCalledWith(
      expect.stringContaining("Backup:")
    );
  });

  it("should pass skip-validation option to installer", async () => {
    const mockInstallResult = {
      success: true,
      personaName: "test-persona",
      installPath: join(mockPersonasDir, "test-persona"),
      warnings: ["Persona has validation warnings"],
      errors: [],
      wasOverwrite: false,
    };

    (installer.installPersona as any).mockResolvedValue(mockInstallResult);
    (installer.checkPersonaExists as any).mockResolvedValue(false);

    await executeCommand([testPersonaDir, "--skip-validation"]);

    expect(installer.installPersona).toHaveBeenCalledWith(
      testPersonaDir,
      expect.objectContaining({
        force: false,
        backup: false,
        skipValidation: true,
      })
    );
  });

  it("should pass custom install directory to installer", async () => {
    const customDir = join(tempDir, "custom-personas");
    await fs.mkdir(customDir, { recursive: true });

    const mockInstallResult = {
      success: true,
      personaName: "test-persona",
      installPath: join(customDir, "test-persona"),
      warnings: [],
      errors: [],
      wasOverwrite: false,
    };

    (installer.installPersona as any).mockResolvedValue(mockInstallResult);
    (installer.checkPersonaExists as any).mockResolvedValue(false);

    await executeCommand([testPersonaDir, "--install-dir", customDir]);

    expect(installer.installPersona).toHaveBeenCalledWith(
      testPersonaDir,
      expect.objectContaining({
        installDir: customDir,
      })
    );
  });

  it("should combine multiple options correctly", async () => {
    const customDir = join(tempDir, "custom-personas");
    await fs.mkdir(customDir, { recursive: true });

    const mockInstallResult = {
      success: true,
      personaName: "test-persona",
      installPath: join(customDir, "test-persona"),
      backupPath: join(customDir, "test-persona.backup.123"),
      warnings: [],
      errors: [],
      wasOverwrite: true,
    };

    (installer.installPersona as any).mockResolvedValue(mockInstallResult);
    (installer.checkPersonaExists as any).mockResolvedValue(true);

    await executeCommand([
      testPersonaDir,
      "--force",
      "--backup",
      "--skip-validation",
      "--install-dir",
      customDir,
    ]);

    expect(installer.installPersona).toHaveBeenCalledWith(
      testPersonaDir,
      expect.objectContaining({
        force: true,
        backup: true,
        skipValidation: true,
        installDir: customDir,
      })
    );
  });
});

describe("Add Command - Conflict Detection", () => {
  it("should warn about existing persona without force", async () => {
    (installer.checkPersonaExists as any).mockResolvedValue(true);

    await executeCommand([testPersonaDir]);

    // Should warn and exit before attempting installation
    expect(mockConsoleLog).toHaveBeenCalledWith(
      expect.stringContaining("already exists")
    );
    expect(mockConsoleLog).toHaveBeenCalledWith(
      expect.stringContaining("Use --force to overwrite")
    );
    expect(mockProcessExit).toHaveBeenCalledWith(1);
    expect(installer.installPersona).not.toHaveBeenCalled();
  });

  it("should proceed with existing persona when force is used", async () => {
    const mockInstallResult = {
      success: true,
      personaName: "test-persona",
      installPath: join(mockPersonasDir, "test-persona"),
      warnings: [],
      errors: [],
      wasOverwrite: true,
    };

    (installer.installPersona as any).mockResolvedValue(mockInstallResult);
    (installer.checkPersonaExists as any).mockResolvedValue(true);

    await executeCommand([testPersonaDir, "--force"]);

    // Should warn about overwrite but proceed
    expect(mockConsoleLog).toHaveBeenCalledWith(
      expect.stringContaining("Will overwrite existing")
    );
    expect(installer.installPersona).toHaveBeenCalled();
    expect(mockProcessExit).toHaveBeenCalledWith(0);
  });

  it("should show backup message when using backup option", async () => {
    const mockInstallResult = {
      success: true,
      personaName: "test-persona",
      installPath: join(mockPersonasDir, "test-persona"),
      warnings: [],
      errors: [],
      wasOverwrite: true,
    };

    (installer.installPersona as any).mockResolvedValue(mockInstallResult);
    (installer.checkPersonaExists as any).mockResolvedValue(true);

    await executeCommand([testPersonaDir, "--force", "--backup"]);

    expect(mockConsoleLog).toHaveBeenCalledWith(
      expect.stringContaining("Creating backup before overwrite")
    );
  });
});

describe.skip("Add Command - Error Handling", () => {
  it("should handle source analysis errors", async () => {
    const error = new Error("Cannot analyze source");
    (installer.analyzeSource as any).mockRejectedValue(error);

    await executeCommand(["/invalid/path"]);

    expect(mockConsoleError).toHaveBeenCalledWith(
      expect.stringContaining("Failed to install persona")
    );
    expect(mockProcessExit).toHaveBeenCalledWith(1);
  });

  it("should handle inaccessible source", async () => {
    const mockSourceInfo = {
      accessible: false,
      type: installer.SourceType.FOLDER,
      path: "/invalid/path",
    };

    (installer.analyzeSource as any).mockResolvedValue(mockSourceInfo);

    await executeCommand(["/invalid/path"]);

    expect(mockConsoleError).toHaveBeenCalledWith(
      expect.stringContaining("not accessible")
    );
    expect(mockProcessExit).toHaveBeenCalledWith(1);
  });

  it("should handle installation errors with helpful messages", async () => {
    const mockInstallResult = {
      success: false,
      personaName: "test-persona",
      warnings: [],
      errors: ["Disk full", "Permission denied"],
      wasOverwrite: false,
    };

    (installer.installPersona as any).mockResolvedValue(mockInstallResult);
    (installer.checkPersonaExists as any).mockResolvedValue(false);

    await executeCommand([testPersonaDir]);

    // Should show all errors
    expect(mockConsoleError).toHaveBeenCalledWith(
      expect.stringContaining("Disk full")
    );
    expect(mockConsoleError).toHaveBeenCalledWith(
      expect.stringContaining("Permission denied")
    );
    expect(mockProcessExit).toHaveBeenCalledWith(1);
  });

  it("should provide helpful suggestions in error output", async () => {
    const mockInstallResult = {
      success: false,
      personaName: "test-persona",
      warnings: [],
      errors: ["Installation failed"],
      wasOverwrite: false,
    };

    (installer.installPersona as any).mockResolvedValue(mockInstallResult);
    (installer.checkPersonaExists as any).mockResolvedValue(false);

    await executeCommand([testPersonaDir]);

    // Should show helpful suggestions
    expect(mockConsoleError).toHaveBeenCalledWith(
      expect.stringContaining("Use 'hypertool persona validate")
    );
    expect(mockConsoleError).toHaveBeenCalledWith(
      expect.stringContaining("Use --force to overwrite")
    );
  });
});

describe.skip("Add Command - Output Format", () => {
  it("should display comprehensive installation details", async () => {
    const mockInstallResult = {
      success: true,
      personaName: "test-persona",
      installPath: join(mockPersonasDir, "test-persona"),
      warnings: ["Minor validation warning"],
      errors: [],
      wasOverwrite: false,
    };

    const mockSourceInfo = {
      accessible: true,
      type: installer.SourceType.FOLDER,
      path: testPersonaDir,
      personaName: "test-persona",
    };

    (installer.analyzeSource as any).mockResolvedValue(mockSourceInfo);
    (installer.installPersona as any).mockResolvedValue(mockInstallResult);
    (installer.checkPersonaExists as any).mockResolvedValue(false);

    await executeCommand([testPersonaDir]);

    // Should show analysis details
    expect(mockConsoleLog).toHaveBeenCalledWith(
      expect.stringContaining("Source Analysis")
    );
    expect(mockConsoleLog).toHaveBeenCalledWith(
      expect.stringContaining("Folder")
    );

    // Should show installation details
    expect(mockConsoleLog).toHaveBeenCalledWith(
      expect.stringContaining("Installation Details")
    );
    expect(mockConsoleLog).toHaveBeenCalledWith(
      expect.stringContaining("test-persona")
    );

    // Should show warnings
    expect(mockConsoleLog).toHaveBeenCalledWith(
      expect.stringContaining("Warnings")
    );
    expect(mockConsoleLog).toHaveBeenCalledWith(
      expect.stringContaining("Minor validation warning")
    );

    // Should show helpful next steps
    expect(mockConsoleLog).toHaveBeenCalledWith(
      expect.stringContaining("hypertool persona list")
    );
    expect(mockConsoleLog).toHaveBeenCalledWith(
      expect.stringContaining("hypertool persona activate")
    );
  });

  it("should distinguish between archive and folder sources in output", async () => {
    // Create test archive
    await packPersona(testPersonaDir, testArchivePath);

    const mockInstallResult = {
      success: true,
      personaName: "test-persona",
      installPath: join(mockPersonasDir, "test-persona"),
      warnings: [],
      errors: [],
      wasOverwrite: false,
    };

    const mockSourceInfo = {
      accessible: true,
      type: installer.SourceType.ARCHIVE,
      path: testArchivePath,
      personaName: "test-persona",
    };

    (installer.analyzeSource as any).mockResolvedValue(mockSourceInfo);
    (installer.installPersona as any).mockResolvedValue(mockInstallResult);
    (installer.checkPersonaExists as any).mockResolvedValue(false);

    await executeCommand([testArchivePath]);

    // Should show Archive in analysis
    expect(mockConsoleLog).toHaveBeenCalledWith(
      expect.stringContaining("Archive")
    );

    // Should show archive source in installation details
    expect(mockConsoleLog).toHaveBeenCalledWith(
      expect.stringContaining("archive")
    );
  });

  it("should show overwrite action when replacing existing persona", async () => {
    const mockInstallResult = {
      success: true,
      personaName: "test-persona",
      installPath: join(mockPersonasDir, "test-persona"),
      backupPath: join(mockPersonasDir, "test-persona.backup.123"),
      warnings: [],
      errors: [],
      wasOverwrite: true,
    };

    const mockSourceInfo = {
      accessible: true,
      type: installer.SourceType.FOLDER,
      path: testPersonaDir,
      personaName: "test-persona",
    };

    (installer.analyzeSource as any).mockResolvedValue(mockSourceInfo);
    (installer.installPersona as any).mockResolvedValue(mockInstallResult);
    (installer.checkPersonaExists as any).mockResolvedValue(true);

    await executeCommand([testPersonaDir, "--force", "--backup"]);

    // Should show overwrite action
    expect(mockConsoleLog).toHaveBeenCalledWith(
      expect.stringContaining("Overwrite")
    );

    // Should show backup location
    expect(mockConsoleLog).toHaveBeenCalledWith(
      expect.stringContaining("Backup:")
    );
  });
});
