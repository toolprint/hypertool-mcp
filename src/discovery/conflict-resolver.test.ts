/**
 * Unit tests for tool conflict resolution
 */

import { ToolConflictResolver, ConflictResolutionConfig } from "./conflict-resolver";
import { DiscoveredTool } from "./types";

describe("ToolConflictResolver", () => {
  let resolver: ToolConflictResolver;

  const createMockTool = (
    name: string,
    serverName: string,
    description?: string,
    schema?: any
  ): DiscoveredTool => ({
    name,
    serverName,
    namespacedName: `${serverName}.${name}`,
    schema: schema || {
      type: "object",
      properties: { input: { type: "string" } },
    },
    description,
    discoveredAt: new Date(),
    lastUpdated: new Date(),
    serverStatus: "connected",
    structureHash: `hash-${name}-${serverName}`,
    fullHash: `full-hash-${name}-${serverName}`,
  });

  beforeEach(() => {
    resolver = new ToolConflictResolver();
  });

  describe("conflict detection", () => {
    it("should detect no conflicts with unique tool names", () => {
      const tools = [
        createMockTool("tool1", "server1"),
        createMockTool("tool2", "server2"),
        createMockTool("tool3", "server1"),
      ];

      const conflicts = resolver.detectConflicts(tools);
      expect(conflicts).toHaveLength(0);
    });

    it("should detect conflicts with same tool name from different servers", () => {
      const tools = [
        createMockTool("same_tool", "server1", "Description from server1"),
        createMockTool("same_tool", "server2", "Description from server2"),
        createMockTool("different_tool", "server1"),
      ];

      const conflicts = resolver.detectConflicts(tools);
      expect(conflicts).toHaveLength(1);
      
      const conflict = conflicts[0];
      expect(conflict.toolName).toBe("same_tool");
      expect(conflict.conflictingServers).toEqual(["server1", "server2"]);
      expect(conflict.tools).toHaveLength(2);
    });

    it("should detect multiple conflicts", () => {
      const tools = [
        createMockTool("conflict1", "server1"),
        createMockTool("conflict1", "server2"),
        createMockTool("conflict2", "server1"),
        createMockTool("conflict2", "server3"),
        createMockTool("unique", "server1"),
      ];

      const conflicts = resolver.detectConflicts(tools);
      expect(conflicts).toHaveLength(2);
      
      const toolNames = conflicts.map(c => c.toolName);
      expect(toolNames).toContain("conflict1");
      expect(toolNames).toContain("conflict2");
    });

    it("should not detect conflicts with same tool name from same server", () => {
      const tools = [
        createMockTool("same_tool", "server1"),
        createMockTool("same_tool", "server1"), // Duplicate from same server
      ];

      const conflicts = resolver.detectConflicts(tools);
      expect(conflicts).toHaveLength(0);
    });
  });

  describe("namespace resolution strategy", () => {
    beforeEach(() => {
      resolver = new ToolConflictResolver({
        strategy: "namespace",
        separator: ".",
      });
    });

    it("should resolve conflicts with namespace prefixing", () => {
      const conflict = {
        toolName: "conflicted_tool",
        conflictingServers: ["server1", "server2"],
        tools: [
          createMockTool("conflicted_tool", "server1"),
          createMockTool("conflicted_tool", "server2"),
        ],
      };

      const resolution = resolver.resolveConflict(conflict);
      
      expect(resolution.strategy).toBe("namespace");
      expect(resolution.resolvedTools).toHaveLength(2);
      expect(resolution.discardedTools).toHaveLength(0);
      
      const namespaceNames = resolution.resolvedTools.map(t => t.namespacedName);
      expect(namespaceNames).toContain("server1.conflicted_tool");
      expect(namespaceNames).toContain("server2.conflicted_tool");
    });

    it("should use custom separator", () => {
      resolver = new ToolConflictResolver({
        strategy: "namespace",
        separator: "_",
      });

      const conflict = {
        toolName: "tool",
        conflictingServers: ["server1"],
        tools: [createMockTool("tool", "server1")],
      };

      const resolution = resolver.resolveConflict(conflict);
      expect(resolution.resolvedTools[0].namespacedName).toBe("server1_tool");
    });
  });

  describe("suffix resolution strategy", () => {
    beforeEach(() => {
      resolver = new ToolConflictResolver({
        strategy: "suffix",
        separator: "_",
      });
    });

    it("should resolve conflicts with server name suffix", () => {
      const conflict = {
        toolName: "tool",
        conflictingServers: ["server1", "server2"],
        tools: [
          createMockTool("tool", "server1"),
          createMockTool("tool", "server2"),
        ],
      };

      const resolution = resolver.resolveConflict(conflict);
      
      expect(resolution.strategy).toBe("suffix");
      expect(resolution.resolvedTools).toHaveLength(2);
      
      const namespaceNames = resolution.resolvedTools.map(t => t.namespacedName);
      expect(namespaceNames).toContain("tool_server1");
      expect(namespaceNames).toContain("tool_server2");
    });
  });

  describe("priority resolution strategy", () => {
    beforeEach(() => {
      resolver = new ToolConflictResolver({
        strategy: "priority",
        serverPriority: ["server2", "server1", "server3"],
      });
    });

    it("should resolve conflicts using server priority", () => {
      const conflict = {
        toolName: "tool",
        conflictingServers: ["server1", "server2", "server3"],
        tools: [
          createMockTool("tool", "server1"),
          createMockTool("tool", "server2"),
          createMockTool("tool", "server3"),
        ],
      };

      const resolution = resolver.resolveConflict(conflict);
      
      expect(resolution.strategy).toBe("priority");
      expect(resolution.resolvedTools).toHaveLength(1);
      expect(resolution.resolvedTools[0].serverName).toBe("server2"); // Highest priority
      expect(resolution.discardedTools).toHaveLength(2);
    });

    it("should fallback to first strategy when no server priority set", () => {
      resolver = new ToolConflictResolver({
        strategy: "priority",
        serverPriority: [],
      });

      const tools = [
        createMockTool("tool", "server1"),
        createMockTool("tool", "server2"),
      ];
      tools[0].discoveredAt = new Date(2023, 0, 1);
      tools[1].discoveredAt = new Date(2023, 0, 2);

      const conflict = {
        toolName: "tool",
        conflictingServers: ["server1", "server2"],
        tools,
      };

      const resolution = resolver.resolveConflict(conflict);
      
      expect(resolution.strategy).toBe("priority");
      expect(resolution.resolvedTools).toHaveLength(1);
      expect(resolution.resolvedTools[0].serverName).toBe("server1"); // First discovered
    });
  });

  describe("first resolution strategy", () => {
    beforeEach(() => {
      resolver = new ToolConflictResolver({
        strategy: "first",
      });
    });

    it("should resolve conflicts by selecting first discovered tool", () => {
      const tools = [
        createMockTool("tool", "server1"),
        createMockTool("tool", "server2"),
      ];
      
      // Set discovery times
      tools[0].discoveredAt = new Date(2023, 0, 2); // Later
      tools[1].discoveredAt = new Date(2023, 0, 1); // Earlier

      const conflict = {
        toolName: "tool",
        conflictingServers: ["server1", "server2"],
        tools,
      };

      const resolution = resolver.resolveConflict(conflict);
      
      expect(resolution.strategy).toBe("first");
      expect(resolution.resolvedTools).toHaveLength(1);
      expect(resolution.resolvedTools[0].serverName).toBe("server2"); // Earlier discovery
      expect(resolution.discardedTools).toHaveLength(1);
    });
  });

  describe("merge resolution strategy", () => {
    beforeEach(() => {
      resolver = new ToolConflictResolver({
        strategy: "merge",
        allowMerging: true,
        mergingRules: {
          requireSameDescription: true,
          allowSchemaExtension: true,
        },
      });
    });

    it("should merge compatible tools", () => {
      const schema1 = {
        type: "object",
        properties: {
          input: { type: "string" },
        },
      };

      const schema2 = {
        type: "object",
        properties: {
          input: { type: "string" },
          optional: { type: "number" },
        },
      };

      const tools = [
        createMockTool("tool", "server1", "Same description", schema1),
        createMockTool("tool", "server2", "Same description", schema2),
      ];

      const conflict = {
        toolName: "tool",
        conflictingServers: ["server1", "server2"],
        tools,
      };

      const resolution = resolver.resolveConflict(conflict);
      
      expect(resolution.strategy).toBe("merge");
      expect(resolution.resolvedTools).toHaveLength(1);
      expect(resolution.mergedTool).toBeDefined();
      expect(resolution.mergedTool!.serverName).toBe("server1,server2");
      expect(resolution.discardedTools).toHaveLength(2);
    });

    it("should fallback to namespace when tools cannot be merged", () => {
      const tools = [
        createMockTool("tool", "server1", "Different description 1"),
        createMockTool("tool", "server2", "Different description 2"),
      ];

      const conflict = {
        toolName: "tool",
        conflictingServers: ["server1", "server2"],
        tools,
      };

      const resolution = resolver.resolveConflict(conflict);
      
      // Should fallback to namespace strategy
      expect(resolution.strategy).toBe("namespace");
      expect(resolution.resolvedTools).toHaveLength(2);
    });

    it("should not merge when merging is disabled", () => {
      resolver = new ToolConflictResolver({
        strategy: "merge",
        allowMerging: false,
      });

      const tools = [
        createMockTool("tool", "server1", "Same description"),
        createMockTool("tool", "server2", "Same description"),
      ];

      const conflict = {
        toolName: "tool",
        conflictingServers: ["server1", "server2"],
        tools,
      };

      const resolution = resolver.resolveConflict(conflict);
      
      // Should fallback to namespace strategy
      expect(resolution.strategy).toBe("namespace");
      expect(resolution.resolvedTools).toHaveLength(2);
    });
  });

  describe("error resolution strategy", () => {
    beforeEach(() => {
      resolver = new ToolConflictResolver({
        strategy: "error",
      });
    });

    it("should throw error on conflict", () => {
      const conflict = {
        toolName: "tool",
        conflictingServers: ["server1", "server2"],
        tools: [
          createMockTool("tool", "server1"),
          createMockTool("tool", "server2"),
        ],
      };

      expect(() => resolver.resolveConflict(conflict)).toThrow(
        'Tool name conflict detected: "tool" exists in servers: server1, server2'
      );
    });
  });

  describe("conflict resolution workflow", () => {
    it("should resolve all conflicts in a tool list", () => {
      const tools = [
        createMockTool("conflict1", "server1"),
        createMockTool("conflict1", "server2"),
        createMockTool("conflict2", "server1"),
        createMockTool("conflict2", "server3"),
        createMockTool("unique", "server1"),
      ];

      const resolved = resolver.resolveConflicts(tools);
      
      // Should have all tools with conflicts resolved
      expect(resolved).toHaveLength(5);
      
      // All names should be unique
      const namespacedNames = resolved.map(t => t.namespacedName);
      expect(new Set(namespacedNames).size).toBe(5);
      
      // Should include the unique tool unchanged
      expect(namespacedNames).toContain("server1.unique");
    });

    it("should handle no conflicts gracefully", () => {
      const tools = [
        createMockTool("tool1", "server1"),
        createMockTool("tool2", "server2"),
      ];

      const resolved = resolver.resolveConflicts(tools);
      expect(resolved).toEqual(tools);
    });
  });

  describe("conflict statistics", () => {
    it("should provide conflict statistics", () => {
      const tools = [
        createMockTool("conflict", "server1"),
        createMockTool("conflict", "server2"),
        createMockTool("unique", "server1"),
      ];

      const stats = resolver.getConflictStats(tools);
      
      expect(stats.totalConflicts).toBe(1);
      expect(stats.conflictedTools).toBe(2);
      expect(stats.conflictRate).toBeCloseTo(2 / 3);
      expect(stats.conflicts).toHaveLength(1);
      expect(stats.conflicts[0].toolName).toBe("conflict");
      expect(stats.conflicts[0].serverCount).toBe(2);
    });

    it("should handle empty tool list", () => {
      const stats = resolver.getConflictStats([]);
      
      expect(stats.totalConflicts).toBe(0);
      expect(stats.conflictedTools).toBe(0);
      expect(stats.conflictRate).toBe(0);
      expect(stats.conflicts).toHaveLength(0);
    });
  });

  describe("configuration management", () => {
    it("should update configuration", () => {
      const newConfig: Partial<ConflictResolutionConfig> = {
        strategy: "priority",
        serverPriority: ["server1", "server2"],
      };

      resolver.updateConfig(newConfig);
      
      const config = resolver.getConfig();
      expect(config.strategy).toBe("priority");
      expect(config.serverPriority).toEqual(["server1", "server2"]);
    });

    it("should get current configuration", () => {
      const config = resolver.getConfig();
      
      expect(config).toHaveProperty("strategy");
      expect(config).toHaveProperty("separator");
      expect(config).toHaveProperty("allowMerging");
    });
  });

  describe("schema compatibility", () => {
    beforeEach(() => {
      resolver = new ToolConflictResolver({
        strategy: "merge",
        allowMerging: true,
        mergingRules: {
          requireSameDescription: false,
          allowSchemaExtension: true,
        },
      });
    });

    it("should detect identical schemas as compatible", () => {
      const schema = {
        type: "object",
        properties: { input: { type: "string" } },
      };

      const tools = [
        createMockTool("tool", "server1", "Desc 1", schema),
        createMockTool("tool", "server2", "Desc 2", schema),
      ];

      const conflict = {
        toolName: "tool",
        conflictingServers: ["server1", "server2"],
        tools,
      };

      const resolution = resolver.resolveConflict(conflict);
      expect(resolution.strategy).toBe("merge");
      expect(resolution.mergedTool).toBeDefined();
    });

    it("should detect schema extensions as compatible when allowed", () => {
      const baseSchema = {
        type: "object",
        properties: { input: { type: "string" } },
      };

      const extendedSchema = {
        type: "object",
        properties: {
          input: { type: "string" },
          extra: { type: "number" },
        },
      };

      const tools = [
        createMockTool("tool", "server1", "Desc", baseSchema),
        createMockTool("tool", "server2", "Desc", extendedSchema),
      ];

      const conflict = {
        toolName: "tool",
        conflictingServers: ["server1", "server2"],
        tools,
      };

      const resolution = resolver.resolveConflict(conflict);
      expect(resolution.strategy).toBe("merge");
      expect(resolution.mergedTool).toBeDefined();
      
      // Should use the more comprehensive schema
      const mergedSchema = resolution.mergedTool!.schema;
      expect(Object.keys(mergedSchema.properties || {})).toContain("extra");
    });

    it("should reject incompatible schemas when extension not allowed", () => {
      resolver = new ToolConflictResolver({
        strategy: "merge",
        allowMerging: true,
        mergingRules: {
          requireSameDescription: false,
          allowSchemaExtension: false,
        },
      });

      const schema1 = {
        type: "object",
        properties: { input: { type: "string" } },
      };

      const schema2 = {
        type: "object",
        properties: { different: { type: "number" } },
      };

      const tools = [
        createMockTool("tool", "server1", "Desc", schema1),
        createMockTool("tool", "server2", "Desc", schema2),
      ];

      const conflict = {
        toolName: "tool",
        conflictingServers: ["server1", "server2"],
        tools,
      };

      const resolution = resolver.resolveConflict(conflict);
      // Should fallback to namespace strategy
      expect(resolution.strategy).toBe("namespace");
    });
  });
});