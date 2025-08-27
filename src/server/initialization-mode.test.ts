/**
 * Tests for initial mode determination based on toolset restoration
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Mock the toolset manager's restore functionality
vi.mock("./tools/toolset/manager.js", async () => {
  const actual = await vi.importActual("./tools/toolset/manager.js");
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
        listSavedToolsets: vi
          .fn()
          .mockResolvedValue({ success: true, toolsets: [] }),
        restoreLastEquippedToolset: vi.fn().mockImplementation(async () => {
          // Simulate successful restoration
          hasActiveToolset = true;
          return true;
        }),
        equipToolset: vi.fn().mockImplementation(async () => {
          hasActiveToolset = true;
          return { success: true };
        }),
      };
    }),
  };
});

// Mock other dependencies
vi.mock("../db/compositeDatabaseService.js", () => ({
  getCompositeDatabaseService: () => ({
    init: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock("../config/mcpConfigLoader.js", () => ({
  loadMcpConfig: vi.fn().mockResolvedValue({ mcpServers: {} }),
}));

vi.mock("../config/serverSettings.js", () => ({
  loadServerSettings: vi
    .fn()
    .mockResolvedValue({ maxConcurrentConnections: 5 }),
  logServerSettingsSource: vi.fn(),
}));

vi.mock("../config-manager/serverSync.js", () => ({
  ServerSyncManager: vi.fn().mockImplementation(() => ({
    syncServers: vi.fn().mockResolvedValue(undefined),
    getServersForGroup: vi.fn().mockResolvedValue([]),
  })),
}));

vi.mock("../scripts/shared/externalMcpDetector.js", () => ({
  detectExternalMCPs: vi.fn().mockResolvedValue([]),
  formatExternalMCPsMessage: vi.fn(),
}));

vi.mock("../persona/manager.js", () => ({
  PersonaManager: vi.fn().mockImplementation(() => ({
    initialize: vi.fn().mockResolvedValue(undefined),
    updateMcpHandlers: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock("../extensions/manager.js", () => ({
  ExtensionManager: vi.fn().mockImplementation(() => ({
    initialize: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock("../connection/index.js", () => ({
  ConnectionManager: vi.fn().mockImplementation(() => ({
    initialize: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    getConnectedServers: vi.fn().mockReturnValue([]),
  })),
}));

vi.mock("../connection/extensionFactory.js", () => ({
  ExtensionAwareConnectionFactory: vi.fn().mockImplementation(() => ({
    setExtensionManager: vi.fn(),
  })),
}));

vi.mock("../discovery/index.js", () => ({
  ToolDiscoveryEngine: vi.fn().mockImplementation(() => ({
    initialize: vi.fn().mockResolvedValue(undefined),
    start: vi.fn().mockResolvedValue(undefined),
    getAvailableTools: vi.fn().mockReturnValue([]),
  })),
}));

vi.mock("./tools/config-tools/manager.js", () => ({
  ConfigToolsManager: vi.fn().mockImplementation(() => ({
    initialize: vi.fn().mockResolvedValue(undefined),
    getMcpTools: vi.fn().mockReturnValue([
      {
        name: "list-available-tools",
        description: "Discover all tools available from connected MCP servers",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
    ]),
  })),
}));

// Mock the base server's start method to prevent actual server startup
vi.mock("./base.js", () => ({
  MetaMCPServer: class MockMetaMCPServer {
    async start() {
      return undefined;
    }
    async stop() {
      return undefined;
    }
  },
}));

// Mock feature flags to disable DXT and enable config tools menu
vi.mock("../config/featureFlagService.js", () => ({
  getFeatureFlagService: () => ({
    reset: vi.fn(),
  }),
  isDxtEnabledViaService: vi.fn().mockResolvedValue(false),
  isConfigToolsMenuEnabledViaService: vi.fn().mockResolvedValue(true),
}));

// Mock the enter-configuration-mode tool creator
vi.mock("./tools/common/enter-configuration-mode.js", () => ({
  createEnterConfigurationModeModule: vi.fn().mockReturnValue({
    definition: {
      name: "enter-configuration-mode",
      description: "Enter configuration mode to manage toolsets",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
    handler: vi.fn(),
  }),
}));

// Import after mocks are set up
const { EnhancedMetaMCPServer } = await import("./enhanced.js");

describe("Initial Configuration Mode Determination", () => {
  let server: EnhancedMetaMCPServer;

  beforeEach(() => {
    vi.clearAllMocks();
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

  it("should start in configuration mode when no toolset is restored", async () => {
    // Mock no toolset restoration
    const { ToolsetManager } = await import("./tools/toolset/manager.js");
    (ToolsetManager as any).mockImplementation(() => {
      return {
        setDiscoveryEngine: vi.fn(),
        on: vi.fn(),
        hasActiveToolset: vi.fn(() => false), // No active toolset
        getMcpTools: vi.fn(() => []),
        getOriginalToolName: vi.fn(),
        getActiveToolsetInfo: vi.fn(),
        listSavedToolsets: vi
          .fn()
          .mockResolvedValue({ success: true, toolsets: [] }),
        restoreLastEquippedToolset: vi.fn().mockResolvedValue(false), // No restoration
        equipToolset: vi.fn(),
      };
    });

    server = new EnhancedMetaMCPServer({
      name: "test-server",
      version: "1.0.0",
      description: "Test server",
      transport: { type: "stdio" },
    });

    // Mock the heavy parts to prevent network calls and complex initialization
    vi.spyOn(server as any, 'loadMcpConfigOrExit').mockResolvedValue({});

    await server.start({
      transport: { type: "stdio" },
    });

    const tools = await server["getAvailableTools"]();

    // In configuration mode, we should see configuration tools
    const hasConfigTool = tools.some((t) => t.name === "list-available-tools");
    expect(hasConfigTool).toBe(true);

    // Should NOT have enter-configuration-mode tool (that's for normal mode)
    const hasEnterConfigMode = tools.some(
      (t) => t.name === "enter-configuration-mode"
    );
    expect(hasEnterConfigMode).toBe(false);
  }, 15000); // Increase timeout to 15s

  it("should start in normal mode when a toolset is restored", async () => {
    // Mock successful toolset restoration
    const { ToolsetManager } = await import("./tools/toolset/manager.js");
    (ToolsetManager as any).mockImplementation(() => {
      let hasActive = false;
      return {
        setDiscoveryEngine: vi.fn(),
        on: vi.fn(),
        hasActiveToolset: vi.fn(() => hasActive),
        getMcpTools: vi.fn(() => []),
        getOriginalToolName: vi.fn(),
        getActiveToolsetInfo: vi.fn(() => ({ name: "test-toolset" })),
        listSavedToolsets: vi.fn().mockResolvedValue({
          success: true,
          toolsets: [{ name: "test-toolset" }],
        }),
        restoreLastEquippedToolset: vi.fn().mockImplementation(async () => {
          hasActive = true; // Simulate successful restoration
          return true;
        }),
        equipToolset: vi.fn(),
      };
    });

    server = new EnhancedMetaMCPServer({
      name: "test-server",
      version: "1.0.0",
      description: "Test server",
      transport: { type: "stdio" },
    });

    // Mock the heavy parts to prevent network calls and complex initialization
    vi.spyOn(server as any, 'loadMcpConfigOrExit').mockResolvedValue({});

    await server.start({
      transport: { type: "stdio" },
    });

    const tools = await server["getAvailableTools"]();

    // In normal mode, we should have enter-configuration-mode tool
    const hasEnterConfigMode = tools.some(
      (t) => t.name === "enter-configuration-mode"
    );
    expect(hasEnterConfigMode).toBe(true);

    // Should NOT have configuration tools directly
    const hasConfigTool = tools.some((t) => t.name === "list-available-tools");
    expect(hasConfigTool).toBe(false);
  }, 15000); // Increase timeout to 15s

  it("should start in normal mode when equipToolset runtime option is provided", async () => {
    // Mock successful toolset equip via runtime option
    const { ToolsetManager } = await import("./tools/toolset/manager.js");
    (ToolsetManager as any).mockImplementation(() => {
      let hasActive = false;
      return {
        setDiscoveryEngine: vi.fn(),
        on: vi.fn(),
        hasActiveToolset: vi.fn(() => hasActive),
        getMcpTools: vi.fn(() => []),
        getOriginalToolName: vi.fn(),
        getActiveToolsetInfo: vi.fn(() => ({ name: "runtime-toolset" })),
        listSavedToolsets: vi.fn().mockResolvedValue({
          success: true,
          toolsets: [{ name: "runtime-toolset" }],
        }),
        restoreLastEquippedToolset: vi.fn().mockResolvedValue(false),
        equipToolset: vi.fn().mockImplementation(async () => {
          hasActive = true; // Simulate successful equip
          return { success: true };
        }),
      };
    });

    server = new EnhancedMetaMCPServer({
      name: "test-server",
      version: "1.0.0",
      description: "Test server",
      transport: { type: "stdio" },
    });

    // Mock the heavy parts to prevent network calls and complex initialization
    vi.spyOn(server as any, 'loadMcpConfigOrExit').mockResolvedValue({});

    await server.start(
      { transport: { type: "stdio" } },
      {
        transport: "stdio",
        debug: false,
        insecure: false,
        equipToolset: "runtime-toolset",
      }
    );

    const tools = await server["getAvailableTools"]();

    // Should be in normal mode after equipping toolset
    const hasEnterConfigMode = tools.some(
      (t) => t.name === "enter-configuration-mode"
    );
    expect(hasEnterConfigMode).toBe(true);
  }, 15000); // Increase timeout to 15s
});
