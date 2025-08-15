/**
 * Unit tests for ConfigToolsManager
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { ConfigToolsManager } from "./manager.js";
import { ToolDependencies } from "../types.js";

// Mock the registry to avoid loading all the actual tools
vi.mock("./registry.js", () => ({
  CONFIG_TOOL_FACTORIES: [
    vi.fn(() => ({
      toolName: "list-available-tools",
      definition: {
        name: "list-available-tools",
        description: "List available tools",
        inputSchema: { type: "object", properties: {} },
      },
      handler: vi.fn().mockResolvedValue({ content: [{ type: "text", text: "success" }] }),
    })),
    vi.fn(() => ({
      toolName: "build-toolset",
      definition: {
        name: "build-toolset",
        description: "Build a toolset",
        inputSchema: { type: "object", properties: {} },
      },
      handler: vi.fn().mockResolvedValue({ content: [{ type: "text", text: "success" }] }),
    })),
    vi.fn((deps, callback) => ({
      toolName: "exit-configuration-mode",
      definition: {
        name: "exit-configuration-mode",
        description: "Exit configuration mode",
        inputSchema: { type: "object", properties: {} },
      },
      handler: vi.fn().mockImplementation(async () => {
        if (callback) callback();
        return { content: [{ type: "text", text: "exiting" }] };
      }),
    })),
  ],
  CONFIG_TOOL_NAMES: [
    "list-available-tools",
    "build-toolset",
    "exit-configuration-mode",
  ],
}));

describe("ConfigToolsManager", () => {
  let manager: ConfigToolsManager;
  let mockDeps: ToolDependencies;
  let mockModeChangeCallback: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    
    mockDeps = {
      toolsetManager: {} as any,
      discoveryEngine: {} as any,
    };

    mockModeChangeCallback = vi.fn();
    manager = new ConfigToolsManager(mockDeps, mockModeChangeCallback);
  });

  describe("initialization", () => {
    it("should register all configuration tools from registry", () => {
      const tools = manager.getToolModules();
      expect(tools.size).toBe(3); // Based on our mocked registry
      expect(tools.has("list-available-tools")).toBe(true);
      expect(tools.has("build-toolset")).toBe(true);
      expect(tools.has("exit-configuration-mode")).toBe(true);
    });
  });

  describe("getMcpTools", () => {
    it("should return all configuration tools", () => {
      const tools = manager.getMcpTools();
      expect(tools).toHaveLength(3);
      
      const toolNames = tools.map(t => t.name);
      expect(toolNames).toContain("list-available-tools");
      expect(toolNames).toContain("build-toolset");
      expect(toolNames).toContain("exit-configuration-mode");
    });
  });

  describe("handleToolCall", () => {
    it("should handle valid tool calls", async () => {
      const result = await manager.handleToolCall("list-available-tools", {});
      expect(result).toEqual({ content: [{ type: "text", text: "success" }] });
    });

    it("should throw error for unknown tools", async () => {
      await expect(manager.handleToolCall("unknown-tool", {}))
        .rejects.toThrow("Configuration tool not found: unknown-tool");
    });

    it("should call mode change callback for exit-configuration-mode", async () => {
      await manager.handleToolCall("exit-configuration-mode", {});
      expect(mockModeChangeCallback).toHaveBeenCalledOnce();
    });
  });

  describe("ToolsProvider interface", () => {
    it("should implement ToolsProvider interface", () => {
      expect(manager.getMcpTools).toBeDefined();
      expect(typeof manager.getMcpTools).toBe("function");
    });
  });
});