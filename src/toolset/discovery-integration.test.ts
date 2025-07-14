/**
 * Test ToolsetManager integration with DiscoveryEngine toolsChanged events
 */

import { ToolsetManager } from "./index";
import { ToolsetConfig, ToolsetChangeEvent } from "./types";
import { DiscoveredTool, IToolDiscoveryEngine, DiscoveredToolsChangedEvent } from "../discovery/types";
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
  getServerStates() { return []; }

  // Method to simulate toolsChanged event
  simulateToolsChanged(event: DiscoveredToolsChangedEvent) {
    this.emit('toolsChanged', event);
  }
}

describe("ToolsetManager Discovery Integration", () => {
  let toolsetManager: ToolsetManager;
  let mockDiscovery: MockDiscoveryEngine;

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

  it("should emit toolsetChanged when active toolset tools are affected by discovery changes", (done) => {
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

    toolsetManager.setConfig(toolsetConfig);

    // Listen for toolset change events
    toolsetManager.on('toolsetChanged', (event: ToolsetChangeEvent) => {
      expect(event.changeType).toBe('updated');
      expect(event.newToolset).toBe(toolsetConfig);
      expect(event.previousToolset).toBe(toolsetConfig);
      done();
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
  });

  it("should emit toolsetChanged when active toolset tools are removed", (done) => {
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

    toolsetManager.setConfig(toolsetConfig);

    // Listen for toolset change events
    toolsetManager.on('toolsetChanged', (event: ToolsetChangeEvent) => {
      expect(event.changeType).toBe('updated');
      done();
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
  });

  it("should NOT emit toolsetChanged when unrelated tools change", (done) => {
    // Set up an active toolset that doesn't include the changing tool
    const toolsetConfig: ToolsetConfig = {
      name: "test-toolset",
      description: "Test toolset",
      version: "1.0.0",
      createdAt: new Date(),
      tools: [
        { namespacedName: "docker.ps", refId: "different-hash" }
      ],
    };

    toolsetManager.setConfig(toolsetConfig);

    // Listen for toolset change events (should not be called)
    toolsetManager.on('toolsetChanged', () => {
      done(new Error('Should not emit toolsetChanged for unrelated tool changes'));
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

    // Complete the test after a short delay
    setTimeout(() => done(), 100);
  });

  it("should NOT emit toolsetChanged when no toolset is active", (done) => {
    // Don't set any active toolset

    // Listen for toolset change events (should not be called)
    toolsetManager.on('toolsetChanged', () => {
      done(new Error('Should not emit toolsetChanged when no toolset is active'));
    });

    // Simulate discovery change
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

    // Complete the test after a short delay
    setTimeout(() => done(), 100);
  });
});