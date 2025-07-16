/**
 * Test ToolsetManager integration with DiscoveryEngine toolsChanged events
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ToolsetManager } from "./manager.js";
import { ToolsetConfig, ToolsetChangeEvent } from "./types.js";
import { DiscoveredTool, IToolDiscoveryEngine, DiscoveredToolsChangedEvent } from "../discovery/types.js";
import { EventEmitter } from "events";

// Mock discovery engine that can emit toolsChanged events
class MockDiscoveryEngine extends EventEmitter implements IToolDiscoveryEngine {
  private tools: DiscoveredTool[] = [];

  setTools(tools: DiscoveredTool[]) {
    this.tools = tools;
  }

  // Required interface methods (minimal implementation for testing)
  async initialize() {}
  async start() {}
  async stop() {}
  async outputToolServerStatus(): Promise<void> {}
  async discoverTools(): Promise<DiscoveredTool[]> { return this.tools; }
  async getToolByName(name: string): Promise<DiscoveredTool | null> {
    return this.tools.find(t => t.name === name || t.namespacedName === name) || null;
  }
  async searchTools(): Promise<DiscoveredTool[]> { return this.tools; }
  getAvailableTools(): DiscoveredTool[] { return this.tools; }
  resolveToolReference(ref: { namespacedName?: string; refId?: string }, options?: { allowStaleRefs?: boolean }) {
    const tool = this.tools.find(t => 
      t.namespacedName === ref.namespacedName || t.toolHash === ref.refId
    );
    
    return {
      exists: !!tool,
      tool,
      serverName: tool?.serverName,
      serverStatus: undefined,
      namespacedNameMatch: !!tool && tool.namespacedName === ref.namespacedName,
      refIdMatch: !!tool && tool.toolHash === ref.refId,
      warnings: [],
      errors: []
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
      toolsByServer: {},
    };
  }
  getServerStates() {
    return [];
  }
  
  // Helper method to simulate toolsChanged events
  simulateToolsChanged(event: DiscoveredToolsChangedEvent) {
    this.emit('toolsChanged', event);
  }
}

describe("ToolsetManager Discovery Integration", () => {
  let toolsetManager: ToolsetManager;
  let mockDiscovery: MockDiscoveryEngine;
  
  // Sample tool for testing
  const sampleTool: DiscoveredTool = {
    name: "status",
    serverName: "git",
    namespacedName: "git.status",
    tool: {
      name: "status",
      description: "Git status tool",
      inputSchema: { type: "object" } as const,
    },
    discoveredAt: new Date(),
    lastUpdated: new Date(),
    serverStatus: "connected",
    toolHash: "abcd1234567890abcdef1234567890abcdef12",
  };

  beforeEach(() => {
    toolsetManager = new ToolsetManager();
    mockDiscovery = new MockDiscoveryEngine();
    mockDiscovery.setTools([sampleTool]);
    
    // Connect the toolset manager to the discovery engine
    toolsetManager.setDiscoveryEngine(mockDiscovery);
  });

  it("should emit toolsetChanged when active toolset tools are affected by discovery changes", async () => {
    // Set up an active toolset that includes the sample tool
    const toolsetConfig: ToolsetConfig = {
      name: "test-toolset",
      description: "Test toolset",
      version: "1.0.0",
      createdAt: new Date(),
      tools: [
        { namespacedName: "git.status", refId: "abcd1234567890abcdef1234567890abcdef12" }
      ],
    };

    toolsetManager.setCurrentToolset(toolsetConfig);

    // Listen for toolset change events
    const toolsetChangedPromise = new Promise<void>((resolve) => {
      toolsetManager.on('toolsetChanged', (event: ToolsetChangeEvent) => {
        expect(event.changeType).toBe('updated');
        expect(event.newToolset).toBe(toolsetConfig);
        expect(event.previousToolset).toBe(toolsetConfig);
        resolve();
      });
    });

    // Simulate discovery change affecting our tool
    const discoveryEvent: DiscoveredToolsChangedEvent = {
      serverName: "git",
      changes: [
        {
          tool: sampleTool,
          changeType: "updated",
          previousHash: "oldHash123456789012345678901234567890",
          currentHash: "abcd1234567890abcdef1234567890abcdef12",
        }
      ],
      summary: {
        added: 0,
        updated: 1,
        removed: 0,
        unchanged: 0,
        total: 1,
      },
      newTools: [sampleTool],
      timestamp: new Date(),
    };

    mockDiscovery.simulateToolsChanged(discoveryEvent);
    
    // Wait for the event to be handled
    await toolsetChangedPromise;
  });

  it("should emit toolsetChanged when active toolset tools are removed", async () => {
    // Set up an active toolset
    const toolsetConfig: ToolsetConfig = {
      name: "test-toolset",
      description: "Test toolset",
      version: "1.0.0",
      createdAt: new Date(),
      tools: [
        { namespacedName: "git.status", refId: "abcd1234567890abcdef1234567890abcdef12" }
      ],
    };

    toolsetManager.setCurrentToolset(toolsetConfig);

    // Listen for toolset change events
    const toolsetChangedPromise = new Promise<void>((resolve) => {
      toolsetManager.on('toolsetChanged', (event: ToolsetChangeEvent) => {
        expect(event.changeType).toBe('updated');
        resolve();
      });
    });

    // Simulate tool removal
    const discoveryEvent: DiscoveredToolsChangedEvent = {
      serverName: "git",
      changes: [
        {
          tool: sampleTool,
          changeType: "removed",
          previousHash: "abcd1234567890abcdef1234567890abcdef12",
        }
      ],
      summary: {
        added: 0,
        updated: 0,
        removed: 1,
        unchanged: 0,
        total: 1,
      },
      newTools: [],
      timestamp: new Date(),
    };

    mockDiscovery.simulateToolsChanged(discoveryEvent);
    
    // Wait for the event to be handled
    await toolsetChangedPromise;
  });

  it("should NOT emit toolsetChanged when unrelated tools change", async () => {
    // Set up an active toolset with a different tool
    const toolsetConfig: ToolsetConfig = {
      name: "test-toolset",
      description: "Test toolset",
      version: "1.0.0",
      createdAt: new Date(),
      tools: [
        { namespacedName: "docker.ps", refId: "dockerHashABCD1234567890" }
      ],
    };

    toolsetManager.setCurrentToolset(toolsetConfig);

    // Listen for toolset change events (should not be called)
    let eventEmitted = false;
    toolsetManager.on('toolsetChanged', () => {
      eventEmitted = true;
    });

    // Simulate discovery change for unrelated tool
    const discoveryEvent: DiscoveredToolsChangedEvent = {
      serverName: "git", // Different server
      changes: [
        {
          tool: sampleTool,
          changeType: "updated",
          previousHash: "oldHash123456789012345678901234567890",
          currentHash: "abcd1234567890abcdef1234567890abcdef12",
        }
      ],
      summary: {
        added: 0,
        updated: 1,
        removed: 0,
        unchanged: 0,
        total: 1,
      },
      newTools: [sampleTool],
      timestamp: new Date(),
    };

    mockDiscovery.simulateToolsChanged(discoveryEvent);

    // Wait a short time to ensure no event is emitted
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Verify no event was emitted
    expect(eventEmitted).toBe(false);
  });

  it("should NOT emit toolsetChanged when no toolset is active", async () => {
    // Don't set any active toolset

    // Listen for toolset change events (should not be called)
    const toolsetHandler = vi.fn();
    toolsetManager.on('toolsetChanged', toolsetHandler);

    // Simulate discovery changes
    const discoveryEvent: DiscoveredToolsChangedEvent = {
      serverName: "git",
      changes: [
        {
          tool: sampleTool,
          changeType: "added",
          currentHash: "abcd1234567890abcdef1234567890abcdef12",
        }
      ],
      summary: {
        added: 1,
        updated: 0,
        removed: 0,
        unchanged: 0,
        total: 1,
      },
      newTools: [sampleTool],
      timestamp: new Date(),
    };

    mockDiscovery.simulateToolsChanged(discoveryEvent);

    // Wait a short time to ensure no event is emitted
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Verify no event was emitted
    expect(toolsetHandler).not.toHaveBeenCalled();
  });
});