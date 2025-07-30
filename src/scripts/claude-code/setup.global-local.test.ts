/**
 * Tests for Claude Code global vs local installation functionality
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ClaudeCodeSetup } from "./setup.js";
import { promises as fs } from "fs";
import { join } from "path";
import { homedir } from "os";
import inquirer from "inquirer";
import * as mcpSetupUtils from "../shared/mcpSetupUtils.js";
import * as externalMcpDetector from "../shared/externalMcpDetector.js";
import { output } from "../../utils/output.js";

// Mock modules
vi.mock("fs", async () => {
  const actual = await vi.importActual<typeof import("fs")>("fs");
  return {
    ...actual,
    promises: {
      access: vi.fn(),
      readFile: vi.fn(),
      writeFile: vi.fn(),
      mkdir: vi.fn(),
      rm: vi.fn(),
    },
  };
});

vi.mock("inquirer");
vi.mock("../../utils/output.js");
vi.mock("../shared/mcpSetupUtils.js");
vi.mock("../shared/externalMcpDetector.js");

// Mock chalk
vi.mock("chalk", () => ({
  default: {
    yellow: vi.fn((text) => text),
    green: vi.fn((text) => text),
    red: vi.fn((text) => text),
    blue: vi.fn((text) => text),
    gray: vi.fn((text) => text),
    bold: vi.fn((text) => text),
  },
}));

// Mock theme
vi.mock("../../utils/theme.js", () => ({
  theme: {
    info: vi.fn((text) => text),
    success: vi.fn((text) => text),
    warning: vi.fn((text) => text),
    error: vi.fn((text) => text),
    label: vi.fn((text) => text),
    muted: vi.fn((text) => text),
    critical: vi.fn((text) => text),
    value: vi.fn((text) => text),
  },
  semantic: {
    messageError: vi.fn((text) => text),
    messageSuccess: vi.fn((text) => text),
    messageWarning: vi.fn((text) => text),
    messageInfo: vi.fn((text) => text),
  },
}));

// Mock process.cwd, process.exit, and console
const originalCwd = process.cwd;
const originalExit = process.exit;
const originalConsoleLog = console.log;
beforeEach(() => {
  process.cwd = vi.fn().mockReturnValue("/test/project");
  process.exit = vi.fn() as any;
  console.log = vi.fn();
});
afterEach(() => {
  process.cwd = originalCwd;
  process.exit = originalExit;
  console.log = originalConsoleLog;
});

describe("ClaudeCodeSetup - Global vs Local Installation", () => {
  let setup: ClaudeCodeSetup;
  const mockFs = fs as any;
  const mockInquirer = inquirer as any;
  const mockUtils = mcpSetupUtils as any;
  const mockDetector = externalMcpDetector as any;
  const mockOutput = output as any;

  beforeEach(() => {
    vi.clearAllMocks();
    setup = new ClaudeCodeSetup();

    // Setup default mocks
    mockOutput.info = vi.fn();
    mockOutput.warn = vi.fn();
    mockOutput.error = vi.fn();
    mockOutput.success = vi.fn();
    mockOutput.displaySpaceBuffer = vi.fn();
    mockOutput.displaySubHeader = vi.fn();
    mockOutput.displayInstruction = vi.fn();
    mockOutput.displayTerminalInstruction = vi.fn();

    mockUtils.fileExists = vi.fn().mockResolvedValue(false);
    mockUtils.readJsonFile = vi.fn();
    mockUtils.writeJsonFile = vi.fn();
    mockUtils.validateMcpConfiguration = vi.fn();
    mockUtils.createConfigBackup = vi.fn();
    mockUtils.migrateToHyperToolConfig = vi.fn();
    mockUtils.updateMcpConfigWithHyperTool = vi.fn();
    mockUtils.hasClaudeCodeGlobalHypertoolSlashCommands = vi
      .fn()
      .mockResolvedValue(false);

    mockDetector.detectExternalMCPs = vi.fn().mockResolvedValue([]);
  });

  describe("Installation Scope Selection", () => {
    it("should prompt for installation scope when in a valid project directory", async () => {
      // Mock valid project directory (has .git)
      mockUtils.fileExists.mockImplementation((path: string) => {
        return path === join("/test/project", ".git");
      });

      // Mock user selecting global installation
      mockInquirer.prompt = vi
        .fn()
        .mockResolvedValueOnce({ scope: "global" })
        .mockResolvedValueOnce({ createBasic: true })
        .mockResolvedValueOnce({ components: ["updateMcpConfig"] })
        .mockResolvedValueOnce({ shouldProceed: true });

      await setup.run(false);

      // Verify installation scope prompt was shown
      expect(mockInquirer.prompt).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            type: "list",
            name: "scope",
            message: "Where would you like to install hypertool-mcp?",
            choices: expect.arrayContaining([
              expect.objectContaining({ value: "global" }),
              expect.objectContaining({ value: "local" }),
            ]),
          }),
        ])
      );
    });

    it("should install globally without prompting when not in a project directory", async () => {
      // Mock no valid project directory
      mockUtils.fileExists.mockResolvedValue(false);

      // Mock other prompts
      mockInquirer.prompt = vi
        .fn()
        .mockResolvedValueOnce({ createBasic: true })
        .mockResolvedValueOnce({ components: ["updateMcpConfig"] })
        .mockResolvedValueOnce({ shouldProceed: true });

      await setup.run(false);

      // Verify no scope prompt was shown (first prompt should be createBasic)
      expect(mockInquirer.prompt).toHaveBeenCalledTimes(3);
      const firstPrompt = mockInquirer.prompt.mock.calls[0][0][0];
      expect(firstPrompt.name).toBe("createBasic");

      // Verify global installation message
      expect(mockOutput.info).toHaveBeenCalledWith(
        expect.stringContaining(
          "Not in a project directory, installing globally"
        )
      );
    });

    it("should use correct paths for global installation", async () => {
      // Mock valid project with global selection
      mockUtils.fileExists.mockImplementation((path: string) => {
        return path === join("/test/project", ".git");
      });

      mockInquirer.prompt = vi
        .fn()
        .mockResolvedValueOnce({ scope: "global" })
        .mockResolvedValueOnce({ createBasic: true })
        .mockResolvedValueOnce({ components: ["updateMcpConfig"] })
        .mockResolvedValueOnce({ shouldProceed: true });

      mockUtils.readJsonFile.mockResolvedValue({ mcpServers: {} });
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.writeFile.mockResolvedValue(undefined);

      await setup.run(false);

      // Verify global directory creation
      expect(mockFs.mkdir).toHaveBeenCalledWith(join(homedir(), ".claude"), {
        recursive: true,
      });

      // Verify global config file creation
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        join(homedir(), ".claude.json"),
        expect.any(String)
      );
    });

    it("should use correct paths for local installation", async () => {
      // Mock valid project with local selection
      mockUtils.fileExists.mockImplementation((path: string) => {
        return path === join("/test/project", ".git");
      });

      mockInquirer.prompt = vi
        .fn()
        .mockResolvedValueOnce({ scope: "local" })
        .mockResolvedValueOnce({ createBasic: true })
        .mockResolvedValueOnce({ components: ["updateMcpConfig"] })
        .mockResolvedValueOnce({ shouldProceed: true });

      mockUtils.readJsonFile.mockResolvedValue({ mcpServers: {} });
      mockFs.writeFile.mockResolvedValue(undefined);

      await setup.run(false);

      // Verify local config file creation
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        join("/test/project", ".mcp.json"),
        expect.any(String)
      );

      // Verify no global directory creation
      expect(mockFs.mkdir).not.toHaveBeenCalledWith(
        join(homedir(), ".claude"),
        expect.anything()
      );
    });
  });

  describe("External MCP Import", () => {
    it("should detect and offer to import external MCPs", async () => {
      // Setup mocks
      mockUtils.fileExists.mockResolvedValue(true);
      mockUtils.readJsonFile.mockResolvedValue({ mcpServers: {} });

      // Mock external MCPs detected
      mockDetector.detectExternalMCPs.mockResolvedValue([
        {
          name: "git-mcp",
          source: "Claude Code (global)",
          config: { type: "stdio", command: "git-mcp" },
        },
        {
          name: "docker-mcp",
          source: "Claude Desktop",
          config: { type: "stdio", command: "docker-mcp" },
        },
      ]);

      mockInquirer.prompt = vi
        .fn()
        .mockResolvedValueOnce({ scope: "global" })
        .mockResolvedValueOnce({ components: ["updateMcpConfig"] })
        .mockResolvedValueOnce({ shouldProceed: true })
        .mockResolvedValueOnce({ shouldImport: true });

      await setup.run(false);

      // Verify import prompt was shown
      expect(mockInquirer.prompt).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            type: "confirm",
            name: "shouldImport",
            message: "Would you like to import these into hypertool?",
          }),
        ])
      );

      // Verify MCPs were imported
      expect(mockUtils.writeJsonFile).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          mcpServers: expect.objectContaining({
            "git-mcp": { type: "stdio", command: "git-mcp" },
            "docker-mcp": { type: "stdio", command: "docker-mcp" },
          }),
        })
      );
    });

    it("should not show import prompt if no external MCPs found", async () => {
      mockUtils.fileExists.mockResolvedValue(true);
      mockUtils.readJsonFile.mockResolvedValue({ mcpServers: {} });
      mockDetector.detectExternalMCPs.mockResolvedValue([]);

      mockInquirer.prompt = vi
        .fn()
        .mockResolvedValueOnce({ scope: "global" })
        .mockResolvedValueOnce({ components: ["updateMcpConfig"] })
        .mockResolvedValueOnce({ shouldProceed: true });

      await setup.run(false);

      // Verify no import prompt
      const importPromptCalls = mockInquirer.prompt.mock.calls.filter(
        (call) => call[0].name === "shouldImport"
      );
      expect(importPromptCalls).toHaveLength(0);
    });

    it("should skip already imported MCPs", async () => {
      mockUtils.fileExists.mockResolvedValue(true);

      // Mock existing hypertool config with git-mcp already
      mockUtils.readJsonFile.mockImplementation((path: string) => {
        if (path.includes("mcp.hypertool.json")) {
          return {
            mcpServers: { "git-mcp": { type: "stdio", command: "git-mcp" } },
          };
        }
        return { mcpServers: {} };
      });

      // Mock external MCPs including one already imported
      mockDetector.detectExternalMCPs.mockResolvedValue([
        {
          name: "git-mcp",
          source: "Claude Code (global)",
          config: { type: "stdio", command: "git-mcp" },
        },
        {
          name: "docker-mcp",
          source: "Claude Desktop",
          config: { type: "stdio", command: "docker-mcp" },
        },
      ]);

      mockInquirer.prompt = vi
        .fn()
        .mockResolvedValueOnce({ scope: "global" })
        .mockResolvedValueOnce({ components: ["updateMcpConfig"] })
        .mockResolvedValueOnce({ shouldProceed: true })
        .mockResolvedValueOnce({ shouldImport: true });

      await setup.run(false);

      // Verify only docker-mcp was imported (not git-mcp)
      expect(mockUtils.writeJsonFile).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          mcpServers: expect.objectContaining({
            "git-mcp": { type: "stdio", command: "git-mcp" }, // Already there
            "docker-mcp": { type: "stdio", command: "docker-mcp" }, // Newly imported
          }),
        })
      );
    });
  });

  describe("Dry Run Mode", () => {
    it("should not create files in dry run mode", async () => {
      mockUtils.fileExists.mockResolvedValue(false);

      // Mock user interactions for dry run
      mockInquirer.prompt = vi
        .fn()
        .mockResolvedValueOnce({ createBasic: true })
        .mockResolvedValueOnce({ components: ["updateMcpConfig"] })
        .mockResolvedValueOnce({ shouldProceed: true });

      await setup.run(true);

      // Verify no actual file operations
      expect(mockFs.mkdir).not.toHaveBeenCalled();
      expect(mockFs.writeFile).not.toHaveBeenCalled();
      expect(mockUtils.writeJsonFile).not.toHaveBeenCalled();

      // Verify dry run messages
      expect(mockOutput.info).toHaveBeenCalledWith(
        expect.stringContaining("[DRY RUN MODE]")
      );
    });

    it("should simulate prompts in dry run mode", async () => {
      // Setup mocks - config exists to skip basic config creation
      mockUtils.fileExists.mockImplementation((path: string) => {
        if (path === join("/test/project", ".git")) return true;
        if (path === join(homedir(), ".claude.json")) return true;
        return false;
      });

      mockUtils.readJsonFile.mockResolvedValue({
        mcpServers: { "existing-mcp": {} },
      });
      mockUtils.hasClaudeCodeGlobalHypertoolSlashCommands.mockResolvedValue(
        false
      );

      // Mock the confirmation prompt
      mockInquirer.prompt = vi
        .fn()
        .mockResolvedValueOnce({ shouldProceed: true });

      await setup.run(true);

      // Verify confirmation prompt was shown (even in dry run)
      expect(mockInquirer.prompt).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            name: "shouldProceed",
            type: "confirm",
          }),
        ])
      );

      // Verify dry run prompt messages
      expect(mockOutput.info).toHaveBeenCalledWith(
        expect.stringContaining("[DRY RUN] Would prompt for installation scope")
      );
    });
  });
});
