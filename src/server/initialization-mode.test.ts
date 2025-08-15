/**
 * Tests for initial mode determination based on toolset restoration
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EnhancedMetaMCPServer } from './enhanced.js';
import { getFeatureFlagService } from '../config/featureFlagService.js';

// Mock the toolset manager's restore functionality
vi.mock('./tools/toolset/manager.js', async () => {
  const actual = await vi.importActual('./tools/toolset/manager.js');
  return {
    ...actual,
    ToolsetManager: vi.fn().mockImplementation(() => {
      let hasActiveToolset = false;
      return {
        setDiscoveryEngine: vi.fn(),
        on: vi.fn(),
        hasActiveToolset: vi.fn(() => hasActiveToolset),
        getMcpTools: vi.fn(() => []),
        getOriginalToolName: vi.fn(),
        getActiveToolsetInfo: vi.fn(),
        listSavedToolsets: vi.fn().mockResolvedValue({ success: true, toolsets: [] }),
        restoreLastEquippedToolset: vi.fn().mockImplementation(async () => {
          // Simulate successful restoration
          hasActiveToolset = true;
          return true;
        }),
        equipToolset: vi.fn().mockImplementation(async () => {
          hasActiveToolset = true;
          return { success: true };
        })
      };
    })
  };
});

// Mock other dependencies
vi.mock('../db/compositeDatabaseService.js', () => ({
  getCompositeDatabaseService: () => ({
    init: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined)
  })
}));

vi.mock('../config/mcpConfigLoader.js', () => ({
  loadMcpConfig: vi.fn().mockResolvedValue({ mcpServers: {} })
}));

vi.mock('../config/serverSettings.js', () => ({
  loadServerSettings: vi.fn().mockResolvedValue({ maxConcurrentConnections: 5 }),
  logServerSettingsSource: vi.fn()
}));

vi.mock('../config-manager/serverSync.js', () => ({
  ServerSyncManager: vi.fn().mockImplementation(() => ({
    syncServers: vi.fn().mockResolvedValue(undefined),
    getServersForGroup: vi.fn().mockResolvedValue([])
  }))
}));

vi.mock('../scripts/shared/externalMcpDetector.js', () => ({
  detectExternalMCPs: vi.fn().mockResolvedValue([]),
  formatExternalMCPsMessage: vi.fn()
}));

describe('Initial Configuration Mode Determination', () => {
  let server: EnhancedMetaMCPServer;
  
  beforeEach(() => {
    vi.clearAllMocks();
    const service = getFeatureFlagService();
    service.reset();
  });
  
  afterEach(async () => {
    if (server) {
      try {
        await server.stop();
      } catch {
        // Ignore errors during cleanup
      }
    }
  });

  it('should start in configuration mode when no toolset is restored', async () => {
    // Mock no toolset restoration
    const { ToolsetManager } = await import('./tools/toolset/manager.js');
    (ToolsetManager as any).mockImplementation(() => {
      return {
        setDiscoveryEngine: vi.fn(),
        on: vi.fn(),
        hasActiveToolset: vi.fn(() => false), // No active toolset
        getMcpTools: vi.fn(() => []),
        getOriginalToolName: vi.fn(),
        getActiveToolsetInfo: vi.fn(),
        listSavedToolsets: vi.fn().mockResolvedValue({ success: true, toolsets: [] }),
        restoreLastEquippedToolset: vi.fn().mockResolvedValue(false), // No restoration
        equipToolset: vi.fn()
      };
    });

    server = new EnhancedMetaMCPServer({
      name: 'test-server',
      version: '1.0.0',
      description: 'Test server',
      transport: { type: 'stdio' }
    });

    await server.start({
      transport: { type: 'stdio' }
    });

    const tools = await server['getAvailableTools']();
    
    // In configuration mode, we should see configuration tools
    const hasConfigTool = tools.some(t => t.name === 'list-available-tools');
    expect(hasConfigTool).toBe(true);
    
    // Should NOT have enter-configuration-mode tool (that's for normal mode)
    const hasEnterConfigMode = tools.some(t => t.name === 'enter-configuration-mode');
    expect(hasEnterConfigMode).toBe(false);
  });

  it('should start in normal mode when a toolset is restored', async () => {
    // Mock successful toolset restoration
    const { ToolsetManager } = await import('./tools/toolset/manager.js');
    (ToolsetManager as any).mockImplementation(() => {
      let hasActive = false;
      return {
        setDiscoveryEngine: vi.fn(),
        on: vi.fn(),
        hasActiveToolset: vi.fn(() => hasActive),
        getMcpTools: vi.fn(() => []),
        getOriginalToolName: vi.fn(),
        getActiveToolsetInfo: vi.fn(() => ({ name: 'test-toolset' })),
        listSavedToolsets: vi.fn().mockResolvedValue({ 
          success: true, 
          toolsets: [{ name: 'test-toolset' }] 
        }),
        restoreLastEquippedToolset: vi.fn().mockImplementation(async () => {
          hasActive = true; // Simulate successful restoration
          return true;
        }),
        equipToolset: vi.fn()
      };
    });

    server = new EnhancedMetaMCPServer({
      name: 'test-server',
      version: '1.0.0',
      description: 'Test server',
      transport: { type: 'stdio' }
    });

    await server.start({
      transport: { type: 'stdio' }
    });

    const tools = await server['getAvailableTools']();
    
    // In normal mode, we should have enter-configuration-mode tool
    const hasEnterConfigMode = tools.some(t => t.name === 'enter-configuration-mode');
    expect(hasEnterConfigMode).toBe(true);
    
    // Should NOT have configuration tools directly
    const hasConfigTool = tools.some(t => t.name === 'list-available-tools');
    expect(hasConfigTool).toBe(false);
  });

  it('should start in normal mode when equipToolset runtime option is provided', async () => {
    // Mock successful toolset equip via runtime option
    const { ToolsetManager } = await import('./tools/toolset/manager.js');
    (ToolsetManager as any).mockImplementation(() => {
      let hasActive = false;
      return {
        setDiscoveryEngine: vi.fn(),
        on: vi.fn(),
        hasActiveToolset: vi.fn(() => hasActive),
        getMcpTools: vi.fn(() => []),
        getOriginalToolName: vi.fn(),
        getActiveToolsetInfo: vi.fn(() => ({ name: 'runtime-toolset' })),
        listSavedToolsets: vi.fn().mockResolvedValue({ 
          success: true, 
          toolsets: [{ name: 'runtime-toolset' }] 
        }),
        restoreLastEquippedToolset: vi.fn().mockResolvedValue(false),
        equipToolset: vi.fn().mockImplementation(async () => {
          hasActive = true; // Simulate successful equip
          return { success: true };
        })
      };
    });

    server = new EnhancedMetaMCPServer({
      name: 'test-server',
      version: '1.0.0',
      description: 'Test server',
      transport: { type: 'stdio' }
    });

    await server.start(
      { transport: { type: 'stdio' } },
      { 
        transport: 'stdio',
        debug: false,
        insecure: false,
        equipToolset: 'runtime-toolset' 
      }
    );

    const tools = await server['getAvailableTools']();
    
    // Should be in normal mode after equipping toolset
    const hasEnterConfigMode = tools.some(t => t.name === 'enter-configuration-mode');
    expect(hasEnterConfigMode).toBe(true);
  });
});