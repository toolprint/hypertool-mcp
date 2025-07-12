/**
 * Tests for ToolsetManager with simplified structure
 */

import { promises as fs } from "fs";
import path from "path";
import os from "os";
import { ToolsetManager } from "./index";
import { ToolsetConfig } from "./types";
import { DiscoveredTool, IToolDiscoveryEngine } from "../discovery/types";

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
      t.namespacedName === ref.namespacedName || t.fullHash === ref.refId
    );
    
    const exists = !!tool;
    const namespacedNameMatch = !!tool && tool.namespacedName === ref.namespacedName;
    const refIdMatch = !!tool && tool.fullHash === ref.refId;
    
    const warnings: string[] = [];
    const errors: string[] = [];
    
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
    
    return {
      exists,
      tool,
      serverName: tool?.serverName,
      serverStatus: undefined,
      namespacedNameMatch,
      refIdMatch,
      warnings,
      errors: options?.allowStaleRefs ? [] : errors
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
      schema: { type: "object" } as const,
      discoveredAt: new Date(),
      lastUpdated: new Date(),
      serverStatus: "connected",
      structureHash: "hash1",
      fullHash: "full1",
    },
    {
      name: "ps",
      serverName: "docker",
      namespacedName: "docker.ps",
      schema: { type: "object" } as const,
      discoveredAt: new Date(),
      lastUpdated: new Date(),
      serverStatus: "connected",
      structureHash: "hash2",
      fullHash: "full2",
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
          { namespacedName: "git.status", refId: "full1" }
        ],
      };

      const filePath = path.join(tempDir, "config.json");
      await fs.writeFile(filePath, JSON.stringify(config));

      const result = await manager.loadConfig(filePath);

      expect(result.success).toBe(true);
      expect(manager.isConfigLoaded()).toBe(true);
      expect(manager.getConfig()?.name).toBe("test-config");
      expect(manager.getConfigPath()).toBe(filePath);
    });

    it("should reject invalid configuration", async () => {
      const invalidConfig = {
        name: "INVALID NAME", // Invalid characters
        tools: [{ namespacedName: "git.status" }],
      };
      const filePath = path.join(tempDir, "invalid.json");
      await fs.writeFile(filePath, JSON.stringify(invalidConfig));

      const result = await manager.loadConfig(filePath);

      expect(result.success).toBe(false);
      expect(manager.isConfigLoaded()).toBe(false);
      expect(result.validation.valid).toBe(false);
      expect(result.validation.errors).toContain("Configuration name must contain only lowercase letters, numbers, and hyphens");
    });

    it("should handle file read errors", async () => {
      const result = await manager.loadConfig("/nonexistent/path.json");

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe("saveConfig", () => {
    it("should save loaded configuration", async () => {
      const config: ToolsetConfig = {
        name: "test-config",
        tools: [
          { namespacedName: "git.status", refId: "full1" }
        ],
        version: "1.0.0",
        createdAt: new Date(),
      };

      manager.setConfig(config);

      const filePath = path.join(tempDir, "saved.json");
      const result = await manager.saveConfig(filePath);

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
          { namespacedName: "git.status", refId: "full1" }
        ],
        version: "1.0.0",
        createdAt: new Date(),
      };

      const filePath = path.join(tempDir, "config.json");
      await fs.writeFile(filePath, JSON.stringify(config));
      await manager.loadConfig(filePath);

      // Modify config
      const modifiedConfig = manager.getConfig()!;
      modifiedConfig.description = "Modified description";
      manager.setConfig(modifiedConfig);

      // Save without specifying path
      const result = await manager.saveConfig();

      expect(result.success).toBe(true);

      // Reload and verify
      const reloadResult = await manager.loadConfig(filePath);
      expect(reloadResult.success).toBe(true);
      expect(manager.getConfig()?.description).toBe("Modified description");
    });

    it("should require path if no previous path", async () => {
      const config: ToolsetConfig = {
        name: "test-config",
        tools: [{ namespacedName: "git.status" }],
        version: "1.0.0",
        createdAt: new Date(),
      };

      manager.setConfig(config);

      const result = await manager.saveConfig();

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

  describe("applyConfig", () => {
    it("should apply configuration with discovery engine", async () => {
      const config: ToolsetConfig = {
        name: "test-config",
        tools: [
          { namespacedName: "git.status", refId: "full1" }
        ],
        version: "1.0.0",
        createdAt: new Date(),
      };

      manager.setConfig(config);

      const result = await manager.applyConfig(mockTools, mockDiscovery);

      expect(result.success).toBe(true);
      expect(result.tools).toHaveLength(1);
      expect(result.tools[0].originalName).toBe("status");
      expect(result.tools[0].serverName).toBe("git");
      expect(result.stats?.totalIncluded).toBe(1);
    });

    it("should handle tool reference mismatches securely", async () => {
      const config: ToolsetConfig = {
        name: "test-config",
        tools: [
          { namespacedName: "git.status", refId: "wrong-hash" } // Mismatch
        ],
        version: "1.0.0",
        createdAt: new Date(),
      };

      manager.setConfig(config);

      const result = await manager.applyConfig(mockTools, mockDiscovery);

      expect(result.success).toBe(true);
      expect(result.tools).toHaveLength(0); // Tool rejected due to mismatch
      expect(result.warnings.some(w => w.includes("SECURITY"))).toBe(true);
    });

    it("should apply configuration without discovery engine", async () => {
      const config: ToolsetConfig = {
        name: "test-config",
        tools: [
          { namespacedName: "docker.ps" }
        ],
        version: "1.0.0",
        createdAt: new Date(),
      };

      manager.setConfig(config);

      const result = await manager.applyConfig(mockTools);

      expect(result.success).toBe(true);
      expect(result.tools).toHaveLength(1);
      expect(result.tools[0].originalName).toBe("ps");
      expect(result.tools[0].serverName).toBe("docker");
    });

    it("should handle missing tools", async () => {
      const config: ToolsetConfig = {
        name: "test-config",
        tools: [
          { namespacedName: "nonexistent.tool" }
        ],
        version: "1.0.0",
        createdAt: new Date(),
      };

      manager.setConfig(config);

      const result = await manager.applyConfig(mockTools, mockDiscovery);

      expect(result.success).toBe(true);
      expect(result.tools).toHaveLength(0);
      expect(result.warnings).toContain("Tool not found: nonexistent.tool");
    });

    it("should require config to be loaded", async () => {
      const result = await manager.applyConfig(mockTools);

      expect(result.success).toBe(false);
      expect(result.errors).toContain("No configuration loaded");
    });
  });

  describe("config validation", () => {
    it("should validate configuration on set", () => {
      const invalidConfig: ToolsetConfig = {
        name: "", // Empty name
        tools: [],
        version: "1.0.0",
        createdAt: new Date(),
      };

      const result = manager.setConfig(invalidConfig);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Configuration name cannot be empty");
      expect(manager.isConfigLoaded()).toBe(false);
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

      manager.setConfig(config);

      const result = manager.validateConfig();

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should validate when no config loaded", () => {
      const result = manager.validateConfig();

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

      manager.setConfig(config);
      expect(manager.isConfigLoaded()).toBe(true);

      manager.clearConfig();
      expect(manager.isConfigLoaded()).toBe(false);
      expect(manager.getConfig()).toBeUndefined();
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
      
      await manager.loadConfig(filePath);
      expect(manager.getConfigPath()).toBe(filePath);

      // Path should persist after save
      const newPath = path.join(tempDir, "new-config.json");
      await manager.saveConfig(newPath);
      expect(manager.getConfigPath()).toBe(newPath);
    });
  });
});