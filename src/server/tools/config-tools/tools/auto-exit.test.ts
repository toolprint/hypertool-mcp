/**
 * Tests for auto-exit triggers in configuration mode
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createEquipToolsetModule } from './equip-toolset.js';
import { createBuildToolsetModule } from './build-toolset.js';
import { ToolDependencies } from '../../types.js';

describe('Auto-Exit Triggers', () => {
  let mockDependencies: ToolDependencies;
  let mockModeChangeCallback: ReturnType<typeof vi.fn>;
  
  beforeEach(() => {
    mockModeChangeCallback = vi.fn();
    
    mockDependencies = {
      toolsetManager: {
        equipToolset: vi.fn().mockResolvedValue({ success: true }),
        buildToolset: vi.fn().mockResolvedValue({ 
          meta: { success: true, autoEquipped: true },
          toolset: { name: 'test-toolset' }
        }),
        // Other required methods
        getMcpTools: vi.fn().mockReturnValue([]),
        getActiveDiscoveredTools: vi.fn().mockReturnValue([]),
        generateToolsetInfo: vi.fn().mockResolvedValue({}),
      } as any,
      discoveryEngine: {
        refreshCache: vi.fn().mockResolvedValue(undefined),
        getAvailableTools: vi.fn().mockReturnValue([]),
      } as any,
    };
  });

  describe('equip-toolset', () => {
    it('should trigger mode change callback on successful equip', async () => {
      const module = createEquipToolsetModule(mockDependencies, mockModeChangeCallback);
      
      await module.handler({ name: 'test-toolset' });
      
      expect(mockModeChangeCallback).toHaveBeenCalledTimes(1);
      expect(mockDependencies.toolsetManager.equipToolset).toHaveBeenCalledWith('test-toolset');
    });

    it('should not trigger mode change callback on failed equip', async () => {
      mockDependencies.toolsetManager.equipToolset = vi.fn().mockResolvedValue({ 
        success: false, 
        error: 'Toolset not found' 
      });
      
      const module = createEquipToolsetModule(mockDependencies, mockModeChangeCallback);
      
      await module.handler({ name: 'nonexistent-toolset' });
      
      expect(mockModeChangeCallback).not.toHaveBeenCalled();
    });

    it('should work without callback', async () => {
      const module = createEquipToolsetModule(mockDependencies);
      
      const result = await module.handler({ name: 'test-toolset' });
      
      expect(result.structuredContent?.success).toBe(true);
      // Should not throw even without callback
    });
  });

  describe('build-toolset', () => {
    it('should trigger mode change callback when autoEquip is true and build succeeds', async () => {
      const module = createBuildToolsetModule(mockDependencies, mockModeChangeCallback);
      
      await module.handler({
        name: 'new-toolset',
        tools: [{ namespacedName: 'git.status' }],
        autoEquip: true
      });
      
      expect(mockModeChangeCallback).toHaveBeenCalledTimes(1);
      expect(mockDependencies.toolsetManager.buildToolset).toHaveBeenCalledWith(
        'new-toolset',
        [{ namespacedName: 'git.status' }],
        { autoEquip: true }
      );
    });

    it('should not trigger mode change callback when autoEquip is false', async () => {
      const module = createBuildToolsetModule(mockDependencies, mockModeChangeCallback);
      
      await module.handler({
        name: 'new-toolset',
        tools: [{ namespacedName: 'git.status' }],
        autoEquip: false
      });
      
      expect(mockModeChangeCallback).not.toHaveBeenCalled();
    });

    it('should not trigger mode change callback when build fails', async () => {
      mockDependencies.toolsetManager.buildToolset = vi.fn().mockResolvedValue({ 
        meta: { success: false, error: 'Invalid tools' },
      });
      
      const module = createBuildToolsetModule(mockDependencies, mockModeChangeCallback);
      
      await module.handler({
        name: 'new-toolset',
        tools: [{ namespacedName: 'invalid.tool' }],
        autoEquip: true
      });
      
      expect(mockModeChangeCallback).not.toHaveBeenCalled();
    });

    it('should work without callback', async () => {
      const module = createBuildToolsetModule(mockDependencies);
      
      const result = await module.handler({
        name: 'new-toolset',
        tools: [{ namespacedName: 'git.status' }],
        autoEquip: true
      });
      
      expect(result.structuredContent?.meta?.success).toBe(true);
      // Should not throw even without callback
    });
  });
});