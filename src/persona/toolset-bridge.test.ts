/**
 * Tests for PersonaToolsetBridge
 *
 * This test file validates the persona-toolset bridge functionality,
 * ensuring proper conversion from PersonaToolset to ToolsetConfig format.
 *
 * @fileoverview Tests for persona toolset bridge implementation
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  PersonaToolsetBridge,
  createPersonaToolsetBridge,
  convertPersonaToolset,
} from "./toolset-bridge.js";
import type { PersonaToolset } from "./types.js";
import type { IToolDiscoveryEngine } from "../discovery/types.js";

describe("PersonaToolsetBridge", () => {
  let bridge: PersonaToolsetBridge;
  let mockDiscoveryEngine: IToolDiscoveryEngine;

  const samplePersonaToolset: PersonaToolset = {
    name: "dev-essentials",
    toolIds: ["git.status", "git.log", "docker.ps", "npm.install"],
  };

  beforeEach(() => {
    // Create mock discovery engine
    mockDiscoveryEngine = {
      resolveToolReference: vi.fn(),
      getStats: vi.fn().mockReturnValue({
        totalTools: 10,
        connectedServers: 2,
      }),
    } as any;

    bridge = new PersonaToolsetBridge(mockDiscoveryEngine);
  });

  describe("convertPersonaToolset", () => {
    it("should convert PersonaToolset to ToolsetConfig format", async () => {
      // Setup mock to resolve all tools successfully
      vi.mocked(mockDiscoveryEngine.resolveToolReference).mockReturnValue({
        exists: true,
        tool: { namespacedName: "git.status" },
        namespacedNameMatch: true,
        refIdMatch: false,
        warnings: [],
        errors: [],
      } as any);

      const result = await bridge.convertPersonaToolset(
        samplePersonaToolset,
        "test-persona"
      );

      expect(result.success).toBe(true);
      expect(result.toolsetConfig).toBeDefined();
      expect(result.toolsetConfig!.name).toBe(
        "persona-test-persona-dev-essentials"
      );
      expect(result.toolsetConfig!.tools).toHaveLength(4);
      expect(result.toolsetConfig!.tools[0].namespacedName).toBe("git.status");
      expect(result.toolsetConfig!.version).toBe("1.0.0");
      expect(result.toolsetConfig!.createdAt).toBeInstanceOf(Date);
    });

    it("should generate proper toolset name and description", async () => {
      vi.mocked(mockDiscoveryEngine.resolveToolReference).mockReturnValue({
        exists: true,
        tool: { namespacedName: "git.status" },
        namespacedNameMatch: true,
        refIdMatch: false,
        warnings: [],
        errors: [],
      } as any);

      const result = await bridge.convertPersonaToolset(
        samplePersonaToolset,
        "my-awesome-persona"
      );

      expect(result.success).toBe(true);
      expect(result.toolsetConfig!.name).toBe(
        "persona-my-awesome-persona-dev-essentials"
      );
      expect(result.toolsetConfig!.description).toContain(
        'Toolset "dev-essentials" from persona "my-awesome-persona"'
      );
      expect(result.toolsetConfig!.description).toContain("Contains 4 tools");
    });

    it("should handle tool resolution failures with allowPartialToolsets enabled", async () => {
      // Setup mock to fail some tools
      vi.mocked(mockDiscoveryEngine.resolveToolReference)
        .mockReturnValueOnce({
          exists: true,
          tool: { namespacedName: "git.status" },
          namespacedNameMatch: true,
          refIdMatch: false,
          warnings: [],
          errors: [],
        } as any)
        .mockReturnValueOnce({
          exists: false,
          namespacedNameMatch: false,
          refIdMatch: false,
          warnings: [],
          errors: ["Tool not found"],
        } as any)
        .mockReturnValueOnce({
          exists: true,
          tool: { namespacedName: "docker.ps" },
          namespacedNameMatch: true,
          refIdMatch: false,
          warnings: [],
          errors: [],
        } as any)
        .mockReturnValueOnce({
          exists: false,
          namespacedNameMatch: false,
          refIdMatch: false,
          warnings: [],
          errors: ["Tool not found"],
        } as any);

      const bridgeWithPartial = new PersonaToolsetBridge(mockDiscoveryEngine, {
        allowPartialToolsets: true,
      });

      const result = await bridgeWithPartial.convertPersonaToolset(
        samplePersonaToolset,
        "test-persona"
      );

      expect(result.success).toBe(true);
      expect(result.toolsetConfig!.tools).toHaveLength(2); // Only successful ones
      expect(result.warnings).toBeDefined();
      expect(result.warnings![0]).toContain("tools could not be resolved");
      expect(result.stats!.resolvedTools).toBe(2);
      expect(result.stats!.failedTools).toBe(2);
    });

    it("should fail when tool resolution fails and allowPartialToolsets is disabled", async () => {
      // Setup mock to fail some tools
      vi.mocked(mockDiscoveryEngine.resolveToolReference)
        .mockReturnValueOnce({
          exists: true,
          tool: { namespacedName: "git.status" },
          namespacedNameMatch: true,
          refIdMatch: false,
          warnings: [],
          errors: [],
        } as any)
        .mockReturnValueOnce({
          exists: false,
          namespacedNameMatch: false,
          refIdMatch: false,
          warnings: [],
          errors: ["Tool not found"],
        } as any);

      const strictBridge = new PersonaToolsetBridge(mockDiscoveryEngine, {
        allowPartialToolsets: false,
      });

      const result = await strictBridge.convertPersonaToolset(
        samplePersonaToolset,
        "test-persona"
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("Failed to resolve");
      expect(result.error).toContain("git.log");
    });

    it("should handle empty tool list", async () => {
      const emptyToolset: PersonaToolset = {
        name: "empty-toolset",
        toolIds: [],
      };

      const result = await bridge.convertPersonaToolset(
        emptyToolset,
        "test-persona"
      );

      expect(result.success).toBe(true);
      expect(result.toolsetConfig!.tools).toHaveLength(0);
    });

    it("should work without discovery engine", async () => {
      const bridgeWithoutEngine = new PersonaToolsetBridge(undefined, {
        validateTools: false,
      });

      const result = await bridgeWithoutEngine.convertPersonaToolset(
        samplePersonaToolset,
        "test-persona"
      );

      expect(result.success).toBe(true);
      expect(result.toolsetConfig!.tools).toHaveLength(4);
      expect(result.stats!.totalTools).toBe(4);
    });
  });

  describe("convertMultiplePersonaToolsets", () => {
    it("should convert multiple toolsets", async () => {
      const toolsets: PersonaToolset[] = [
        { name: "toolset1", toolIds: ["git.status"] },
        { name: "toolset2", toolIds: ["docker.ps"] },
      ];

      vi.mocked(mockDiscoveryEngine.resolveToolReference).mockReturnValue({
        exists: true,
        tool: { namespacedName: "git.status" },
        namespacedNameMatch: true,
        refIdMatch: false,
        warnings: [],
        errors: [],
      } as any);

      const result = await bridge.convertMultiplePersonaToolsets(
        toolsets,
        "test-persona"
      );

      expect(result.success).toBe(true);
      expect(result.toolsetConfigs).toHaveLength(2);
      expect(result.errors).toHaveLength(0);
      expect(result.toolsetConfigs[0].name).toBe(
        "persona-test-persona-toolset1"
      );
      expect(result.toolsetConfigs[1].name).toBe(
        "persona-test-persona-toolset2"
      );
    });

    it("should handle mixed success and failure", async () => {
      const toolsets: PersonaToolset[] = [
        { name: "good-toolset", toolIds: ["git.status"] },
        { name: "bad-toolset", toolIds: ["nonexistent.tool"] },
      ];

      vi.mocked(mockDiscoveryEngine.resolveToolReference)
        .mockReturnValueOnce({
          exists: true,
          tool: { namespacedName: "git.status" },
          namespacedNameMatch: true,
          refIdMatch: false,
          warnings: [],
          errors: [],
        } as any)
        .mockReturnValueOnce({
          exists: false,
          namespacedNameMatch: false,
          refIdMatch: false,
          warnings: [],
          errors: ["Tool not found"],
        } as any);

      const result = await bridge.convertMultiplePersonaToolsets(
        toolsets,
        "test-persona"
      );

      expect(result.success).toBe(false);
      expect(result.toolsetConfigs).toHaveLength(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].toolsetName).toBe("bad-toolset");
    });
  });

  describe("utility functions", () => {
    it("should return configuration information", () => {
      const config = bridge.getConfiguration();

      expect(config.hasDiscoveryEngine).toBe(true);
      expect(config.options.validateTools).toBe(true);
      expect(config.options.namePrefix).toBe("persona");
      expect(config.version).toBe("1.0.0");
    });

    it("should test tool resolution capabilities", async () => {
      const testResult = await bridge.testToolResolution();

      expect(testResult.discoveryEngineAvailable).toBe(true);
      expect(testResult.totalTools).toBe(10);
      expect(testResult.connectedServers).toBe(2);
    });
  });

  describe("factory functions", () => {
    it("should create bridge using factory function", () => {
      const createdBridge = createPersonaToolsetBridge(mockDiscoveryEngine, {
        namePrefix: "custom",
      });

      expect(createdBridge).toBeInstanceOf(PersonaToolsetBridge);
      expect(createdBridge.getConfiguration().options.namePrefix).toBe(
        "custom"
      );
    });

    it("should convert single toolset using utility function", async () => {
      vi.mocked(mockDiscoveryEngine.resolveToolReference).mockReturnValue({
        exists: true,
        tool: { namespacedName: "git.status" },
        namespacedNameMatch: true,
        refIdMatch: false,
        warnings: [],
        errors: [],
      } as any);

      const result = await convertPersonaToolset(
        samplePersonaToolset,
        "test-persona",
        mockDiscoveryEngine
      );

      expect(result.success).toBe(true);
      expect(result.toolsetConfig!.name).toBe(
        "persona-test-persona-dev-essentials"
      );
    });
  });

  describe("edge cases", () => {
    it("should handle invalid characters in persona/toolset names", async () => {
      vi.mocked(mockDiscoveryEngine.resolveToolReference).mockReturnValue({
        exists: true,
        tool: { namespacedName: "git.status" },
        namespacedNameMatch: true,
        refIdMatch: false,
        warnings: [],
        errors: [],
      } as any);

      const result = await bridge.convertPersonaToolset(
        { name: "My@Awesome#Toolset!", toolIds: ["git.status"] },
        "My Persona Name"
      );

      expect(result.success).toBe(true);
      expect(result.toolsetConfig!.name).toBe(
        "persona-my-persona-name-my-awesome-toolset-"
      );
    });

    it("should handle discovery engine throwing errors", async () => {
      vi.mocked(mockDiscoveryEngine.resolveToolReference).mockImplementation(
        () => {
          throw new Error("Discovery engine error");
        }
      );

      const result = await bridge.convertPersonaToolset(
        samplePersonaToolset,
        "test-persona"
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("Failed to resolve");
    });
  });
});
