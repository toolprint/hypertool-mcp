import { describe, it, expect, vi } from "vitest";
import { createEnterConfigurationModeModule } from "../../common/enter-configuration-mode.js";
import { createExitConfigurationModeModule } from "../../common/exit-configuration-mode.js";
import { ToolDependencies } from "../../types.js";

describe("Mode Switching Tools", () => {
  const mockDeps: ToolDependencies = {
    toolsetManager: {} as any,
    discoveryEngine: {} as any,
  };

  describe("enter-configuration-mode", () => {
    it("should create module with proper definition", () => {
      const module = createEnterConfigurationModeModule(mockDeps);
      
      expect(module.toolName).toBe("enter-configuration-mode");
      expect(module.definition.name).toBe("enter-configuration-mode");
      expect(module.definition.description).toContain("configuration mode");
      expect(module.definition.inputSchema).toBeDefined();
      expect(module.definition.outputSchema).toBeDefined();
    });

    it("should call mode change callback when handler is invoked", async () => {
      const mockCallback = vi.fn();
      const module = createEnterConfigurationModeModule(mockDeps, mockCallback);
      
      const result = await module.handler({});
      
      expect(mockCallback).toHaveBeenCalledOnce();
      expect(result.content).toBeDefined();
      expect(result.content[0].type).toBe("text");
      
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.message).toContain("Entering configuration mode");
      expect(response.availableTools).toBeInstanceOf(Array);
    });

    it("should throw error when callback is not provided", async () => {
      const module = createEnterConfigurationModeModule(mockDeps);
      
      await expect(module.handler({})).rejects.toThrow("Mode change callback not configured");
    });
  });

  describe("exit-configuration-mode", () => {
    it("should create module with proper definition", () => {
      const module = createExitConfigurationModeModule(mockDeps);
      
      expect(module.toolName).toBe("exit-configuration-mode");
      expect(module.definition.name).toBe("exit-configuration-mode");
      expect(module.definition.description).toContain("Leave configuration mode");
      expect(module.definition.inputSchema).toBeDefined();
      expect(module.definition.outputSchema).toBeDefined();
    });

    it("should call mode change callback when handler is invoked", async () => {
      const mockCallback = vi.fn();
      const module = createExitConfigurationModeModule(mockDeps, mockCallback);
      
      const result = await module.handler({});
      
      expect(mockCallback).toHaveBeenCalledOnce();
      expect(result.content).toBeDefined();
      expect(result.content[0].type).toBe("text");
      
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.message).toContain("Exiting configuration mode");
      expect(response.currentMode).toBe("normal");
    });

    it("should throw error when callback is not provided", async () => {
      const module = createExitConfigurationModeModule(mockDeps);
      
      await expect(module.handler({})).rejects.toThrow("Mode change callback not configured");
    });
  });
});