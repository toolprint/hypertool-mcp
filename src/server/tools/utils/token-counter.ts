/**
 * Token Counter Utility
 * Provides token counting ESTIMATES for MCP tools
 *
 * Why we use approximation:
 * - Different LLMs use different tokenizers (GPT uses tiktoken, Claude uses its own)
 * - We don't know which LLM will consume these tools at runtime
 * - For comparing relative tool sizes, estimates are sufficient
 *
 * How LLM tokenization actually works:
 * - Uses BPE (Byte Pair Encoding) or similar subword algorithms
 * - Common words = 1 token ("the", "is", "and")
 * - Uncommon words = multiple tokens ("extraordinary" → ["extra", "ordinary"])
 * - NOT simply words or characters
 *
 * Our approach: Simple word-length heuristic that approximates BPE behavior
 */

import { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { ContextInfo, ToolInfoResponse } from "../schemas.js";
import type { DiscoveredTool } from "../../../discovery/types.js";

/**
 * Fast token estimator using word-length heuristics
 * Provides consistent estimates for comparing tool context usage
 */
export class TokenCounter {
  private cache = new Map<string, number>();

  /**
   * Calculate tokens for a tool definition
   */
  calculateToolTokens(tool: {
    name: string;
    namespacedName?: string;
    description?: string;
    tool?: Tool;
  }): number {
    // Use namespacedName or fallback to name
    const toolName = tool.namespacedName || tool.name;

    // Check cache first
    const cacheKey = `${toolName}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    // Components to count
    const components: string[] = [];

    // Add tool name
    components.push(toolName);

    // Add description
    if (tool.description) {
      components.push(tool.description);
    } else if (tool.tool?.description) {
      components.push(tool.tool.description);
    }

    // Add parameter schema if available
    if (tool.tool?.inputSchema) {
      // Serialize the schema to JSON string (compact)
      components.push(JSON.stringify(tool.tool.inputSchema));
    }

    // Join all components and count tokens
    const fullText = components.join(" ");
    const tokens = this.approximateTokens(fullText);

    // Cache the result
    this.cache.set(cacheKey, tokens);

    return tokens;
  }

  /**
   * Calculate tokens for an array of tools
   */
  calculateToolsetTokens(tools: Array<{
    name: string;
    namespacedName?: string;
    description?: string;
    tool?: Tool;
  }>): number {
    return tools.reduce((total, tool) => total + this.calculateToolTokens(tool), 0);
  }

  /**
   * BPE-based approximation using word length patterns
   *
   * In BPE (Byte Pair Encoding) tokenization:
   * - Short common words (1-3 chars): Usually 1 token ("the", "is", "a")
   * - Medium words (4-7 chars): Often 1-2 tokens ("hello" → 1, "running" → 1-2)
   * - Long words (8+ chars): Multiple tokens based on subword patterns
   *
   * We use a simple word-length based estimate that works well for English text
   * and JSON schemas (which MCP tools primarily contain).
   */
  private approximateTokens(text: string): number {
    // Split on whitespace to get words
    const words = text.split(/\s+/).filter(w => w.length > 0);

    let totalTokens = 0;
    for (const word of words) {
      if (word.length <= 3) {
        totalTokens += 1;  // Short words = 1 token
      } else if (word.length <= 7) {
        totalTokens += Math.ceil(word.length / 5);  // Medium words
      } else {
        totalTokens += Math.ceil(word.length / 4);  // Long words split more
      }
    }

    return totalTokens;
  }

  /**
   * Clear the cache (useful when tools are updated)
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Calculate context info with percentage
   */
  calculateContextInfo(tokens: number, totalTokens: number | null): ContextInfo {
    return {
      tokens,
      percentTotal: totalTokens !== null && totalTokens > 0
        ? Math.round((tokens / totalTokens) * 10000) / 10000  // 4 decimal places
        : null
    };
  }

  /**
   * Add context info to tools array
   */
  addContextToTools<T extends { name: string; namespacedName?: string; description?: string; tool?: Tool }>(
    tools: T[],
    totalTokens?: number
  ): Array<T & { context: ContextInfo }> {
    const effectiveTotal = totalTokens ?? this.calculateToolsetTokens(tools);

    return tools.map(tool => {
      const tokens = this.calculateToolTokens(tool);
      return {
        ...tool,
        context: this.calculateContextInfo(tokens, effectiveTotal)
      };
    });
  }

  /**
   * Convert a DiscoveredTool to ToolInfoResponse with context
   */
  convertToToolInfoResponse(tool: DiscoveredTool, totalTokens: number): ToolInfoResponse {
    const toolTokens = this.calculateToolTokens(tool);

    return {
      name: tool.name,
      namespacedName: tool.namespacedName,
      serverName: tool.serverName,
      description: tool.tool?.description,
      context: this.calculateContextInfo(toolTokens, totalTokens)
    };
  }
}

// Singleton instance
export const tokenCounter = new TokenCounter();