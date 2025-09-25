/**
 * Token Counter Tests
 */

import { tokenCounter } from "./token-counter.js";

describe("TokenCounter", () => {
  describe("approximateTokens", () => {
    it("should estimate tokens for simple words", () => {
      // Test short words (1-3 chars) = 1 token each
      const tool1 = {
        name: "test",
        namespacedName: "git.log",
        description: "the is a",  // 3 short words = 3 tokens
      };
      const tokens1 = tokenCounter.calculateToolTokens(tool1);

      // namespacedName: "git.log" = "git" (1) + "log" (1) = 2
      // description: "the is a" = 1 + 1 + 1 = 3
      // Total: 5 tokens
      expect(tokens1).toBeGreaterThan(3);
      expect(tokens1).toBeLessThan(10);
    });

    it("should estimate tokens for longer words", () => {
      const tool2 = {
        name: "test",
        namespacedName: "docker.container",
        description: "extraordinarily comprehensive documentation",
      };
      const tokens2 = tokenCounter.calculateToolTokens(tool2);

      // Longer words should be split into multiple tokens
      expect(tokens2).toBeGreaterThan(5);
    });

    it("should calculate context info with percentages", () => {
      const tools = [
        { name: "tool1", namespacedName: "git.status", description: "Show status" },
        { name: "tool2", namespacedName: "git.commit", description: "Make commit" },
      ];

      const totalTokens = tokenCounter.calculateToolsetTokens(tools);
      const tool1Tokens = tokenCounter.calculateToolTokens(tools[0]);
      const contextInfo = tokenCounter.calculateContextInfo(tool1Tokens, totalTokens);

      expect(contextInfo.tokens).toBe(tool1Tokens);
      expect(contextInfo.percentTotal).toBeGreaterThan(0);
      expect(contextInfo.percentTotal).toBeLessThanOrEqual(1);
    });

    it("should handle JSON schema in tool definitions", () => {
      const toolWithSchema = {
        name: "test",
        namespacedName: "test.tool",
        tool: {
          description: "Test tool",
          inputSchema: {
            type: "object",
            properties: {
              name: { type: "string", description: "Name field" },
              value: { type: "number", description: "Value field" }
            },
            required: ["name"]
          }
        }
      };

      const tokens = tokenCounter.calculateToolTokens(toolWithSchema);

      // Should include the schema in token count
      expect(tokens).toBeGreaterThan(10); // Schema adds significant tokens
    });

    it("should use cache for repeated calculations", () => {
      const tool = {
        name: "cached",
        namespacedName: "test.cached",
        description: "Cached tool"
      };

      // Clear cache first
      tokenCounter.clearCache();

      // First calculation
      const tokens1 = tokenCounter.calculateToolTokens(tool);

      // Second calculation should use cache (same result)
      const tokens2 = tokenCounter.calculateToolTokens(tool);

      expect(tokens1).toBe(tokens2);
    });
  });

  describe("addContextToTools", () => {
    it("should add context info to tools array", () => {
      const tools = [
        { name: "tool1", namespacedName: "git.status", description: "Show status" },
        { name: "tool2", namespacedName: "git.commit", description: "Make commit" },
        { name: "tool3", namespacedName: "docker.run", description: "Run container" },
      ];

      const toolsWithContext = tokenCounter.addContextToTools(tools);

      expect(toolsWithContext).toHaveLength(3);

      // Each tool should have context
      toolsWithContext.forEach(tool => {
        expect(tool.context).toBeDefined();
        expect(tool.context.tokens).toBeGreaterThan(0);
        expect(tool.context.percentTotal).toBeGreaterThanOrEqual(0);
        expect(tool.context.percentTotal).toBeLessThanOrEqual(1);
      });

      // Percentages should sum to approximately 1 (100%)
      const totalPercent = toolsWithContext.reduce(
        (sum, tool) => sum + (tool.context.percentTotal || 0),
        0
      );
      expect(totalPercent).toBeCloseTo(1, 2); // Close to 1 within 2 decimal places
    });
  });
});