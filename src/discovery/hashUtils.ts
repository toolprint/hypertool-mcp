/**
 * Hashing utilities for tool identity and change detection
 */

import { createHash } from "crypto";
import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { DiscoveredTool, MCPToolDefinition, ToolChangeInfo } from "./types.js";

/**
 * Hash algorithm to use
 */
const HASH_ALGORITHM = "sha256";

/**
 * Tool hash data - only includes fields that affect tool identity/functionality
 */
interface ToolHashData {
  name: string;
  serverName: string;
  inputSchema: any;
  outputSchema?: any;
  annotations?: Record<string, any>;
}

/**
 * Tool hash utility class
 */
export class ToolHashUtils {
  /**
   * Calculate tool hash for identity and change detection
   */
  static calculateToolHash(
    tool: DiscoveredTool | MCPToolDefinition,
    serverName?: string
  ): string {
    const toolDef = "tool" in tool ? tool.tool : tool;

    const hashData: ToolHashData = {
      name: (toolDef as any).name,
      serverName: serverName || (tool as DiscoveredTool).serverName,
      inputSchema: (toolDef as any).inputSchema,
      outputSchema: (toolDef as any).outputSchema,
      annotations: (toolDef as any).annotations,
    };

    return this.hashObject(hashData);
  }

  /**
   * Calculate hash for a list of tools (server tools hash)
   */
  static calculateServerToolsHash(tools: DiscoveredTool[]): string {
    // Sort tools by name for consistent hashing
    const sortedTools = [...tools].sort((a, b) => a.name.localeCompare(b.name));
    const toolHashes = sortedTools.map((tool) => this.calculateToolHash(tool));

    return this.hashObject(toolHashes);
  }

  /**
   * Compare tools and detect changes
   */
  static detectToolChanges(
    previousTools: DiscoveredTool[],
    currentTools: DiscoveredTool[]
  ): ToolChangeInfo[] {
    const changes: ToolChangeInfo[] = [];

    // Create lookup maps
    const previousMap = new Map<string, DiscoveredTool>();
    const currentMap = new Map<string, DiscoveredTool>();

    // Populate maps using namespaced names as keys
    for (const tool of previousTools) {
      previousMap.set(tool.namespacedName, tool);
    }

    for (const tool of currentTools) {
      currentMap.set(tool.namespacedName, tool);
    }

    // Check for additions and updates
    for (const [namespacedName, currentTool] of currentMap) {
      const previousTool = previousMap.get(namespacedName);

      if (!previousTool) {
        // New tool
        changes.push({
          tool: currentTool,
          changeType: "added",
          currentHash: currentTool.toolHash,
        });
      } else {
        // Check if tool updated
        if (previousTool.toolHash !== currentTool.toolHash) {
          changes.push({
            tool: currentTool,
            changeType: "updated",
            previousHash: previousTool.toolHash,
            currentHash: currentTool.toolHash,
          });
        } else {
          changes.push({
            tool: currentTool,
            changeType: "unchanged",
            currentHash: currentTool.toolHash,
          });
        }
      }
    }

    // Check for removals
    for (const [namespacedName, previousTool] of previousMap) {
      if (!currentMap.has(namespacedName)) {
        changes.push({
          tool: previousTool,
          changeType: "removed",
          previousHash: previousTool.toolHash,
        });
      }
    }

    return changes;
  }

  /**
   * Create tool with hash from MCP tool definition
   */
  static createHashedTool(
    toolDef: MCPToolDefinition,
    serverName: string,
    namespacedName: string
  ): DiscoveredTool {
    const now = new Date();
    const toolHash = this.calculateToolHash(toolDef, serverName);

    return {
      name: toolDef.name,
      serverName,
      namespacedName,
      tool: toolDef,
      discoveredAt: now,
      lastUpdated: now,
      serverStatus: "connected",
      toolHash,
    };
  }

  /**
   * Update tool hash after modification
   */
  static updateToolHash(tool: DiscoveredTool): DiscoveredTool {
    return {
      ...tool,
      lastUpdated: new Date(),
      toolHash: this.calculateToolHash(tool),
    };
  }

  /**
   * Get summary of tool changes
   */
  static summarizeChanges(changes: ToolChangeInfo[]) {
    const summary = {
      added: 0,
      updated: 0,
      removed: 0,
      unchanged: 0,
      total: changes.length,
    };

    for (const change of changes) {
      summary[change.changeType]++;
    }

    return summary;
  }

  /**
   * Hash an object to a hex string
   */
  private static hashObject(obj: any): string {
    const hash = createHash(HASH_ALGORITHM);
    const serialized = JSON.stringify(obj);
    hash.update(serialized);
    return hash.digest("hex");
  }
}

/**
 * Tool hash manager for tracking tool changes over time
 */
export class ToolHashManager {
  private hashHistory = new Map<string, string[]>(); // namespacedName -> hash history
  private maxHistorySize = 10;

  /**
   * Add tool hash to history
   */
  addToHistory(tool: DiscoveredTool): void {
    const key = tool.namespacedName;

    if (!this.hashHistory.has(key)) {
      this.hashHistory.set(key, []);
    }

    const history = this.hashHistory.get(key)!;
    history.push(tool.toolHash);

    // Limit history size
    if (history.length > this.maxHistorySize) {
      history.shift();
    }
  }

  /**
   * Get hash history for a tool
   */
  getHistory(namespacedName: string): string[] {
    return this.hashHistory.get(namespacedName) || [];
  }

  /**
   * Check if tool has changed since last known version
   */
  hasChanged(tool: DiscoveredTool): boolean {
    const history = this.getHistory(tool.namespacedName);
    if (history.length === 0) {
      return true; // New tool
    }

    const lastHash = history[history.length - 1];
    return lastHash !== tool.toolHash;
  }

  /**
   * Get tools that have changed
   */
  getChangedTools(tools: DiscoveredTool[]): DiscoveredTool[] {
    return tools.filter((tool) => this.hasChanged(tool));
  }

  /**
   * Clear history for a tool
   */
  clearHistory(namespacedName: string): void {
    this.hashHistory.delete(namespacedName);
  }

  /**
   * Clear all history
   */
  clearAllHistory(): void {
    this.hashHistory.clear();
  }

  /**
   * Get statistics about hash history
   */
  getStats() {
    return {
      totalTools: this.hashHistory.size,
      averageHistorySize:
        this.hashHistory.size > 0
          ? Array.from(this.hashHistory.values()).reduce(
              (sum, hist) => sum + hist.length,
              0
            ) / this.hashHistory.size
          : 0,
      maxHistorySize: this.maxHistorySize,
    };
  }
}
