/**
 * Tests for Claude Code integration setup
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { promises as fs } from "fs";
import { ClaudeCodeSetup } from "./setup.js";
import { createCommandTemplates } from "./utils.js";
import inquirer from "inquirer";

// Mock file system operations
vi.mock("fs", async () => {
  const actual = await vi.importActual<typeof import("fs")>("fs");
  return {
    ...actual,
    promises: {
      ...actual.promises,
      mkdir: vi.fn(),
      writeFile: vi.fn(),
      access: vi.fn(),
      copyFile: vi.fn(),
      readFile: vi.fn(),
      rmdir: vi.fn(),
      rm: vi.fn(),
    },
  };
});

// Mock inquirer
vi.mock("inquirer", () => ({
  default: {
    prompt: vi.fn(),
  },
}));

// Mock shared utilities
vi.mock("../shared/mcpSetupUtils.js", () => ({
  fileExists: vi.fn(),
  validateMcpConfiguration: vi.fn(),
  createConfigBackup: vi.fn(),
  migrateToHyperToolConfig: vi.fn(),
  promptForCleanupOptions: vi.fn(),
  updateMcpConfigWithHyperTool: vi.fn(),
  displaySetupSummary: vi.fn(),
  displaySetupPlan: vi.fn(),
  readJsonFile: vi.fn(),
  hasClaudeCodeGlobalHypertoolSlashCommands: vi.fn(),
}));

// Mock process.cwd
const mockCwd = vi.fn(() => "/test/project");
vi.stubGlobal("process", {
  cwd: mockCwd,
  exit: vi.fn(),
});

// Mock ora spinner
vi.mock("ora", () => ({
  default: vi.fn(() => ({
    start: vi.fn().mockReturnThis(),
    succeed: vi.fn().mockReturnThis(),
    fail: vi.fn().mockReturnThis(),
    stop: vi.fn().mockReturnThis(),
    text: "",
  })),
}));

// Mock console methods
const consoleMock = {
  log: vi.fn(),
  error: vi.fn(),
};
vi.stubGlobal("console", consoleMock);

// Mock output utilities
vi.mock("../../logging/output.js", () => ({
  output: {
    displayHeader: vi.fn(),
    displaySpaceBuffer: vi.fn(),
    displaySubHeader: vi.fn(),
    displayInstruction: vi.fn(),
    displayTerminalInstruction: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
  },
}));

describe("Claude Code Integration Setup", () => {
  const mockFs = fs as any;

  beforeEach(async () => {
    vi.clearAllMocks();
    consoleMock.log.mockClear();
    consoleMock.error.mockClear();
    mockCwd.mockReturnValue("/test/project");

    // Setup default mocks for shared utilities
    const {
      fileExists,
      validateMcpConfiguration,
      createConfigBackup,
      migrateToHyperToolConfig,
      promptForCleanupOptions,
      updateMcpConfigWithHyperTool,
      displaySetupSummary,
      displaySetupPlan,
      readJsonFile,
      hasClaudeCodeGlobalHypertoolSlashCommands,
    } = await import("../shared/mcpSetupUtils.js");

    (fileExists as any).mockResolvedValue(true);
    (validateMcpConfiguration as any).mockResolvedValue(undefined);
    (createConfigBackup as any).mockResolvedValue(undefined);
    (migrateToHyperToolConfig as any).mockResolvedValue(undefined);
    (promptForCleanupOptions as any).mockResolvedValue(true);
    (updateMcpConfigWithHyperTool as any).mockResolvedValue(undefined);
    (displaySetupSummary as any).mockResolvedValue(undefined);
    (displaySetupPlan as any).mockResolvedValue(true);
    (hasClaudeCodeGlobalHypertoolSlashCommands as any).mockResolvedValue(false);
    (readJsonFile as any).mockResolvedValue({
      mcpServers: {
        "test-server": {
          type: "stdio",
          command: "test-command",
        },
      },
    });

    // Mock inquirer prompts
    (inquirer.prompt as any).mockImplementation((questions) => {
      if (Array.isArray(questions)) {
        const question = questions[0];
        if (question.name === "components") {
          return Promise.resolve({
            components: ["updateMcpConfig", "installSlashCommandsGlobal"],
          });
        }
        if (question.name === "shouldProceed") {
          return Promise.resolve({ shouldProceed: true });
        }
      }
      return Promise.resolve({});
    });

    // Mock fs.readFile to return valid JSON
    mockFs.readFile.mockResolvedValue(
      JSON.stringify({
        mcpServers: {
          "test-server": {
            type: "stdio",
            command: "test-command",
          },
        },
      })
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("ClaudeCodeSetup", () => {
    it("should create global .claude/commands/ht directory when installing globally", async () => {
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.writeFile.mockResolvedValue(undefined);
      mockFs.access.mockRejectedValue(new Error("File not found"));
      mockFs.rm.mockResolvedValue(undefined);

      const setup = new ClaudeCodeSetup();
      await setup.run(false);

      expect(mockFs.mkdir).toHaveBeenCalledWith(
        expect.stringContaining(".claude/commands/ht"),
        { recursive: true }
      );
    });

    it("should generate and write all command files", async () => {
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.writeFile.mockResolvedValue(undefined);
      mockFs.access.mockRejectedValue(new Error("File not found"));
      mockFs.rm.mockResolvedValue(undefined);

      const setup = new ClaudeCodeSetup();
      await setup.run(false);

      // Check that writeFile was called for each command file
      const writtenFiles = mockFs.writeFile.mock.calls.map((call) => call[0]);
      const commandFiles = writtenFiles.filter((file) =>
        file.includes("commands/ht/")
      );

      expect(commandFiles.length).toBeGreaterThanOrEqual(3); // At least 3 core commands
      expect(commandFiles.some((f) => f.includes("list-all-tools.md"))).toBe(
        true
      );
      expect(commandFiles.some((f) => f.includes("new-toolset.md"))).toBe(true);
      expect(commandFiles.some((f) => f.includes("list-toolsets.md"))).toBe(
        true
      );
    });

    it("should clean and recreate ht commands directory", async () => {
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.writeFile.mockResolvedValue(undefined);
      mockFs.access.mockResolvedValue(undefined); // File exists
      mockFs.copyFile.mockResolvedValue(undefined);
      mockFs.rm.mockResolvedValue(undefined);

      const setup = new ClaudeCodeSetup();
      await setup.run(false);

      // Should use fs.rm instead of fs.rmdir
      expect(mockFs.rm).toHaveBeenCalledWith(
        expect.stringContaining(".claude/commands/ht"),
        { recursive: true, force: true }
      );

      expect(mockFs.mkdir).toHaveBeenCalledWith(
        expect.stringContaining(".claude/commands/ht"),
        { recursive: true }
      );
    });

    it("should skip installation when user declines", async () => {
      // Mock user declining
      (inquirer.prompt as any).mockImplementation((questions) => {
        const question = Array.isArray(questions) ? questions[0] : questions;
        if (question.name === "shouldProceed") {
          return Promise.resolve({ shouldProceed: false });
        }
        if (question.name === "components") {
          return Promise.resolve({
            components: ["updateMcpConfig", "installSlashCommandsGlobal"],
          });
        }
        return Promise.resolve({});
      });

      const { output } = await import("../../logging/output.js");
      const setup = new ClaudeCodeSetup();
      await setup.run(false);

      expect(output.info).toHaveBeenCalledWith("Skipped.");
      expect(mockFs.mkdir).not.toHaveBeenCalled();
    });

    it("should handle file system errors gracefully", async () => {
      const mockExit = vi.fn(() => {
        throw new Error("process.exit called");
      });
      vi.stubGlobal("process", {
        cwd: mockCwd,
        exit: mockExit,
      });

      // Import the output mock
      const { output } = await import("../../logging/output.js");

      // Mock the shared utilities to throw an error
      const { createConfigBackup } = await import("../shared/mcpSetupUtils.js");
      (createConfigBackup as any).mockRejectedValue(
        new Error("Permission denied")
      );

      const setup = new ClaudeCodeSetup();
      await expect(setup.run(false)).rejects.toThrow("process.exit called");

      expect(output.error).toHaveBeenCalledWith("❌ Setup failed:");
      expect(output.error).toHaveBeenCalledWith("Permission denied");
      expect(mockExit).toHaveBeenCalledWith(1);
    });
  });

  describe("createCommandTemplates", () => {
    it("should generate all required command templates", async () => {
      const templates = await createCommandTemplates();

      expect(Object.keys(templates)).toHaveLength(5);
      expect(templates).toHaveProperty("list-all-tools.md");
      expect(templates).toHaveProperty("new-toolset.md");
      expect(templates).toHaveProperty("equip-toolset.md");
      expect(templates).toHaveProperty("list-toolsets.md");
      expect(templates).toHaveProperty("get-active-toolset.md");
    });

    it("should generate valid markdown content for each template", async () => {
      const templates = await createCommandTemplates();

      Object.entries(templates).forEach(([, content]) => {
        // Check for YAML frontmatter
        expect(content).toMatch(/^---\nallowed-tools:/);
        expect(content).toContain("description:");
        expect(content).toMatch(/---\n\n# .+/);
        expect(content).toContain("## Usage");
        expect(content).toContain("## Parameters");
        expect(content).toContain("## Examples");
        expect(content).toContain("## Common Use Cases");
        expect(content).toContain("## Tips");
        expect(content).toContain("## Related Commands");
      });
    });

    it("should include correct MCP tool references", async () => {
      const templates = await createCommandTemplates();

      expect(templates["list-all-tools.md"]).toContain(
        "Use the list-all-tools tool"
      );
      expect(templates["new-toolset.md"]).toContain("Use the new-toolset tool");
      expect(templates["list-toolsets.md"]).toContain(
        "Use the list-toolsets tool"
      );
      expect(templates["equip-toolset.md"]).toContain(
        "Use the equip-toolset tool"
      );
      expect(templates["get-active-toolset.md"]).toContain(
        "Use the get-active-toolset tool"
      );
    });

    it("should provide usage examples for each command", async () => {
      const templates = await createCommandTemplates();

      Object.values(templates).forEach((content) => {
        expect(content).toContain("Use the");
        expect(content).toContain("tool");
        expect(content).toContain("HyperTool");
      });
    });

    it("should include cross-references between related commands", async () => {
      const templates = await createCommandTemplates();

      // Check for cross-references using the slash command prefix
      expect(templates["list-all-tools.md"]).toContain("new-toolset");
      expect(templates["new-toolset.md"]).toContain("list-all-tools");
      expect(templates["equip-toolset.md"]).toContain("list-saved-toolsets"); // Fixed: was looking for wrong name
      expect(templates["list-toolsets.md"]).toContain("equip-toolset");
      expect(templates["get-active-toolset.md"]).toContain("equip-toolset");
    });
  });
});
