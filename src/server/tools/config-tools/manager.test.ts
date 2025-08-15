/**
 * Unit tests for ConfigToolsManager
 */

import { describe, it, expect, beforeEach, vi, MockedFunction } from "vitest";
import { ConfigToolsManager } from "./manager.js";
import { ToolDependencies } from "../server/tools/types.js";
import { ToolsetManager } from "../toolset/manager.js";
import { IToolDiscoveryEngine } from "../discovery/types.js";
import { Tool } from "@modelcontextprotocol/sdk/types.js";

// Mock the tool module imports
vi.mock("../server/tools/list-available-tools.js", () => ({
  createListAvailableToolsModule: vi.fn(() => ({
    toolName: "list-available-tools",
    definition: {
      name: "list-available-tools",
      description: "List available tools",
      inputSchema: { type: "object", properties: {} },
    },
    handler: vi.fn(),
  })),
}));

vi.mock("../server/tools/build-toolset.js", () => ({
  createBuildToolsetModule: vi.fn(() => ({
    toolName: "build-toolset",
    definition: {
      name: "build-toolset",
      description: "Build a toolset",
      inputSchema: { type: "object", properties: {} },
    },
    handler: vi.fn(),
  })),
}));

vi.mock("../server/tools/list-saved-toolsets.js", () => ({
  createListSavedToolsetsModule: vi.fn(() => ({
    toolName: "list-saved-toolsets",
    definition: {
      name: "list-saved-toolsets",
      description: "List saved toolsets",
      inputSchema: { type: "object", properties: {} },
    },
    handler: vi.fn(),
  })),
}));

vi.mock("../server/tools/equip-toolset.js", () => ({
  createEquipToolsetModule: vi.fn(() => ({
    toolName: "equip-toolset",
    definition: {
      name: "equip-toolset",
      description: "Equip a toolset",
      inputSchema: { type: "object", properties: {} },
    },
    handler: vi.fn(),
  })),
}));

vi.mock("../server/tools/delete-toolset.js", () => ({
  createDeleteToolsetModule: vi.fn(() => ({
    toolName: "delete-toolset",
    definition: {
      name: "delete-toolset",
      description: "Delete a toolset",
      inputSchema: { type: "object", properties: {} },
    },
    handler: vi.fn(),
  })),
}));

vi.mock("../server/tools/unequip-toolset.js", () => ({
  createUnequipToolsetModule: vi.fn(() => ({
    toolName: "unequip-toolset",
    definition: {
      name: "unequip-toolset",
      description: "Unequip current toolset",
      inputSchema: { type: "object", properties: {} },
    },
    handler: vi.fn(),
  })),
}));

vi.mock("../server/tools/get-active-toolset.js", () => ({
  createGetActiveToolsetModule: vi.fn(() => ({
    toolName: "get-active-toolset",
    definition: {
      name: "get-active-toolset",
      description: "Get active toolset",
      inputSchema: { type: "object", properties: {} },
    },
    handler: vi.fn(),
  })),
}));

vi.mock("../server/tools/add-tool-annotation.js", () => ({
  createAddToolAnnotationModule: vi.fn(() => ({
    toolName: "add-tool-annotation",
    definition: {
      name: "add-tool-annotation",
      description: "Add tool annotation",
      inputSchema: { type: "object", properties: {} },
    },
    handler: vi.fn(),
  })),
}));

vi.mock("../utils/logging.js", () => ({
  createChildLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

describe("ConfigToolsManager", () => {
  let manager: ConfigToolsManager;
  let mockDependencies: ToolDependencies;
  let mockToolsetManager: Partial<ToolsetManager>;
  let mockDiscoveryEngine: Partial<IToolDiscoveryEngine>;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    // Create mock dependencies
    mockToolsetManager = {
      getCurrentToolset: vi.fn(),
      hasActiveToolset: vi.fn(),
      buildToolset: vi.fn(),
      listSavedToolsets: vi.fn(),
      equipToolset: vi.fn(),
      deleteToolset: vi.fn(),
      unequipToolset: vi.fn(),
    };

    mockDiscoveryEngine = {
      getDiscoveredTools: vi.fn(),
      resolveToolReference: vi.fn(),
    };

    mockDependencies = {
      toolsetManager: mockToolsetManager as ToolsetManager,
      discoveryEngine: mockDiscoveryEngine as IToolDiscoveryEngine,
    };

    // Create manager instance
    manager = new ConfigToolsManager(mockDependencies);
  });

  describe("initialization", () => {
    it("should register all configuration tools on initialization", () => {
      const modules = manager.getToolModules();
      expect(modules.size).toBe(8); // 8 configuration tools

      // Check that all expected tools are registered
      expect(modules.has("list-available-tools")).toBe(true);
      expect(modules.has("build-toolset")).toBe(true);
      expect(modules.has("list-saved-toolsets")).toBe(true);
      expect(modules.has("equip-toolset")).toBe(true);
      expect(modules.has("delete-toolset")).toBe(true);
      expect(modules.has("unequip-toolset")).toBe(true);
      expect(modules.has("get-active-toolset")).toBe(true);
      expect(modules.has("add-tool-annotation")).toBe(true);
    });

    it("should set all tools as available in configuration mode by default", () => {
      const modules = manager.getToolModules();
      for (const [, module] of modules) {
        expect(module.availableInMode).toBe("configuration");
      }
    });

    it("should accept config dependencies", () => {
      const setModeFn = vi.fn();
      const isModeFn = vi.fn(() => true);
      
      const managerWithCallbacks = new ConfigToolsManager(mockDependencies, {
        setConfigurationMode: setModeFn,
        isConfigurationMode: isModeFn,
      });

      expect(managerWithCallbacks).toBeDefined();
    });
  });

  describe("ToolsProvider interface", () => {
    it("should implement getMcpTools method", () => {
      expect(manager.getMcpTools).toBeDefined();
      expect(typeof manager.getMcpTools).toBe("function");
    });

    it("should return Tool array from getMcpTools", () => {
      const tools = manager.getMcpTools();
      expect(Array.isArray(tools)).toBe(true);
      
      // In configuration mode (default), should return all config tools
      manager.setConfigurationMode(true);
      const configTools = manager.getMcpTools();
      expect(configTools.length).toBe(8);

      // Each item should be a valid Tool
      for (const tool of configTools) {
        expect(tool).toHaveProperty("name");
        expect(tool).toHaveProperty("description");
        expect(tool).toHaveProperty("inputSchema");
      }
    });
  });

  describe("mode management", () => {
    it("should start in non-configuration mode by default", () => {
      expect(manager.isConfigurationMode()).toBe(false);
    });

    it("should allow setting configuration mode", () => {
      manager.setConfigurationMode(true);
      expect(manager.isConfigurationMode()).toBe(true);

      manager.setConfigurationMode(false);
      expect(manager.isConfigurationMode()).toBe(false);
    });

    it("should filter tools based on mode", () => {
      // In configuration mode, should return configuration tools
      manager.setConfigurationMode(true);
      const configTools = manager.getMcpTools();
      expect(configTools.length).toBe(8);

      // In normal mode, configuration tools should not be returned
      manager.setConfigurationMode(false);
      const normalTools = manager.getMcpTools();
      expect(normalTools.length).toBe(0); // No tools marked for normal mode yet
    });
  });

  describe("mode switching tools", () => {
    it("should register mode switching tools correctly", () => {
      const enterConfigMode = {
        toolName: "enter-configuration-mode",
        definition: {
          name: "enter-configuration-mode",
          description: "Enter configuration mode",
          inputSchema: { type: "object" as const, properties: {} },
        },
        handler: vi.fn(),
      };

      const exitConfigMode = {
        toolName: "exit-configuration-mode",
        definition: {
          name: "exit-configuration-mode",
          description: "Exit configuration mode",
          inputSchema: { type: "object" as const, properties: {} },
        },
        handler: vi.fn(),
      };

      manager.registerModeSwitchingTools(enterConfigMode, exitConfigMode);

      const modules = manager.getToolModules();
      expect(modules.size).toBe(10); // 8 config tools + 2 mode switching

      // Check availability modes
      const enterModule = modules.get("enter-configuration-mode");
      expect(enterModule?.availableInMode).toBe("normal");

      const exitModule = modules.get("exit-configuration-mode");
      expect(exitModule?.availableInMode).toBe("configuration");
    });

    it("should show correct tools in each mode after registering mode switching", () => {
      const enterConfigMode = {
        toolName: "enter-configuration-mode",
        definition: {
          name: "enter-configuration-mode",
          description: "Enter configuration mode",
          inputSchema: { type: "object" as const, properties: {} },
        },
        handler: vi.fn(),
      };

      const exitConfigMode = {
        toolName: "exit-configuration-mode",
        definition: {
          name: "exit-configuration-mode",
          description: "Exit configuration mode",
          inputSchema: { type: "object" as const, properties: {} },
        },
        handler: vi.fn(),
      };

      manager.registerModeSwitchingTools(enterConfigMode, exitConfigMode);

      // In normal mode, should only show enter-configuration-mode
      manager.setConfigurationMode(false);
      const normalTools = manager.getMcpTools();
      expect(normalTools.length).toBe(1);
      expect(normalTools[0].name).toBe("enter-configuration-mode");

      // In configuration mode, should show all config tools + exit-configuration-mode
      manager.setConfigurationMode(true);
      const configTools = manager.getMcpTools();
      expect(configTools.length).toBe(9); // 8 config tools + exit
      
      const toolNames = configTools.map(t => t.name);
      expect(toolNames).toContain("exit-configuration-mode");
      expect(toolNames).not.toContain("enter-configuration-mode");
    });
  });

  describe("handleToolCall", () => {
    it("should route tool calls to appropriate handlers", async () => {
      const mockHandler = vi.fn().mockResolvedValue({ success: true });
      const modules = manager.getToolModules();
      const buildToolsetModule = modules.get("build-toolset");
      if (buildToolsetModule) {
        buildToolsetModule.handler = mockHandler;
      }

      manager.setConfigurationMode(true);
      const result = await manager.handleToolCall("build-toolset", { name: "test" });
      
      expect(mockHandler).toHaveBeenCalledWith({ name: "test" });
      expect(result).toEqual({ success: true });
    });

    it("should throw error for unknown tools", async () => {
      await expect(
        manager.handleToolCall("unknown-tool", {})
      ).rejects.toThrow("Tool not found: unknown-tool");
    });

    it("should throw error for tools not available in current mode", async () => {
      manager.setConfigurationMode(false); // Normal mode
      
      await expect(
        manager.handleToolCall("build-toolset", {})
      ).rejects.toThrow("Tool not available in current mode: build-toolset");
    });

    it("should handle tool execution errors", async () => {
      const mockHandler = vi.fn().mockRejectedValue(new Error("Tool error"));
      const modules = manager.getToolModules();
      const buildToolsetModule = modules.get("build-toolset");
      if (buildToolsetModule) {
        buildToolsetModule.handler = mockHandler;
      }

      manager.setConfigurationMode(true);
      
      await expect(
        manager.handleToolCall("build-toolset", {})
      ).rejects.toThrow("Tool error");
    });
  });

  describe("tool filtering", () => {
    it("should correctly filter tools with 'both' availability", () => {
      // Add a tool that's available in both modes
      const bothModeTool = {
        toolName: "test-both",
        definition: {
          name: "test-both",
          description: "Available in both modes",
          inputSchema: { type: "object" as const, properties: {} },
        },
        handler: vi.fn(),
        availableInMode: "both" as const,
      };

      const modules = manager.getToolModules();
      modules.set("test-both", bothModeTool);

      // Should be available in configuration mode
      manager.setConfigurationMode(true);
      let tools = manager.getMcpTools();
      let toolNames = tools.map(t => t.name);
      expect(toolNames).toContain("test-both");

      // Should also be available in normal mode
      manager.setConfigurationMode(false);
      tools = manager.getMcpTools();
      toolNames = tools.map(t => t.name);
      expect(toolNames).toContain("test-both");
    });
  });
});