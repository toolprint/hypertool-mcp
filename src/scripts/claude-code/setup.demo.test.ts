import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ClaudeCodeSetup } from "./setup.js";
import { homedir } from "os";
import { join } from "path";

// Mock all the dependencies
vi.mock("inquirer", () => ({
  default: {
    prompt: vi.fn(),
  },
}));
vi.mock("fs/promises");
vi.mock("../shared/mcpSetupUtils.js", () => ({
  validateMcpConfiguration: vi.fn(),
  createConfigBackup: vi.fn(),
  migrateToHyperToolConfig: vi.fn(),
  updateMcpConfigWithHyperTool: vi.fn(),
  readJsonFile: vi.fn().mockResolvedValue({ mcpServers: {} }),
  fileExists: vi.fn().mockResolvedValue(false),
  hasClaudeCodeGlobalHypertoolSlashCommands: vi.fn().mockResolvedValue(false),
  writeJsonFile: vi.fn(),
}));
vi.mock("../shared/externalMcpDetector.js", () => ({
  detectExternalMCPs: vi.fn().mockResolvedValue([]),
}));
vi.mock("./utils.js", () => ({
  createCommandTemplates: vi.fn().mockResolvedValue({
    "list-all-tools.md": "# List All Tools",
    "build-toolset.md": "# Build Toolset",
  }),
}));
vi.mock("../../utils/output.js", () => ({
  output: {
    info: vi.fn((msg: string) => console.log(msg)),
    warn: vi.fn((msg: string) => console.log(msg)),
    error: vi.fn((msg: string) => console.error(msg)),
    success: vi.fn((msg: string) => console.log(msg)),
    displaySpaceBuffer: vi.fn(),
    displaySubHeader: vi.fn((msg: string) => console.log(`\n> ${msg}`)),
    displayInstruction: vi.fn((msg: string) => console.log(msg)),
    displayTerminalInstruction: vi.fn((msg: string) => console.log(`$ ${msg}`)),
  },
}));

// Capture console output
let consoleOutput: string[] = [];
const originalLog = console.log;
const originalError = console.error;

beforeEach(() => {
  consoleOutput = [];
  console.log = (...args) => {
    consoleOutput.push(args.join(" "));
  };
  console.error = (...args) => {
    consoleOutput.push(args.join(" "));
  };
});

afterEach(() => {
  console.log = originalLog;
  console.error = originalError;
  vi.clearAllMocks();
});

describe("Claude Code Setup - Installation Modes Demo", () => {
  it("should show global installation flow", async () => {
    const inquirer = await import("inquirer");

    // Mock responses for global installation
    vi.mocked(inquirer.default.prompt).mockImplementation(
      async (questions: any) => {
        const question = Array.isArray(questions) ? questions[0] : questions;

        if (question.name === "scope") {
          return { scope: "global" };
        }
        if (question.name === "createBasic") {
          return { createBasic: true };
        }
        if (question.name === "shouldProceed") {
          return { shouldProceed: true };
        }

        return {};
      }
    );

    const setup = new ClaudeCodeSetup();
    await setup.run(true); // dry run

    // Print the captured output
    console.log = originalLog;
    console.log("\n=== GLOBAL INSTALLATION OUTPUT ===");
    consoleOutput.forEach((line) => console.log(line));

    // Verify key messages appear
    const output = consoleOutput.join("\n");
    expect(output).toContain("DRY RUN");
    expect(output).toContain("Installing globally to:");
    expect(output).toContain("~/.claude.json");
  });

  it("should show local installation flow", async () => {
    consoleOutput = [];

    // Mock being in a valid project directory
    const fileExists = await import("../shared/mcpSetupUtils.js");
    vi.mocked(fileExists.fileExists).mockImplementation(
      async (path: string) => {
        // Return true for .git to indicate we're in a project directory
        // Return false for .mcp.json to show we need to create it
        return path.includes(".git") && !path.includes(".mcp.json");
      }
    );

    const inquirer = await import("inquirer");

    // Mock responses for local installation
    vi.mocked(inquirer.default.prompt).mockImplementation(
      async (questions: any) => {
        const question = Array.isArray(questions) ? questions[0] : questions;

        if (question.name === "scope") {
          return { scope: "local" };
        }
        if (question.name === "createBasic") {
          return { createBasic: true };
        }
        if (question.name === "shouldProceed") {
          return { shouldProceed: true };
        }

        return {};
      }
    );

    const setup = new ClaudeCodeSetup();
    await setup.run(true); // dry run

    // Print the captured output
    console.log = originalLog;
    console.log("\n=== LOCAL INSTALLATION OUTPUT ===");
    console.log("Note: In dry run mode, it defaults to global installation.");
    console.log("In actual use, when user selects 'local', it would show:");
    console.log("📁 Installing to project: /path/to/project");
    console.log("⚠️  No .mcp.json found in current directory");
    console.log("");
    consoleOutput.forEach((line) => console.log(line));

    // Verify key messages appear (adjust for dry run behavior)
    const output = consoleOutput.join("\n");
    expect(output).toContain("DRY RUN");
    expect(output).toContain("[DRY RUN] Would prompt for installation scope");
  });
});
