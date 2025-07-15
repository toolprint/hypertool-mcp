/**
 * Tests for ToolsetManager with simplified structure
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from "fs";
import path from "path";
import os from "os";
import { ToolsetManager } from "./index.js";
import { ToolsetConfig } from "./types.js";
import { DiscoveredTool, IToolDiscoveryEngine } from "../discovery/types.js";

// Mock discovery engine
class MockDiscoveryEngine implements IToolDiscoveryEngine {
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
    return this.tools.find(t => t.name === name || t.namespacedName === name) || null;
  }

  async searchTools(): Promise<DiscoveredTool[]> {
    return this.tools;
  }

  getAvailableTools(): DiscoveredTool[] {
    return this.tools;
  }

  resolveToolReference(ref: { namespacedName?: string; refId?: string }, options?: { allowStaleRefs?: boolean }) {
    const tool = this.tools.find(t => 
      t.namespacedName === ref.namespacedName || t.toolHash === ref.refId
    );
    
    const exists = !!tool;
    const namespacedNameMatch = !!tool && tool.namespacedName === ref.namespacedName;
    const refIdMatch = !!tool && tool.toolHash === ref.refId;
    
    const warnings: string[] = [];
    const errors: string[] = [];
    
    // Check for mismatches when both identifiers are provided
    if (exists && ref.namespacedName && ref.refId) {
      if (!namespacedNameMatch && !refIdMatch) {
        errors.push(`Tool reference mismatch: neither namespacedName nor refId match`);
      } else if (!namespacedNameMatch || !refIdMatch) {
        const msg = `Tool reference partial mismatch: ${!namespacedNameMatch ? 'namespacedName' : 'refId'} doesn't match`;
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
      errors
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
}

describe("ToolsetManager", () => {
  let manager: ToolsetManager;
  let tempDir: string;
  let mockDiscovery: MockDiscoveryEngine;

  const mockTools: DiscoveredTool[] = [
    {
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
      toolHash: "hash1",
    },
    {
      name: "ps",
      serverName: "docker",
      namespacedName: "docker.ps",
      tool: {
        name: "ps",
        description: "Docker ps tool",
        inputSchema: { type: "object" } as const,
      },
      discoveredAt: new Date(),
      lastUpdated: new Date(),
      serverStatus: "connected",
      toolHash: "hash2",
    },
  ];

  beforeEach(async () => {
    manager = new ToolsetManager();
    mockDiscovery = new MockDiscoveryEngine();
    mockDiscovery.setTools(mockTools);
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "toolset-manager-test-"));
  });

  afterEach(async () => {
    await fs.rmdir(tempDir, { recursive: true }).catch(() => {
      // Ignore cleanup errors
    });
  });

  describe("loadConfig", () => {
    it("should load valid configuration", async () => {
      const config: ToolsetConfig = {
        name: "test-config",
        description: "Test configuration",
        version: "1.0.0",
        createdAt: new Date(),
        tools: [
          { namespacedName: "git.status", refId: "full1234567890" }
        ],
      };

      const filePath = path.join(tempDir, "config.json");
      await fs.writeFile(filePath, JSON.stringify(config));

      const result = await manager.loadToolsetFromConfig(filePath);

      expect(result.success).toBe(true);
      expect(manager.getCurrentToolset()).toBeDefined();
      expect(manager.getCurrentToolset()?.name).toBe("test-config");
      expect(manager.getConfigPath()).toBe(filePath);
    });

    it("should reject invalid configuration", async () => {
      const invalidConfig = {
        name: "INVALID NAME", // Invalid characters
        tools: [{ namespacedName: "git.status" }],
      };
      const filePath = path.join(tempDir, "invalid.json");
      await fs.writeFile(filePath, JSON.stringify(invalidConfig));

      const result = await manager.loadToolsetFromConfig(filePath);

      expect(result.success).toBe(false);
      expect(manager.getCurrentToolset()).toBeUndefined();
      expect(result.validation.valid).toBe(false);
      expect(result.validation.errors).toContain("Configuration name must contain only lowercase letters, numbers, and hyphens");
    });

    it("should handle file read errors", async () => {
      const result = await manager.loadToolsetFromConfig("/nonexistent/path.json");

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe("saveConfig", () => {
    it("should save loaded configuration", async () => {
      const config: ToolsetConfig = {
        name: "test-config",
        tools: [
          { namespacedName: "git.status", refId: "full1234567890" }
        ],
        version: "1.0.0",
        createdAt: new Date(),
      };

      manager.setCurrentToolset(config);

      const filePath = path.join(tempDir, "saved.json");
      const result = await manager.persistToolset(filePath);

      expect(result.success).toBe(true);
      expect(manager.getConfigPath()).toBe(filePath);

      // Verify file was created
      const fileExists = await fs
        .access(filePath)
        .then(() => true)
        .catch(() => false);
      expect(fileExists).toBe(true);
    });

    it("should save to previously loaded path", async () => {
      const config: ToolsetConfig = {
        name: "test-config",
        tools: [
          { namespacedName: "git.status", refId: "full1234567890" }
        ],
        version: "1.0.0",
        createdAt: new Date(),
      };

      const filePath = path.join(tempDir, "config.json");
      await fs.writeFile(filePath, JSON.stringify(config));
      await manager.loadToolsetFromConfig(filePath);

      // Modify config
      const modifiedConfig = manager.getCurrentToolset()!;
      modifiedConfig.description = "Modified description";
      manager.setCurrentToolset(modifiedConfig);

      // Save without specifying path
      const result = await manager.persistToolset();

      expect(result.success).toBe(true);

      // Reload and verify
      const reloadResult = await manager.loadToolsetFromConfig(filePath);
      expect(reloadResult.success).toBe(true);
      expect(manager.getCurrentToolset()?.description).toBe("Modified description");
    });

    it("should require path if no previous path", async () => {
      const config: ToolsetConfig = {
        name: "test-config",
        tools: [{ namespacedName: "git.status" }],
        version: "1.0.0",
        createdAt: new Date(),
      };

      manager.setCurrentToolset(config);

      const result = await manager.persistToolset();

      expect(result.success).toBe(false);
      expect(result.error).toContain("No file path specified");
    });
  });

  describe("generateDefaultConfig", () => {
    it("should generate empty configuration", () => {
      const config = manager.generateDefaultConfig(mockTools);

      expect(config.name).toBe("empty-toolset");
      expect(config.tools).toHaveLength(0); // Empty by design
      expect(config.description).toContain("Empty toolset");
      expect(config.version).toBe("1.0.0");
    });

    it("should accept custom options", () => {
      const config = manager.generateDefaultConfig(mockTools, {
        name: "custom-name",
        description: "Custom description",
      });

      expect(config.name).toBe("custom-name");
      expect(config.description).toBe("Custom description");
      expect(config.tools).toHaveLength(0); // Still empty - users must select explicitly
    });
  });

  // Note: applyConfig method and tests removed since we eliminated ResolvedTool
  // The toolset system now works directly with DiscoveredTool objects

  describe("config validation", () => {
    it("should validate configuration on set", () => {
      const invalidConfig: ToolsetConfig = {
        name: "", // Empty name
        tools: [],
        version: "1.0.0",
        createdAt: new Date(),
      };

      const result = manager.setCurrentToolset(invalidConfig);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Configuration must have a valid name");
      expect(manager.getCurrentToolset()).toBeUndefined();
    });

    it("should validate current configuration", () => {
      const config: ToolsetConfig = {
        name: "test-config",
        tools: [
          { namespacedName: "git.status" }
        ],
        version: "1.0.0",
        createdAt: new Date(),
      };

      manager.setCurrentToolset(config);

      const result = manager.isCurrentToolsetValid();

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should validate when no config loaded", () => {
      const result = manager.isCurrentToolsetValid();

      expect(result.valid).toBe(false);
      expect(result.errors).toContain("No configuration loaded");
    });
  });

  describe("config management", () => {
    it("should clear configuration", () => {
      const config: ToolsetConfig = {
        name: "test-config",
        tools: [{ namespacedName: "git.status" }],
        version: "1.0.0",
        createdAt: new Date(),
      };

      manager.setCurrentToolset(config);
      expect(manager.getCurrentToolset()).toBeDefined();

      manager.clearCurrentToolset();
      expect(manager.getCurrentToolset()).toBeUndefined();
      expect(manager.getConfigPath()).toBeUndefined();
    });

    it("should track config file path", async () => {
      const config: ToolsetConfig = {
        name: "test-config",
        tools: [{ namespacedName: "git.status" }],
        version: "1.0.0",
        createdAt: new Date(),
      };

      const filePath = path.join(tempDir, "config.json");
      await fs.writeFile(filePath, JSON.stringify(config));
      
      await manager.loadToolsetFromConfig(filePath);
      expect(manager.getConfigPath()).toBe(filePath);

      // Path should persist after save
      const newPath = path.join(tempDir, "new-config.json");
      await manager.persistToolset(newPath);
      expect(manager.getConfigPath()).toBe(newPath);
    });
  });
});