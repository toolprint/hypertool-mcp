/**
 * Integration tests for Persona + MCP Configuration system interaction
 *
 * This test suite verifies that persona activation correctly integrates with
 * MCP configuration management, testing config merging, conflict resolution,
 * backup/restore functionality, and connection management.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { vol } from 'memfs';
import { join } from 'path';
import { TestEnvironment } from '../fixtures/base.js';
import { PersonaManager, PersonaManagerConfig } from '../../src/persona/manager.js';
import { PersonaEvents } from '../../src/persona/types.js';
import type { MCPConfig } from '../../src/types/config.js';
import type { IToolDiscoveryEngine } from '../../src/discovery/types.js';
import type { DiscoveredTool } from '../../src/discovery/types.js';

// Mock tool discovery engine
class MockToolDiscoveryEngine implements IToolDiscoveryEngine {
  private tools: DiscoveredTool[] = [
    {
      name: 'git.status',
      description: 'Get git repository status',
      server: 'git',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'filesystem.read',
      description: 'Read file from filesystem',
      server: 'filesystem',
      inputSchema: { type: 'object', properties: {} },
    },
  ];

  async discoverTools(): Promise<DiscoveredTool[]> {
    return [...this.tools];
  }

  async getDiscoveredTools(): Promise<DiscoveredTool[]> {
    return [...this.tools];
  }

  async refreshDiscovery(): Promise<void> {
    // No-op for testing
  }

  on(): this { return this; }
  off(): this { return this; }
  emit(): boolean { return true; }
}

// Mock MCP configuration handlers
class MockMcpConfigHandlers {
  private currentConfig: MCPConfig | null = null;
  private configHistory: MCPConfig[] = [];
  private restartCallCount = 0;

  constructor(initialConfig?: MCPConfig) {
    if (initialConfig) {
      this.currentConfig = initialConfig;
    }
  }

  getCurrentConfig = vi.fn(async (): Promise<MCPConfig | null> => {
    return this.currentConfig;
  });

  setCurrentConfig = vi.fn(async (config: MCPConfig): Promise<void> => {
    if (this.currentConfig) {
      this.configHistory.push(JSON.parse(JSON.stringify(this.currentConfig)));
    }
    this.currentConfig = JSON.parse(JSON.stringify(config));
  });

  restartConnections = vi.fn(async (): Promise<void> => {
    this.restartCallCount++;
    // Simulate connection restart delay
    await new Promise(resolve => setTimeout(resolve, 10));
  });

  // Test helpers
  getConfigHistory(): MCPConfig[] {
    return this.configHistory;
  }

  getRestartCallCount(): number {
    return this.restartCallCount;
  }

  reset(): void {
    this.currentConfig = null;
    this.configHistory = [];
    this.restartCallCount = 0;
    vi.clearAllMocks();
  }
}

describe('Persona + MCP Configuration Integration Tests', () => {
  let env: TestEnvironment;
  let personaManager: PersonaManager;
  let discoveryEngine: MockToolDiscoveryEngine;
  let mcpHandlers: MockMcpConfigHandlers;
  let tempDir: string;

  beforeEach(async () => {
    // Setup test environment
    tempDir = '/tmp/hypertool-test-persona-mcp';
    env = new TestEnvironment(tempDir);
    await env.setup();

    // Create mock components
    discoveryEngine = new MockToolDiscoveryEngine();
    mcpHandlers = new MockMcpConfigHandlers();

    // Setup test personas with MCP configurations
    await setupTestPersonas();

    // Create persona manager with MCP integration
    const config: PersonaManagerConfig = {
      toolDiscoveryEngine: discoveryEngine,
      autoDiscover: false,
      validateOnActivation: true,
      discoveryConfig: {
        searchPaths: [join(tempDir, 'personas')],
        enableCache: false,
      },
      mcpConfigHandlers: {
        getCurrentConfig: mcpHandlers.getCurrentConfig,
        setCurrentConfig: mcpHandlers.setCurrentConfig,
        restartConnections: mcpHandlers.restartConnections,
      },
      mcpMergeOptions: {
        strategy: 'merge',
        conflictResolution: 'persona-wins',
        backupOriginal: true,
      },
    };

    personaManager = new PersonaManager(config);
  });

  afterEach(async () => {
    await personaManager.dispose();
    await env.teardown();
    mcpHandlers.reset();
    vol.reset();
  });

  describe('MCP Configuration Merging', () => {
    it('should merge persona MCP config with existing configuration', async () => {
      // Setup existing MCP configuration
      const existingConfig: MCPConfig = {
        mcpServers: {
          'existing-server': {
            command: 'existing-mcp-server',
            args: ['--port', '3000'],
            env: { EXISTING: 'true' },
          },
          'filesystem': {
            command: 'mcp-server-filesystem',
            args: ['--path', '/existing'],
          },
        },
      };

      mcpHandlers = new MockMcpConfigHandlers(existingConfig);

      // Recreate persona manager with new handlers
      const config: PersonaManagerConfig = {
        toolDiscoveryEngine: discoveryEngine,
        autoDiscover: false,
        discoveryConfig: {
          searchPaths: [join(tempDir, 'personas')],
          enableCache: false,
        },
        mcpConfigHandlers: {
          getCurrentConfig: mcpHandlers.getCurrentConfig,
          setCurrentConfig: mcpHandlers.setCurrentConfig,
          restartConnections: mcpHandlers.restartConnections,
        },
        mcpMergeOptions: {
          strategy: 'merge',
          conflictResolution: 'persona-wins',
          backupOriginal: true,
        },
      };

      await personaManager.dispose();
      personaManager = new PersonaManager(config);
      await personaManager.initialize();

      // Activate persona with MCP config
      const result = await personaManager.activatePersona('persona-with-mcp');

      expect(result.success).toBe(true);
      expect(mcpHandlers.setCurrentConfig).toHaveBeenCalled();

      // Verify merged configuration
      const finalConfig = await mcpHandlers.getCurrentConfig();
      expect(finalConfig?.mcpServers).toBeDefined();

      // Should contain both existing and persona servers
      expect(finalConfig?.mcpServers['existing-server']).toBeDefined();
      expect(finalConfig?.mcpServers['git']).toBeDefined();
      expect(finalConfig?.mcpServers['filesystem']).toBeDefined();

      // Persona config should win for conflicting servers (filesystem)
      expect(finalConfig?.mcpServers['filesystem'].args).toContain('--repository');
      expect(finalConfig?.mcpServers['filesystem'].args).toContain('.');
    });

    it('should handle conflict resolution strategies correctly', async () => {
      const existingConfig: MCPConfig = {
        mcpServers: {
          'git': {
            command: 'old-git-server',
            args: ['--old-args'],
          },
        },
      };

      mcpHandlers = new MockMcpConfigHandlers(existingConfig);

      // Test persona-wins strategy
      const config: PersonaManagerConfig = {
        toolDiscoveryEngine: discoveryEngine,
        autoDiscover: false,
        discoveryConfig: {
          searchPaths: [join(tempDir, 'personas')],
          enableCache: false,
        },
        mcpConfigHandlers: {
          getCurrentConfig: mcpHandlers.getCurrentConfig,
          setCurrentConfig: mcpHandlers.setCurrentConfig,
          restartConnections: mcpHandlers.restartConnections,
        },
        mcpMergeOptions: {
          strategy: 'merge',
          conflictResolution: 'persona-wins',
        },
      };

      await personaManager.dispose();
      personaManager = new PersonaManager(config);
      await personaManager.initialize();

      await personaManager.activatePersona('persona-with-mcp');

      const finalConfig = await mcpHandlers.getCurrentConfig();
      expect(finalConfig?.mcpServers['git'].command).toBe('mcp-server-git');
      expect(finalConfig?.mcpServers['git'].args).toContain('--repository');
    });

    it('should backup original configuration before applying persona config', async () => {
      const existingConfig: MCPConfig = {
        mcpServers: {
          'important-server': {
            command: 'important-mcp-server',
            args: ['--critical'],
          },
        },
      };

      mcpHandlers = new MockMcpConfigHandlers(existingConfig);

      const config: PersonaManagerConfig = {
        toolDiscoveryEngine: discoveryEngine,
        autoDiscover: false,
        discoveryConfig: {
          searchPaths: [join(tempDir, 'personas')],
          enableCache: false,
        },
        mcpConfigHandlers: {
          getCurrentConfig: mcpHandlers.getCurrentConfig,
          setCurrentConfig: mcpHandlers.setCurrentConfig,
          restartConnections: mcpHandlers.restartConnections,
        },
        mcpMergeOptions: {
          strategy: 'merge',
          backupOriginal: true,
        },
      };

      await personaManager.dispose();
      personaManager = new PersonaManager(config);
      await personaManager.initialize();

      // Activate persona
      await personaManager.activatePersona('persona-with-mcp');

      // Verify backup was created (indicated by config being in history)
      const configHistory = mcpHandlers.getConfigHistory();
      expect(configHistory.length).toBeGreaterThan(0);

      // Deactivate and verify original config is restored
      await personaManager.deactivatePersona();

      const restoredConfig = await mcpHandlers.getCurrentConfig();
      expect(restoredConfig?.mcpServers['important-server']).toBeDefined();
      expect(restoredConfig?.mcpServers['important-server'].command).toBe('important-mcp-server');
    });

    it('should restart connections after MCP config application', async () => {
      await personaManager.initialize();

      await personaManager.activatePersona('persona-with-mcp');

      // Verify connections were restarted
      expect(mcpHandlers.restartConnections).toHaveBeenCalled();
      expect(mcpHandlers.getRestartCallCount()).toBeGreaterThan(0);
    });

    it('should handle MCP config application failures gracefully', async () => {
      // Setup handlers that will fail
      mcpHandlers.setCurrentConfig.mockRejectedValue(new Error('Config write failed'));

      const config: PersonaManagerConfig = {
        toolDiscoveryEngine: discoveryEngine,
        autoDiscover: false,
        discoveryConfig: {
          searchPaths: [join(tempDir, 'personas')],
          enableCache: false,
        },
        mcpConfigHandlers: {
          getCurrentConfig: mcpHandlers.getCurrentConfig,
          setCurrentConfig: mcpHandlers.setCurrentConfig,
          restartConnections: mcpHandlers.restartConnections,
        },
      };

      await personaManager.dispose();
      personaManager = new PersonaManager(config);
      await personaManager.initialize();

      // Activation should still succeed but with warnings
      const result = await personaManager.activatePersona('persona-with-mcp');

      expect(result.success).toBe(true);
      expect(result.warnings).toBeDefined();
      expect(result.warnings!.some(w => w.includes('MCP config'))).toBe(true);

      // Persona should still be active despite MCP config failure
      const activeState = personaManager.getActivePersona();
      expect(activeState?.persona.config.name).toBe('persona-with-mcp');
      expect(activeState?.metadata.mcpConfigApplied).toBe(false);
    });
  });

  describe('Configuration Restoration', () => {
    it('should restore original MCP config on persona deactivation', async () => {
      const originalConfig: MCPConfig = {
        mcpServers: {
          'original-server': {
            command: 'original-mcp-server',
            args: ['--original'],
          },
        },
      };

      mcpHandlers = new MockMcpConfigHandlers(originalConfig);

      const config: PersonaManagerConfig = {
        toolDiscoveryEngine: discoveryEngine,
        autoDiscover: false,
        discoveryConfig: {
          searchPaths: [join(tempDir, 'personas')],
          enableCache: false,
        },
        mcpConfigHandlers: {
          getCurrentConfig: mcpHandlers.getCurrentConfig,
          setCurrentConfig: mcpHandlers.setCurrentConfig,
          restartConnections: mcpHandlers.restartConnections,
        },
        mcpMergeOptions: {
          backupOriginal: true,
        },
      };

      await personaManager.dispose();
      personaManager = new PersonaManager(config);
      await personaManager.initialize();

      // Activate persona (which should backup and merge config)
      await personaManager.activatePersona('persona-with-mcp');

      // Verify config was changed
      let currentConfig = await mcpHandlers.getCurrentConfig();
      expect(currentConfig?.mcpServers['git']).toBeDefined();

      // Deactivate persona
      const deactivateResult = await personaManager.deactivatePersona();
      expect(deactivateResult.success).toBe(true);

      // Verify original config was restored
      currentConfig = await mcpHandlers.getCurrentConfig();
      expect(currentConfig?.mcpServers['original-server']).toBeDefined();
      expect(currentConfig?.mcpServers['git']).toBeUndefined();
    });

    it('should handle restoration failures gracefully', async () => {
      const originalConfig: MCPConfig = {
        mcpServers: {
          'original-server': {
            command: 'original-mcp-server',
            args: ['--original'],
          },
        },
      };

      mcpHandlers = new MockMcpConfigHandlers(originalConfig);

      const config: PersonaManagerConfig = {
        toolDiscoveryEngine: discoveryEngine,
        autoDiscover: false,
        discoveryConfig: {
          searchPaths: [join(tempDir, 'personas')],
          enableCache: false,
        },
        mcpConfigHandlers: {
          getCurrentConfig: mcpHandlers.getCurrentConfig,
          setCurrentConfig: mcpHandlers.setCurrentConfig,
          restartConnections: mcpHandlers.restartConnections,
        },
        mcpMergeOptions: {
          backupOriginal: true,
        },
      };

      await personaManager.dispose();
      personaManager = new PersonaManager(config);
      await personaManager.initialize();

      // Activate persona
      await personaManager.activatePersona('persona-with-mcp');

      // Make restoration fail
      mcpHandlers.setCurrentConfig.mockRejectedValueOnce(new Error('Restoration failed'));

      // Deactivation should still succeed
      const result = await personaManager.deactivatePersona();
      expect(result.success).toBe(true);

      // Persona should be deactivated despite restoration failure
      expect(personaManager.getActivePersona()).toBeNull();
    });

    it('should handle multiple persona switches with proper config management', async () => {
      const originalConfig: MCPConfig = {
        mcpServers: {
          'base-server': {
            command: 'base-mcp-server',
            args: ['--base'],
          },
        },
      };

      mcpHandlers = new MockMcpConfigHandlers(originalConfig);

      const config: PersonaManagerConfig = {
        toolDiscoveryEngine: discoveryEngine,
        autoDiscover: false,
        discoveryConfig: {
          searchPaths: [join(tempDir, 'personas')],
          enableCache: false,
        },
        mcpConfigHandlers: {
          getCurrentConfig: mcpHandlers.getCurrentConfig,
          setCurrentConfig: mcpHandlers.setCurrentConfig,
          restartConnections: mcpHandlers.restartConnections,
        },
        mcpMergeOptions: {
          backupOriginal: true,
        },
      };

      await personaManager.dispose();
      personaManager = new PersonaManager(config);
      await personaManager.initialize();

      // Switch between personas
      await personaManager.activatePersona('persona-with-mcp');
      await personaManager.activatePersona('complex-persona-with-mcp');
      await personaManager.activatePersona('persona-with-mcp');
      await personaManager.deactivatePersona();

      // Verify original configuration is restored
      const finalConfig = await mcpHandlers.getCurrentConfig();
      expect(finalConfig?.mcpServers['base-server']).toBeDefined();
      expect(finalConfig?.mcpServers['git']).toBeUndefined();
      expect(finalConfig?.mcpServers['docker']).toBeUndefined();
    });
  });

  describe('Event Emission and Lifecycle', () => {
    it('should emit appropriate events during MCP config lifecycle', async () => {
      const events: any[] = [];

      personaManager.on(PersonaEvents.PERSONA_ACTIVATED, (event) => {
        events.push({ type: 'activated', ...event });
      });

      personaManager.on(PersonaEvents.PERSONA_DEACTIVATED, (event) => {
        events.push({ type: 'deactivated', ...event });
      });

      await personaManager.initialize();

      // Activate persona with MCP config
      await personaManager.activatePersona('persona-with-mcp');

      // Verify activation event contains MCP info
      const activatedEvent = events.find(e => e.type === 'activated');
      expect(activatedEvent).toBeDefined();

      // Check active state metadata
      const activeState = personaManager.getActivePersona();
      expect(activeState?.metadata.mcpConfigApplied).toBe(true);

      // Deactivate
      await personaManager.deactivatePersona();

      const deactivatedEvent = events.find(e => e.type === 'deactivated');
      expect(deactivatedEvent).toBeDefined();
    });

    it('should handle personas without MCP config correctly', async () => {
      await personaManager.initialize();

      const result = await personaManager.activatePersona('persona-without-mcp');
      expect(result.success).toBe(true);

      const activeState = personaManager.getActivePersona();
      expect(activeState?.metadata.mcpConfigApplied).toBe(false);
      expect(activeState?.metadata.mcpConfigWarnings).toHaveLength(0);

      // MCP handlers should not have been called
      expect(mcpHandlers.setCurrentConfig).not.toHaveBeenCalled();
    });
  });

  describe('Error Scenarios and Edge Cases', () => {
    it('should handle missing MCP config handlers gracefully', async () => {
      // Create persona manager without MCP handlers
      const config: PersonaManagerConfig = {
        toolDiscoveryEngine: discoveryEngine,
        autoDiscover: false,
        discoveryConfig: {
          searchPaths: [join(tempDir, 'personas')],
          enableCache: false,
        },
        // No mcpConfigHandlers
      };

      await personaManager.dispose();
      personaManager = new PersonaManager(config);
      await personaManager.initialize();

      // Should still activate but not apply MCP config
      const result = await personaManager.activatePersona('persona-with-mcp');
      expect(result.success).toBe(true);

      const activeState = personaManager.getActivePersona();
      expect(activeState?.metadata.mcpConfigApplied).toBe(false);
    });

    it('should handle invalid MCP config in persona', async () => {
      // Create persona with invalid MCP config
      await env.createAppStructure('personas', {
        'invalid-mcp-persona/persona.yaml': `
name: invalid-mcp-persona
description: Persona with invalid MCP config
version: "1.0"
        `.trim(),
        'invalid-mcp-persona/mcp.json': '{ invalid json content'
      });

      await personaManager.initialize();

      // Should fail validation or provide warnings
      const result = await personaManager.activatePersona('invalid-mcp-persona');

      // Depends on implementation - could succeed with warnings or fail
      if (result.success) {
        expect(result.warnings).toBeDefined();
        expect(result.warnings!.length).toBeGreaterThan(0);
      } else {
        expect(result.errors).toBeDefined();
        expect(result.errors!.some(e => e.includes('MCP') || e.includes('config'))).toBe(true);
      }
    });

    it('should handle connection restart failures', async () => {
      mcpHandlers.restartConnections.mockRejectedValue(new Error('Restart failed'));

      const config: PersonaManagerConfig = {
        toolDiscoveryEngine: discoveryEngine,
        autoDiscover: false,
        discoveryConfig: {
          searchPaths: [join(tempDir, 'personas')],
          enableCache: false,
        },
        mcpConfigHandlers: {
          getCurrentConfig: mcpHandlers.getCurrentConfig,
          setCurrentConfig: mcpHandlers.setCurrentConfig,
          restartConnections: mcpHandlers.restartConnections,
        },
      };

      await personaManager.dispose();
      personaManager = new PersonaManager(config);
      await personaManager.initialize();

      // Should still succeed with warnings
      const result = await personaManager.activatePersona('persona-with-mcp');
      expect(result.success).toBe(true);
      expect(result.warnings).toBeDefined();

      // Config should still be applied
      const activeState = personaManager.getActivePersona();
      expect(activeState?.metadata.mcpConfigApplied).toBe(true);
    });
  });

  /**
   * Setup test personas with various MCP configurations
   */
  async function setupTestPersonas(): Promise<void> {
    // Persona with MCP config
    await env.createAppStructure('personas', {
      'persona-with-mcp/persona.yaml': `
name: persona-with-mcp
description: Persona with MCP configuration
version: "1.0"
toolsets:
  - name: development
    toolIds:
      - git.status
      - filesystem.read
defaultToolset: development
      `.trim(),
      'persona-with-mcp/mcp.json': JSON.stringify({
        mcpServers: {
          'git': {
            command: 'mcp-server-git',
            args: ['--repository', '.']
          },
          'filesystem': {
            command: 'mcp-server-filesystem',
            args: ['--repository', '.']
          }
        }
      }),
      'persona-with-mcp/assets/README.md': 'Persona with MCP config'
    });

    // Complex persona with more servers
    await env.createAppStructure('personas', {
      'complex-persona-with-mcp/persona.yaml': `
name: complex-persona-with-mcp
description: Complex persona with multiple MCP servers
version: "1.0"
toolsets:
  - name: full-stack
    toolIds:
      - git.status
      - filesystem.read
defaultToolset: full-stack
      `.trim(),
      'complex-persona-with-mcp/mcp.json': JSON.stringify({
        mcpServers: {
          'git': {
            command: 'mcp-server-git',
            args: ['--repository', '.'],
            env: {
              'GIT_CONFIG': '/custom/config'
            }
          },
          'docker': {
            command: 'mcp-server-docker',
            args: ['--socket', '/var/run/docker.sock']
          },
          'database': {
            command: 'mcp-server-postgres',
            args: ['--connection', 'postgresql://localhost:5432/test']
          }
        }
      }),
      'complex-persona-with-mcp/assets/README.md': 'Complex persona with MCP'
    });

    // Persona without MCP config
    await env.createAppStructure('personas', {
      'persona-without-mcp/persona.yaml': `
name: persona-without-mcp
description: Simple persona without MCP configuration
version: "1.0"
toolsets:
  - name: basic
    toolIds:
      - git.status
defaultToolset: basic
      `.trim(),
      'persona-without-mcp/assets/README.md': 'Simple persona'
    });
  }
});
