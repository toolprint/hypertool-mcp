/**
 * Efficient lookup structures for tool storage and retrieval
 */

import { DiscoveredTool } from "./types.js";

/**
 * Tool lookup index for fast retrieval
 */
export interface ToolLookupIndex {
  byName: Map<string, DiscoveredTool[]>;
  byServer: Map<string, DiscoveredTool[]>;
  byNamespaced: Map<string, DiscoveredTool>;
  byDescription: Map<string, DiscoveredTool[]>;
  searchableText: Map<string, string[]>; // tool key -> searchable keywords
}

/**
 * Search query options
 */
export interface SearchQuery {
  name?: string;
  server?: string;
  keywords?: string[];
  fuzzy?: boolean;
  limit?: number;
  offset?: number;
}

/**
 * Search result with relevance scoring
 */
export interface SearchResult {
  tool: DiscoveredTool;
  score: number;
  matchType: "exact" | "prefix" | "fuzzy" | "keyword";
  matchedField: "name" | "namespacedName" | "description" | "schema";
}

/**
 * Tool lookup manager with efficient indexing and search
 */
export class ToolLookupManager {
  private index: ToolLookupIndex;
  private tools = new Map<string, DiscoveredTool>();

  constructor() {
    this.index = this.createEmptyIndex();
  }

  /**
   * Add or update a tool in the lookup index
   */
  addTool(tool: DiscoveredTool): void {
    const key = this.getToolKey(tool);

    // Remove existing tool if it exists
    if (this.tools.has(key)) {
      this.removeTool(tool);
    }

    // Add to main storage
    this.tools.set(key, tool);

    // Update indices
    this.updateIndex(tool, "add");
  }

  /**
   * Remove a tool from the lookup index
   */
  removeTool(tool: DiscoveredTool): boolean {
    const key = this.getToolKey(tool);

    if (!this.tools.has(key)) {
      return false;
    }

    // Remove from main storage
    this.tools.delete(key);

    // Update indices
    this.updateIndex(tool, "remove");

    return true;
  }

  /**
   * Get a tool by exact namespaced name
   */
  getByNamespacedName(namespacedName: string): DiscoveredTool | null {
    return this.index.byNamespaced.get(namespacedName) || null;
  }

  /**
   * Get tools by original name
   */
  getByName(name: string): DiscoveredTool[] {
    return this.index.byName.get(name) || [];
  }

  /**
   * Get tools by server name
   */
  getByServer(serverName: string): DiscoveredTool[] {
    return this.index.byServer.get(serverName) || [];
  }

  /**
   * Search tools with relevance scoring
   */
  search(query: SearchQuery): SearchResult[] {
    const results: SearchResult[] = [];
    const { limit = 50, offset = 0 } = query;

    // Server-only search - return all tools from the server
    if (query.server && !query.name && !query.keywords) {
      const serverTools = this.getByServer(query.server);
      for (const tool of serverTools) {
        results.push({
          tool,
          score: 1.0,
          matchType: "exact",
          matchedField: "name",
        });
      }
      return results.slice(offset, offset + limit);
    }

    // Exact name match
    if (query.name) {
      const exactMatches = this.getByName(query.name);
      for (const tool of exactMatches) {
        if (!query.server || tool.serverName === query.server) {
          results.push({
            tool,
            score: 1.0,
            matchType: "exact",
            matchedField: "name",
          });
        }
      }
    }

    // Namespaced name match
    if (query.name && query.server) {
      const namespacedName = `${query.server}.${query.name}`;
      const tool = this.getByNamespacedName(namespacedName);
      if (tool) {
        results.push({
          tool,
          score: 1.0,
          matchType: "exact",
          matchedField: "namespacedName",
        });
      }
    }

    // Prefix matches
    if (query.name && query.fuzzy) {
      for (const [name, tools] of this.index.byName) {
        if (
          name.toLowerCase().startsWith(query.name.toLowerCase()) &&
          name !== query.name
        ) {
          for (const tool of tools) {
            if (!query.server || tool.serverName === query.server) {
              const score = this.calculatePrefixScore(query.name, name);
              results.push({
                tool,
                score,
                matchType: "prefix",
                matchedField: "name",
              });
            }
          }
        }
      }
    }

    // Keyword matches
    if (query.keywords && query.keywords.length > 0) {
      for (const [toolKey, keywords] of this.index.searchableText) {
        const tool = this.tools.get(toolKey);
        if (!tool || (query.server && tool.serverName !== query.server)) {
          continue;
        }

        const score = this.calculateKeywordScore(query.keywords, keywords);
        if (score > 0) {
          results.push({
            tool,
            score,
            matchType: "keyword",
            matchedField: "description",
          });
        }
      }
    }

    // Fuzzy search on description
    if (query.name && query.fuzzy) {
      for (const tool of this.tools.values()) {
        if (query.server && tool.serverName !== query.server) {
          continue;
        }

        if (tool.tool.description) {
          const score = this.calculateFuzzyScore(
            query.name,
            tool.tool.description
          );
          if (score > 0.3) {
            results.push({
              tool,
              score,
              matchType: "fuzzy",
              matchedField: "description",
            });
          }
        }
      }
    }

    // Remove duplicates and sort by score
    const uniqueResults = this.deduplicateResults(results);
    uniqueResults.sort((a, b) => b.score - a.score);

    // Apply pagination
    return uniqueResults.slice(offset, offset + limit);
  }

  /**
   * Get all tools
   */
  getAllTools(): DiscoveredTool[] {
    return Array.from(this.tools.values());
  }

  /**
   * Get tool count by server
   */
  getServerCounts(): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const [serverName, tools] of this.index.byServer) {
      counts[serverName] = tools.length;
    }
    return counts;
  }

  /**
   * Clear all tools
   */
  clear(): void {
    this.tools.clear();
    this.index = this.createEmptyIndex();
  }

  /**
   * Clear tools for a specific server
   */
  clearServer(serverName: string): void {
    const serverTools = this.index.byServer.get(serverName) || [];

    for (const tool of serverTools) {
      this.removeTool(tool);
    }
  }

  /**
   * Get lookup statistics
   */
  getStats() {
    return {
      totalTools: this.tools.size,
      serverCount: this.index.byServer.size,
      uniqueNames: this.index.byName.size,
      indexSize: {
        byName: this.index.byName.size,
        byServer: this.index.byServer.size,
        byNamespaced: this.index.byNamespaced.size,
        searchableText: this.index.searchableText.size,
      },
    };
  }

  /**
   * Create empty index structure
   */
  private createEmptyIndex(): ToolLookupIndex {
    return {
      byName: new Map(),
      byServer: new Map(),
      byNamespaced: new Map(),
      byDescription: new Map(),
      searchableText: new Map(),
    };
  }

  /**
   * Generate unique key for a tool
   */
  private getToolKey(tool: DiscoveredTool): string {
    return `${tool.serverName}:${tool.name}`;
  }

  /**
   * Update index when adding or removing a tool
   */
  private updateIndex(tool: DiscoveredTool, action: "add" | "remove"): void {
    const key = this.getToolKey(tool);

    if (action === "add") {
      // Add to name index
      if (!this.index.byName.has(tool.name)) {
        this.index.byName.set(tool.name, []);
      }
      this.index.byName.get(tool.name)!.push(tool);

      // Add to server index
      if (!this.index.byServer.has(tool.serverName)) {
        this.index.byServer.set(tool.serverName, []);
      }
      this.index.byServer.get(tool.serverName)!.push(tool);

      // Add to namespaced index
      this.index.byNamespaced.set(tool.namespacedName, tool);

      // Add to description index
      if (tool.tool.description) {
        if (!this.index.byDescription.has(tool.tool.description)) {
          this.index.byDescription.set(tool.tool.description, []);
        }
        this.index.byDescription.get(tool.tool.description)!.push(tool);
      }

      // Add to searchable text index
      const keywords = this.extractKeywords(tool);
      this.index.searchableText.set(key, keywords);
    } else {
      // Remove from name index
      const nameTools = this.index.byName.get(tool.name);
      if (nameTools) {
        const index = nameTools.findIndex((t) => this.getToolKey(t) === key);
        if (index !== -1) {
          nameTools.splice(index, 1);
        }
        if (nameTools.length === 0) {
          this.index.byName.delete(tool.name);
        }
      }

      // Remove from server index
      const serverTools = this.index.byServer.get(tool.serverName);
      if (serverTools) {
        const index = serverTools.findIndex((t) => this.getToolKey(t) === key);
        if (index !== -1) {
          serverTools.splice(index, 1);
        }
        if (serverTools.length === 0) {
          this.index.byServer.delete(tool.serverName);
        }
      }

      // Remove from namespaced index
      this.index.byNamespaced.delete(tool.namespacedName);

      // Remove from description index
      if (tool.tool.description) {
        const descTools = this.index.byDescription.get(tool.tool.description);
        if (descTools) {
          const index = descTools.findIndex((t) => this.getToolKey(t) === key);
          if (index !== -1) {
            descTools.splice(index, 1);
          }
          if (descTools.length === 0) {
            this.index.byDescription.delete(tool.tool.description);
          }
        }
      }

      // Remove from searchable text index
      this.index.searchableText.delete(key);
    }
  }

  /**
   * Extract keywords from a tool for searching
   */
  private extractKeywords(tool: DiscoveredTool): string[] {
    const keywords: string[] = [];

    // Add tool name and variations
    keywords.push(tool.name.toLowerCase());
    keywords.push(tool.namespacedName.toLowerCase());
    keywords.push(tool.serverName.toLowerCase());

    // Add description words
    if (tool.tool.description) {
      const words = tool.tool.description
        .toLowerCase()
        .split(/\s+/)
        .filter((word: string) => word.length > 2)
        .map((word: string) => word.replace(/[^\w]/g, ""));
      keywords.push(...words);
    }

    // Add schema property names
    if (tool.tool.inputSchema.properties) {
      for (const prop of Object.keys(tool.tool.inputSchema.properties)) {
        keywords.push(prop.toLowerCase());
      }
    }

    return [...new Set(keywords)]; // Remove duplicates
  }

  /**
   * Calculate prefix match score
   */
  private calculatePrefixScore(query: string, target: string): number {
    const queryLower = query.toLowerCase();
    const targetLower = target.toLowerCase();

    if (targetLower.startsWith(queryLower)) {
      return 0.8 * (queryLower.length / targetLower.length);
    }

    return 0;
  }

  /**
   * Calculate keyword match score
   */
  private calculateKeywordScore(
    queryKeywords: string[],
    toolKeywords: string[]
  ): number {
    const queryLower = queryKeywords.map((k) => k.toLowerCase());
    const toolLower = toolKeywords.map((k) => k.toLowerCase());

    let matches = 0;
    for (const queryKeyword of queryLower) {
      if (toolLower.includes(queryKeyword)) {
        matches++;
      }
    }

    return matches / queryKeywords.length;
  }

  /**
   * Calculate fuzzy match score using simple string similarity
   */
  private calculateFuzzyScore(query: string, target: string): number {
    const queryLower = query.toLowerCase();
    const targetLower = target.toLowerCase();

    if (targetLower.includes(queryLower)) {
      return 0.6 * (queryLower.length / targetLower.length);
    }

    return 0;
  }

  /**
   * Remove duplicate results based on tool key
   */
  private deduplicateResults(results: SearchResult[]): SearchResult[] {
    const seen = new Set<string>();
    const unique: SearchResult[] = [];

    for (const result of results) {
      const key = this.getToolKey(result.tool);
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(result);
      }
    }

    return unique;
  }
}
