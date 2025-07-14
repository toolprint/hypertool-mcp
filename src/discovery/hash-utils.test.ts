/**
 * Tests for hash utilities
 */

import { ToolHashUtils } from "./hash-utils";
import { DiscoveredTool } from "./types";

describe("ToolHashUtils", () => {
  const mockTool: DiscoveredTool = {
    name: "test_tool",
    serverName: "test-server",
    namespacedName: "test-server.test_tool",
    tool: {
      name: "test_tool",
      description: "A test tool",
      inputSchema: {
        type: "object",
        properties: { input: { type: "string" } },
        required: ["input"],
      },
    },
    discoveredAt: new Date(),
    lastUpdated: new Date(),
    serverStatus: "connected",
    toolHash: "test-hash",
  };

  describe("calculateToolHash", () => {
    it("should generate consistent hashes for same tool", () => {
      const hash1 = ToolHashUtils.calculateToolHash(mockTool);
      const hash2 = ToolHashUtils.calculateToolHash(mockTool);
      expect(hash1).toBe(hash2);
    });

    it("should generate different hashes when functional fields change", () => {
      const originalHash = ToolHashUtils.calculateToolHash(mockTool);
      
      // Change inputSchema - should change hash
      const modifiedTool = {
        ...mockTool,
        tool: {
          ...mockTool.tool,
          inputSchema: {
            ...mockTool.tool.inputSchema,
            properties: {
              ...mockTool.tool.inputSchema.properties,
              newField: { type: "boolean" },
            },
          },
        },
      };
      
      const modifiedHash = ToolHashUtils.calculateToolHash(modifiedTool);
      expect(modifiedHash).not.toBe(originalHash);
    });

    it("should generate same hash when non-functional fields change", () => {
      const originalHash = ToolHashUtils.calculateToolHash(mockTool);
      
      // Change description - should NOT change hash (description is excluded)
      const modifiedTool = {
        ...mockTool,
        tool: {
          ...mockTool.tool,
          description: "Modified description",
        },
      };
      
      const modifiedHash = ToolHashUtils.calculateToolHash(modifiedTool);
      expect(modifiedHash).toBe(originalHash);
    });
  });

  describe("detectToolChanges", () => {
    it("should detect added tools", () => {
      const originalTools = [mockTool];
      const newTool = { ...mockTool, name: "new_tool", namespacedName: "test-server.new_tool" };
      const currentTools = [mockTool, newTool];
      
      const changes = ToolHashUtils.detectToolChanges(originalTools, currentTools);
      const summary = ToolHashUtils.summarizeChanges(changes);
      
      expect(summary.added).toBe(1);
      expect(summary.unchanged).toBe(1);
    });

    it("should detect removed tools", () => {
      const originalTools = [mockTool, { ...mockTool, name: "tool2", namespacedName: "test-server.tool2" }];
      const currentTools = [mockTool];
      
      const changes = ToolHashUtils.detectToolChanges(originalTools, currentTools);
      const summary = ToolHashUtils.summarizeChanges(changes);
      
      expect(summary.removed).toBe(1);
      expect(summary.unchanged).toBe(1);
    });
  });
});