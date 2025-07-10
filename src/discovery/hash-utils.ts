/**
 * Hashing utilities for tool change detection
 */

import { createHash } from "crypto";
import { DiscoveredTool, MCPToolDefinition, ToolChangeInfo } from "./types";

/**
 * Hash algorithm to use
 */
const HASH_ALGORITHM = "sha256";

/**
 * Hashable tool structure (excludes metadata like timestamps)
 */
interface HashableToolStructure {
  name: string;
  serverName: string;
  schema: any;
  description?: string;
}

/**
 * Hashable tool metadata (includes all fields for full hash)
 */
interface HashableToolMetadata extends HashableToolStructure {
  namespacedName: string;
  discoveredAt: string;
  lastUpdated: string;
  serverStatus: string;
}

/**
 * Tool hash utility class
 */
export class ToolHashUtils {
  /**
   * Calculate structure hash for a tool (excludes timestamps and metadata)
   */
  static calculateStructureHash(tool: DiscoveredTool | MCPToolDefinition, serverName?: string): string {
    const hashableStructure: HashableToolStructure = {
      name: tool.name,
      serverName: serverName || (tool as DiscoveredTool).serverName,
      schema: 'inputSchema' in tool ? tool.inputSchema : (tool as DiscoveredTool).schema,
      description: tool.description,
    };

    return this.hashObject(hashableStructure);
  }

  /**
   * Calculate full hash for a tool (includes all metadata)
   */
  static calculateFullHash(tool: DiscoveredTool): string {
    const hashableMetadata: HashableToolMetadata = {
      name: tool.name,
      serverName: tool.serverName,
      namespacedName: tool.namespacedName,
      schema: tool.schema,
      description: tool.description,
      discoveredAt: tool.discoveredAt.toISOString(),
      lastUpdated: tool.lastUpdated.toISOString(),
      serverStatus: tool.serverStatus,
    };

    return this.hashObject(hashableMetadata);
  }

  /**
   * Calculate hash for a list of tools (server tools hash)
   */
  static calculateServerToolsHash(tools: DiscoveredTool[]): string {
    // Sort tools by name for consistent hashing
    const sortedTools = [...tools].sort((a, b) => a.name.localeCompare(b.name));
    const toolHashes = sortedTools.map(tool => this.calculateStructureHash(tool));
    
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
    
    for (const tool of previousTools) {
      previousMap.set(tool.namespacedName, tool);
    }
    
    for (const tool of currentTools) {
      currentMap.set(tool.namespacedName, tool);
    }

    // Check for added and updated tools
    for (const [namespacedName, currentTool] of currentMap) {
      const previousTool = previousMap.get(namespacedName);
      
      if (!previousTool) {
        // Tool added
        changes.push({
          tool: currentTool,
          changeType: "added",
          currentHash: currentTool.structureHash,
        });
      } else {
        // Check if tool updated
        if (previousTool.structureHash !== currentTool.structureHash) {
          const changedFields = this.getChangedFields(previousTool, currentTool);
          changes.push({
            tool: currentTool,
            changeType: "updated",
            previousHash: previousTool.structureHash,
            currentHash: currentTool.structureHash,
            changedFields,
          });
        } else {
          changes.push({
            tool: currentTool,
            changeType: "unchanged",
            currentHash: currentTool.structureHash,
          });
        }
      }
    }

    // Check for removed tools
    for (const [namespacedName, previousTool] of previousMap) {
      if (!currentMap.has(namespacedName)) {
        changes.push({
          tool: previousTool,
          changeType: "removed",
          previousHash: previousTool.structureHash,
        });
      }
    }

    return changes;
  }

  /**
   * Create tool with hashes from MCP tool definition
   */
  static createHashedTool(
    toolDef: MCPToolDefinition,
    serverName: string,
    namespacedName: string
  ): DiscoveredTool {
    const now = new Date();
    
    // Create base tool object without hashes
    const baseTool: Omit<DiscoveredTool, 'structureHash' | 'fullHash'> = {
      name: toolDef.name,
      serverName,
      namespacedName,
      schema: toolDef.inputSchema,
      description: toolDef.description,
      discoveredAt: now,
      lastUpdated: now,
      serverStatus: "connected",
    };

    // Calculate hashes
    const structureHash = this.calculateStructureHash(toolDef, serverName);
    const fullHash = this.calculateFullHash({
      ...baseTool,
      structureHash,
      fullHash: "", // Temporary value
    });

    return {
      ...baseTool,
      structureHash,
      fullHash,
    };
  }

  /**
   * Update tool hashes after modification
   */
  static updateToolHashes(tool: DiscoveredTool): DiscoveredTool {
    const updatedTool = {
      ...tool,
      lastUpdated: new Date(),
    };

    return {
      ...updatedTool,
      structureHash: this.calculateStructureHash(updatedTool),
      fullHash: this.calculateFullHash(updatedTool),
    };
  }

  /**
   * Validate tool hash integrity
   */
  static validateToolHashes(tool: DiscoveredTool): {
    structureValid: boolean;
    fullHashValid: boolean;
    expectedStructureHash?: string;
    expectedFullHash?: string;
  } {
    const expectedStructureHash = this.calculateStructureHash(tool);
    const expectedFullHash = this.calculateFullHash(tool);

    return {
      structureValid: tool.structureHash === expectedStructureHash,
      fullHashValid: tool.fullHash === expectedFullHash,
      expectedStructureHash,
      expectedFullHash,
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
    const serialized = JSON.stringify(obj, Object.keys(obj).sort());
    hash.update(serialized);
    return hash.digest("hex");
  }

  /**
   * Get fields that changed between two tools
   */
  private static getChangedFields(previous: DiscoveredTool, current: DiscoveredTool): string[] {
    const changedFields: string[] = [];

    // Compare structure fields
    if (previous.name !== current.name) {
      changedFields.push("name");
    }
    
    if (previous.description !== current.description) {
      changedFields.push("description");
    }
    
    if (JSON.stringify(previous.schema) !== JSON.stringify(current.schema)) {
      changedFields.push("schema");
    }
    
    if (previous.serverName !== current.serverName) {
      changedFields.push("serverName");
    }

    return changedFields;
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
    history.push(tool.structureHash);
    
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
    return lastHash !== tool.structureHash;
  }

  /**
   * Get tools that have changed
   */
  getChangedTools(tools: DiscoveredTool[]): DiscoveredTool[] {
    return tools.filter(tool => this.hasChanged(tool));
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
      averageHistorySize: this.hashHistory.size > 0 
        ? Array.from(this.hashHistory.values()).reduce((sum, hist) => sum + hist.length, 0) / this.hashHistory.size
        : 0,
      maxHistorySize: this.maxHistorySize,
    };
  }
}