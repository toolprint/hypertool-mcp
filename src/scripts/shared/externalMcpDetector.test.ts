/**
 * Tests for external MCP detection functionality
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { join } from "path";
import { homedir } from "os";
import {
  detectExternalMCPs,
  formatExternalMCPsMessage,
} from "./externalMcpDetector.js";
import * as mcpSetupUtils from "./mcpSetupUtils.js";

// Mock the file system and mcpSetupUtils
vi.mock("fs", () => ({
  promises: {
    access: vi.fn(),
    readFile: vi.fn(),
  },
}));

vi.mock("./mcpSetupUtils.js", () => ({
  fileExists: vi.fn(),
  readJsonFile: vi.fn(),
}));

describe("externalMcpDetector", () => {
  const mockUtils = mcpSetupUtils as any;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe("detectExternalMCPs", () => {
    it("should detect MCPs from Claude Code global config", async () => {
      // Setup mocks
      mockUtils.fileExists.mockImplementation((path: string) => {
        return path === join(homedir(), ".claude.json");
      });

      mockUtils.readJsonFile.mockImplementation((path: string) => {
        if (path === join(homedir(), ".claude.json")) {
          return Promise.resolve({
            mcpServers: {
              "git-mcp": { type: "stdio", command: "git-mcp" },
              "docker-mcp": { type: "stdio", command: "docker-mcp" },
            },
          });
        }
        throw new Error("File not found");
      });

      const result = await detectExternalMCPs();

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        name: "git-mcp",
        source: "Claude Code (global)",
        config: { type: "stdio", command: "git-mcp" },
      });
      expect(result[1]).toEqual({
        name: "docker-mcp",
        source: "Claude Code (global)",
        config: { type: "stdio", command: "docker-mcp" },
      });
    });

    it("should skip hypertool MCP servers", async () => {
      mockUtils.fileExists.mockImplementation((path: string) => {
        return path === join(homedir(), ".claude.json");
      });

      mockUtils.readJsonFile.mockImplementation((path: string) => {
        if (path === join(homedir(), ".claude.json")) {
          return Promise.resolve({
            mcpServers: {
              "hypertool-mcp": { type: "stdio", command: "hypertool" },
              "git-mcp": { type: "stdio", command: "git-mcp" },
            },
          });
        }
        throw new Error("File not found");
      });

      const result = await detectExternalMCPs();

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("git-mcp");
      expect(result.find((m) => m.name.includes("hypertool"))).toBeUndefined();
    });

    it("should detect MCPs from multiple sources", async () => {
      mockUtils.fileExists.mockImplementation((path: string) => {
        return (
          path === join(homedir(), ".claude.json") ||
          path ===
            join(
              homedir(),
              "Library/Application Support/Claude/claude_desktop_config.json"
            )
        );
      });

      mockUtils.readJsonFile.mockImplementation((path: string) => {
        if (path === join(homedir(), ".claude.json")) {
          return Promise.resolve({
            mcpServers: {
              "git-mcp": { type: "stdio", command: "git-mcp" },
            },
          });
        }
        if (
          path ===
          join(
            homedir(),
            "Library/Application Support/Claude/claude_desktop_config.json"
          )
        ) {
          return Promise.resolve({
            mcpServers: {
              "docker-mcp": { type: "stdio", command: "docker-mcp" },
            },
          });
        }
        throw new Error("File not found");
      });

      const result = await detectExternalMCPs();

      expect(result).toHaveLength(2);
      expect(
        result.find((m) => m.source === "Claude Code (global)")
      ).toBeDefined();
      expect(result.find((m) => m.source === "Claude Desktop")).toBeDefined();
    });

    it("should handle missing config files gracefully", async () => {
      mockUtils.fileExists.mockResolvedValue(false);

      const result = await detectExternalMCPs();

      expect(result).toHaveLength(0);
    });

    it("should handle read errors gracefully", async () => {
      mockUtils.fileExists.mockResolvedValue(true);
      mockUtils.readJsonFile.mockRejectedValue(new Error("Permission denied"));

      const result = await detectExternalMCPs();

      expect(result).toHaveLength(0);
    });
  });

  describe("formatExternalMCPsMessage", () => {
    it("should return empty string for no MCPs", () => {
      const result = formatExternalMCPsMessage([]);
      expect(result).toBe("");
    });

    it("should format single source correctly", () => {
      const mcps = [
        {
          name: "git-mcp",
          source: "Claude Code (global)",
          config: { type: "stdio", command: "git-mcp" },
        },
        {
          name: "docker-mcp",
          source: "Claude Code (global)",
          config: { type: "stdio", command: "docker-mcp" },
        },
      ];

      const result = formatExternalMCPsMessage(mcps);

      expect(result).toContain("⚠️  Other MCP servers detected");
      expect(result).toContain("Claude Code (global):");
      expect(result).toContain("- git-mcp");
      expect(result).toContain("- docker-mcp");
      expect(result).toContain("Run 'hypertool --install'");
    });

    it("should format multiple sources correctly", () => {
      const mcps = [
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
      ];

      const result = formatExternalMCPsMessage(mcps);

      expect(result).toContain("Claude Code (global):");
      expect(result).toContain("Claude Desktop:");
      expect(result).toContain("- git-mcp");
      expect(result).toContain("- docker-mcp");
    });
  });
});
