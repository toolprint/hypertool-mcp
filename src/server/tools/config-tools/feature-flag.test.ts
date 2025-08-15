/**
 * Tests for configuration mode feature flag
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getFeatureFlagService } from '../../../config/featureFlagService.js';

describe('Configuration Tools Menu Feature Flag', () => {
  let originalEnv: NodeJS.ProcessEnv;
  
  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };
    
    // Reset feature flag service
    const service = getFeatureFlagService();
    service.reset();
  });
  
  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
    
    // Reset service again
    const service = getFeatureFlagService();
    service.reset();
  });

  describe('Default Behavior', () => {
    it('should be enabled by default', async () => {
      const service = getFeatureFlagService();
      await service.initialize();
      
      expect(service.isConfigToolsMenuEnabled()).toBe(true);
    });
  });

  describe('Environment Variable Override', () => {
    it('should respect HYPERTOOL_ENABLE_CONFIG_TOOLS_MENU=false', async () => {
      process.env.HYPERTOOL_ENABLE_CONFIG_TOOLS_MENU = 'false';
      
      const service = getFeatureFlagService();
      await service.initialize();
      
      expect(service.isConfigToolsMenuEnabled()).toBe(false);
    });

    it('should respect HYPERTOOL_ENABLE_CONFIG_TOOLS_MENU=true', async () => {
      process.env.HYPERTOOL_ENABLE_CONFIG_TOOLS_MENU = 'true';
      
      const service = getFeatureFlagService();
      await service.initialize();
      
      expect(service.isConfigToolsMenuEnabled()).toBe(true);
    });

    it('should handle various truthy values', async () => {
      const truthyValues = ['true', '1', 'yes', 'on', 'TRUE', 'YES', 'ON'];
      
      for (const value of truthyValues) {
        const service = getFeatureFlagService();
        service.reset();
        
        process.env.HYPERTOOL_ENABLE_CONFIG_TOOLS_MENU = value;
        await service.initialize();
        
        expect(service.isConfigToolsMenuEnabled()).toBe(true);
      }
    });

    it('should handle various falsy values', async () => {
      const falsyValues = ['false', '0', 'no', 'off', 'FALSE', 'NO', 'OFF'];
      
      for (const value of falsyValues) {
        const service = getFeatureFlagService();
        service.reset();
        
        process.env.HYPERTOOL_ENABLE_CONFIG_TOOLS_MENU = value;
        await service.initialize();
        
        expect(service.isConfigToolsMenuEnabled()).toBe(false);
      }
    });
  });

  describe('Convenience Function', () => {
    it('should work with isConfigToolsMenuEnabledViaService', async () => {
      // Import the convenience function
      const { isConfigToolsMenuEnabledViaService } = await import('../../../config/featureFlagService.js');
      
      // Default should be true
      const service = getFeatureFlagService();
      service.reset();
      const enabled = await isConfigToolsMenuEnabledViaService();
      expect(enabled).toBe(true);
    });

    it('should respect environment variable with convenience function', async () => {
      process.env.HYPERTOOL_ENABLE_CONFIG_TOOLS_MENU = 'false';
      
      const { isConfigToolsMenuEnabledViaService } = await import('../../../config/featureFlagService.js');
      const service = getFeatureFlagService();
      service.reset();
      
      const enabled = await isConfigToolsMenuEnabledViaService();
      expect(enabled).toBe(false);
    });
  });
});