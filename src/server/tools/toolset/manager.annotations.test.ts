/**
 * Tests for ToolsetManager annotation functionality
 */

import { describe, it, expect, beforeEach } from "vitest";
import { EventEmitter } from "events";
import { ToolsetManager } from "./manager.js";
import { ToolsetConfig, ToolsetToolNote } from "./types.js";
import { DiscoveredTool, IToolDiscoveryEngine } from "../discovery/types.js";
import { Tool } from "@modelcontextprotocol/sdk/types.js";

// Mock discovery engine
class MockDiscoveryEngine extends EventEmitter implements IToolDiscoveryEngine {
  private tools: DiscoveredTool[] = [];

  setTools(tools: DiscoveredTool[]) {
    this.tools = tools;
  }

  async initialize() {}
  async start() {}
  async stop() {}

  async discoverTools(): Promise<DiscoveredTool[]> {
    return this.tools;
  }

  async getToolByName(name: string): Promise<DiscoveredTool | null> {
    return (
      this.tools.find((t) => t.name === name || t.namespacedName === name) ||
      null
    );
  }

  async searchTools(): Promise<DiscoveredTool[]> {
    return this.tools;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  getAvailableTools(_includeDisabled?: boolean): DiscoveredTool[] {
    return this.tools;
  }

  resolveToolReference(
    ref: { namespacedName?: string; refId?: string },
    options?: { allowStaleRefs?: boolean }
  ) {
    const tool = this.tools.find(
      (t) => t.namespacedName === ref.namespacedName || t.toolHash === ref.refId
    );

    const exists = !!tool;
    const namespacedNameMatch =
      !!tool && tool.namespacedName === ref.namespacedName;
    const refIdMatch = !!tool && tool.toolHash === ref.refId;

    const warnings: string[] = [];
    const errors: string[] = [];

    // Check for mismatches when both identifiers are provided
    if (exists && ref.namespacedName && ref.refId) {
      if (!namespacedNameMatch && !refIdMatch) {
        errors.push(
          `Tool reference mismatch: neither namespacedName nor refId match`
        );
      } else if (!namespacedNameMatch || !refIdMatch) {
        const msg = `Tool reference partial mismatch: ${!namespacedNameMatch ? "namespacedName" : "refId"} doesn't match`;
        if (options?.allowStaleRefs) {
          warnings.push(msg);
        } else {
          errors.push(msg);
        }
      }
    }

    // In secure mode, reject tools with errors
    const shouldReject = !options?.allowStaleRefs && errors.length > 0;

    return {
      exists: exists && !shouldReject,
      tool: shouldReject ? undefined : tool,
      serverName: tool?.serverName,
      serverStatus: undefined,
      namespacedNameMatch,
      refIdMatch,
      warnings,
      errors,
    };
  }

  async refreshCache() {}
  async clearCache() {}

  getStats() {
    return {
      totalServers: 1,
      connectedServers: 1,
      totalTools: this.tools.length,
      cacheHitRate: 0.8,
      averageDiscoveryTime: 100,
    };
  }
}

describe("ToolsetManager - Annotations", () => {
  let manager: ToolsetManager;
  let mockEngine: MockDiscoveryEngine;

  const createMockTools = (): DiscoveredTool[] => [
    {
      name: "status",
      namespacedName: "git.status",
      description: "Show the working tree status",
      serverName: "git",
      serverStatus: "connected",
      toolHash: "abc123",
      lastCached: new Date(),
      tool: {
        name: "status",
        description: "Show the working tree status",
        inputSchema: { type: "object", properties: {} },
      },
    },
    {
      name: "create_issue",
      namespacedName: "linear.create_issue",
      description: "Creates a new issue in Linear",
      serverName: "linear",
      serverStatus: "connected",
      toolHash: "def456",
      lastCached: new Date(),
      tool: {
        name: "create_issue",
        description: "Creates a new issue in Linear",
        inputSchema: { type: "object", properties: {} },
      },
    },
  ];

  beforeEach(() => {
    manager = new ToolsetManager();
    mockEngine = new MockDiscoveryEngine();
    mockEngine.setTools(createMockTools());
    manager.setDiscoveryEngine(mockEngine);
  });

  describe("_hydrateToolNotes", () => {
    it("should return tool unchanged when no toolset is loaded", () => {
      const tool: Tool = {
        name: "git_status",
        description: "Show the working tree status",
        inputSchema: { type: "object", properties: {} },
      };

      const result = manager._hydrateToolNotes(tool);
      expect(result).toEqual(tool);
      expect(result.description).toBe("Show the working tree status");
    });

    it("should return tool unchanged when toolset has no notes", () => {
      const toolset: ToolsetConfig = {
        name: "test-toolset",
        tools: [{ namespacedName: "git.status" }],
      };
      manager.setCurrentToolset(toolset);

      const tool: Tool = {
        name: "git_status",
        description: "Show the working tree status",
        inputSchema: { type: "object", properties: {} },
      };

      const result = manager._hydrateToolNotes(tool);
      expect(result).toEqual(tool);
      expect(result.description).toBe("Show the working tree status");
    });

    it("should add notes to tool description when notes exist", () => {
      const toolset: ToolsetConfig = {
        name: "test-toolset",
        tools: [{ namespacedName: "git.status" }],
        toolNotes: [
          {
            toolRef: { namespacedName: "git.status" },
            notes: [
              {
                name: "usage-tip",
                note: "Always run this before committing",
              },
              {
                name: "warning",
                note: "Be careful with untracked files",
              },
            ],
          },
        ],
      };
      manager.setCurrentToolset(toolset);

      const tool: Tool = {
        name: "git_status",
        description: "Show the working tree status",
        inputSchema: { type: "object", properties: {} },
      };

      const result = manager._hydrateToolNotes(tool);
      expect(result.description).toContain("Show the working tree status");
      expect(result.description).toContain("### Additional Tool Notes");
      expect(result.description).toContain(
        "• **usage-tip**: Always run this before committing"
      );
      expect(result.description).toContain(
        "• **warning**: Be careful with untracked files"
      );
    });

    it("should match notes by refId when both namespacedName and refId provided in notes", () => {
      const toolset: ToolsetConfig = {
        name: "test-toolset",
        tools: [{ namespacedName: "git.status" }],
        toolNotes: [
          {
            // Notes reference has both namespacedName and refId
            toolRef: { namespacedName: "git.status", refId: "abc123" },
            notes: [
              {
                name: "tip",
                note: "Use with caution",
              },
            ],
          },
        ],
      };
      manager.setCurrentToolset(toolset);

      const tools = manager.getMcpTools();
      expect(tools.length).toBe(1);

      const gitTool = tools[0];
      expect(gitTool.name).toBe("git_status");
      expect(gitTool.description).toContain("### Additional Tool Notes");
      expect(gitTool.description).toContain("• **tip**: Use with caution");
    });

    it("should handle tools without description", () => {
      const toolset: ToolsetConfig = {
        name: "test-toolset",
        tools: [{ namespacedName: "git.status" }],
        toolNotes: [
          {
            toolRef: { namespacedName: "git.status" },
            notes: [
              {
                name: "usage",
                note: "Essential git command",
              },
            ],
          },
        ],
      };
      manager.setCurrentToolset(toolset);

      const tool: Tool = {
        name: "git_status",
        inputSchema: { type: "object", properties: {} },
      };

      const result = manager._hydrateToolNotes(tool);
      expect(result.description).toBe(
        "### Additional Tool Notes\n\n• **usage**: Essential git command"
      );
    });
  });

  describe("formatNotesForLLM", () => {
    it("should format notes with markdown", () => {
      const notes: ToolsetToolNote[] = [
        { name: "tip-1", note: "First tip" },
        { name: "tip-2", note: "Second tip" },
        { name: "warning", note: "Important warning" },
      ];

      // Access private method through type assertion
      const formatNotesForLLM = (manager as any).formatNotesForLLM.bind(
        manager
      );
      const result = formatNotesForLLM(notes);

      expect(result).toBe(
        "### Additional Tool Notes\n\n" +
          "• **tip-1**: First tip\n" +
          "• **tip-2**: Second tip\n" +
          "• **warning**: Important warning"
      );
    });
  });

  describe("getMcpTools with annotations", () => {
    it("should include annotations in exposed tools", () => {
      // Ensure we have a fresh manager and engine
      manager = new ToolsetManager();
      mockEngine = new MockDiscoveryEngine();
      mockEngine.setTools(createMockTools());
      manager.setDiscoveryEngine(mockEngine);

      const toolset: ToolsetConfig = {
        name: "test-toolset",
        tools: [
          { namespacedName: "git.status" },
          { namespacedName: "linear.create_issue" },
        ],
        toolNotes: [
          {
            toolRef: { namespacedName: "linear.create_issue" },
            notes: [
              {
                name: "team-selection",
                note: "Always confirm team with user first",
              },
            ],
          },
        ],
      };
      manager.setCurrentToolset(toolset);

      const tools = manager.getMcpTools();

      // Find the linear tool
      const linearTool = tools.find((t) => t.name === "linear_create_issue");
      expect(linearTool).toBeDefined();
      expect(linearTool!.description).toContain(
        "Creates a new issue in Linear"
      );
      expect(linearTool!.description).toContain("### Additional Tool Notes");
      expect(linearTool!.description).toContain(
        "• **team-selection**: Always confirm team with user first"
      );

      // Git tool should not have annotations
      const gitTool = tools.find((t) => t.name === "git_status");
      expect(gitTool).toBeDefined();
      expect(gitTool!.description).toBe("Show the working tree status");
      expect(gitTool!.description).not.toContain("### Additional Tool Notes");
    });
  });

  describe("findDiscoveredToolByFlattenedName", () => {
    it("should find tool by flattened name", () => {
      const toolset: ToolsetConfig = {
        name: "test-toolset",
        tools: [
          { namespacedName: "git.status" },
          { namespacedName: "linear.create_issue" },
        ],
      };
      manager.setCurrentToolset(toolset);

      // Access private method through type assertion
      const findDiscoveredToolByFlattenedName = (
        manager as any
      ).findDiscoveredToolByFlattenedName.bind(manager);

      const gitTool = findDiscoveredToolByFlattenedName("git_status");
      expect(gitTool).toBeDefined();
      expect(gitTool.namespacedName).toBe("git.status");

      const linearTool = findDiscoveredToolByFlattenedName(
        "linear_create_issue"
      );
      expect(linearTool).toBeDefined();
      expect(linearTool.namespacedName).toBe("linear.create_issue");

      const notFound = findDiscoveredToolByFlattenedName("nonexistent_tool");
      expect(notFound).toBeNull();
    });
  });
});
