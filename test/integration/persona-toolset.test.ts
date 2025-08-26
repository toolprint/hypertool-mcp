/**
 * Integration tests for Persona + Toolset system interaction
 *
 * This test suite verifies that persona activation correctly integrates with
 * the existing toolset manager system, testing the complete workflow from
 * persona discovery through toolset activation and cleanup.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { vol } from 'memfs';
import { join } from 'path';
import { TestEnvironment } from '../fixtures/base.js';
import { PersonaManager, PersonaManagerConfig } from '../../src/persona/manager.js';
import { ToolsetManager } from '../../src/server/tools/toolset/manager.js';
import { PersonaEvents, PersonaReference } from '../../src/persona/types.js';
import type { IToolDiscoveryEngine } from '../../src/discovery/types.js';
import type { DiscoveredTool } from '../../src/discovery/types.js';

// Mock the IToolDiscoveryEngine for controlled testing
class MockToolDiscoveryEngine implements IToolDiscoveryEngine {
  private tools: DiscoveredTool[] = [
    {
      name: 'git.status',
      description: 'Get git repository status',
      server: 'git',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'git.add',
      description: 'Add files to git staging',
      server: 'git',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'docker.ps',
      description: 'List docker containers',
      server: 'docker',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'filesystem.read',
      description: 'Read file from filesystem',
      server: 'filesystem',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'jest.run',
      description: 'Run jest tests',
      server: 'jest',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'coverage.check',
      description: 'Check test coverage',
      server: 'coverage',
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

  setMockTools(tools: DiscoveredTool[]): void {
    this.tools = tools;
  }

  on(): this { return this; }
  off(): this { return this; }
  emit(): boolean { return true; }
}

describe('Persona + Toolset Integration Tests', () => {
  let env: TestEnvironment;
  let personaManager: PersonaManager;
  let toolsetManager: ToolsetManager;
  let discoveryEngine: MockToolDiscoveryEngine;
  let tempDir: string;

  beforeEach(async () => {
    // Setup test environment with real filesystem operations
    tempDir = '/tmp/hypertool-test-persona-toolset';
    env = new TestEnvironment(tempDir);
    await env.setup();

    // Create discovery engine
    discoveryEngine = new MockToolDiscoveryEngine();

    // Create toolset manager
    toolsetManager = new ToolsetManager();

    // Create persona manager with real integrations
    const config: PersonaManagerConfig = {
      toolDiscoveryEngine: discoveryEngine,
      toolsetManager: toolsetManager,
      autoDiscover: false,
      validateOnActivation: true,
      discoveryConfig: {
        searchPaths: [join(tempDir, 'personas')],
        enableCache: false,
      },
    };

    personaManager = new PersonaManager(config);

    // Setup test personas in filesystem
    await setupTestPersonas();
  });

  afterEach(async () => {
    await personaManager.dispose();
    await env.teardown();
    vol.reset();
  });

  describe('Persona Activation with Toolset Integration', () => {
    it('should activate persona and apply toolset to toolset manager', async () => {
      // Initialize persona manager
      await personaManager.initialize();

      // Verify persona is discovered
      const personas = await personaManager.listPersonas();
      expect(personas).toHaveLength(3);

      const validPersona = personas.find(p => p.name === 'valid-persona');
      expect(validPersona).toBeDefined();
      expect(validPersona?.isValid).toBe(true);

      // Track toolset changes
      const toolsetChanges: any[] = [];
      toolsetManager.on('toolsetChanged', (event) => {
        toolsetChanges.push(event);
      });

      // Activate persona
      const result = await personaManager.activatePersona('valid-persona');

      expect(result.success).toBe(true);
      expect(result.personaName).toBe('valid-persona');
      expect(result.activatedToolset).toBe('development');

      // Verify persona is active
      const activeState = personaManager.getActivePersona();
      expect(activeState).toBeDefined();
      expect(activeState?.persona.config.name).toBe('valid-persona');
      expect(activeState?.activeToolset).toBe('development');

      // Verify toolset was applied to toolset manager
      expect(toolsetChanges).toHaveLength(1);
      const toolsetEvent = toolsetChanges[0];
      expect(toolsetEvent.changeType).toBe('equipped');
      expect(toolsetEvent.newToolset.name).toContain('valid-persona');

      // Verify toolset contains expected tools from persona
      const currentToolset = toolsetManager.getCurrentToolset();
      expect(currentToolset).toBeDefined();
      expect(currentToolset?.tools.some(t =>
        t.namespacedName === 'git.status' || t.toolId === 'git.status'
      )).toBe(true);
      expect(currentToolset?.tools.some(t =>
        t.namespacedName === 'git.add' || t.toolId === 'git.add'
      )).toBe(true);
      expect(currentToolset?.tools.some(t =>
        t.namespacedName === 'docker.ps' || t.toolId === 'docker.ps'
      )).toBe(true);
    });

    it('should switch toolsets within active persona', async () => {
      await personaManager.initialize();

      // Activate persona with default toolset
      await personaManager.activatePersona('valid-persona');

      let activeState = personaManager.getActivePersona();
      expect(activeState?.activeToolset).toBe('development');

      // Switch to testing toolset
      const result = await personaManager.activatePersona('valid-persona', {
        toolsetName: 'testing'
      });

      expect(result.success).toBe(true);
      expect(result.activatedToolset).toBe('testing');

      activeState = personaManager.getActivePersona();
      expect(activeState?.activeToolset).toBe('testing');

      // Verify toolset was updated
      const currentToolset = toolsetManager.getCurrentToolset();
      expect(currentToolset?.tools.some(t =>
        t.namespacedName === 'jest.run' || t.toolId === 'jest.run'
      )).toBe(true);
      expect(currentToolset?.tools.some(t =>
        t.namespacedName === 'coverage.check' || t.toolId === 'coverage.check'
      )).toBe(true);
    });

    it('should handle toolset switching between different personas', async () => {
      await personaManager.initialize();

      // Activate first persona
      await personaManager.activatePersona('valid-persona');
      let activeState = personaManager.getActivePersona();
      expect(activeState?.persona.config.name).toBe('valid-persona');

      // Switch to complex persona
      const result = await personaManager.activatePersona('complex-persona');
      expect(result.success).toBe(true);

      activeState = personaManager.getActivePersona();
      expect(activeState?.persona.config.name).toBe('complex-persona');

      // Verify toolset was switched
      const currentToolset = toolsetManager.getCurrentToolset();
      expect(currentToolset?.name).toContain('complex-persona');
    });

    it('should clean up toolsets on persona deactivation', async () => {
      await personaManager.initialize();

      // Activate persona
      await personaManager.activatePersona('valid-persona');
      expect(personaManager.getActivePersona()).toBeDefined();

      // Track toolset unequip events
      const unequipEvents: any[] = [];
      toolsetManager.on('toolsetUnequipped', (event) => {
        unequipEvents.push(event);
      });

      // Deactivate persona
      const result = await personaManager.deactivatePersona();
      expect(result.success).toBe(true);
      expect(personaManager.getActivePersona()).toBeNull();

      // Verify toolset was cleaned up
      // Note: The exact behavior depends on ToolsetManager implementation
      // This test verifies the integration point exists
      expect(toolsetManager.getCurrentToolset()).toBeUndefined();
    });

    it('should handle invalid toolset references gracefully', async () => {
      await personaManager.initialize();

      // Try to activate persona with non-existent toolset
      const result = await personaManager.activatePersona('valid-persona', {
        toolsetName: 'non-existent-toolset'
      });

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors![0]).toContain('toolset not found');

      // Verify no persona is active
      expect(personaManager.getActivePersona()).toBeNull();
    });

    it('should handle missing tools in discovery engine', async () => {
      // Remove some tools from discovery engine
      discoveryEngine.setMockTools([
        {
          name: 'git.status',
          description: 'Get git repository status',
          server: 'git',
          inputSchema: { type: 'object', properties: {} },
        }
        // Missing git.add, docker.ps, filesystem.read
      ]);

      await personaManager.initialize();

      const result = await personaManager.activatePersona('valid-persona');

      // Should still succeed but with warnings
      expect(result.success).toBe(true);
      expect(result.warnings).toBeDefined();
      expect(result.warnings!.length).toBeGreaterThan(0);

      // Verify only available tools are in the toolset
      const currentToolset = toolsetManager.getCurrentToolset();
      expect(currentToolset?.tools.length).toBeLessThan(4);
      expect(currentToolset?.tools.some(t =>
        t.namespacedName === 'git.status' || t.toolId === 'git.status'
      )).toBe(true);
    });

    it('should emit correct events during persona and toolset lifecycle', async () => {
      await personaManager.initialize();

      // Track persona events
      const personaEvents: any[] = [];
      personaManager.on(PersonaEvents.PERSONA_ACTIVATED, (event) => {
        personaEvents.push({ type: 'activated', ...event });
      });
      personaManager.on(PersonaEvents.PERSONA_DEACTIVATED, (event) => {
        personaEvents.push({ type: 'deactivated', ...event });
      });
      personaManager.on(PersonaEvents.PERSONA_TOOLSET_CHANGED, (event) => {
        personaEvents.push({ type: 'toolset_changed', ...event });
      });

      // Activate persona
      await personaManager.activatePersona('valid-persona');
      expect(personaEvents.filter(e => e.type === 'activated')).toHaveLength(1);

      // Switch toolset
      await personaManager.activatePersona('valid-persona', {
        toolsetName: 'testing'
      });
      expect(personaEvents.filter(e => e.type === 'toolset_changed')).toHaveLength(1);

      // Deactivate persona
      await personaManager.deactivatePersona();
      expect(personaEvents.filter(e => e.type === 'deactivated')).toHaveLength(1);

      // Verify event data
      const activatedEvent = personaEvents.find(e => e.type === 'activated');
      expect(activatedEvent.persona.name).toBe('valid-persona');
      expect(activatedEvent.toolset).toBe('development');

      const deactivatedEvent = personaEvents.find(e => e.type === 'deactivated');
      expect(deactivatedEvent.persona.name).toBe('valid-persona');
    });

    it('should handle concurrent persona activation attempts', async () => {
      await personaManager.initialize();

      // Attempt to activate multiple personas concurrently
      const results = await Promise.allSettled([
        personaManager.activatePersona('valid-persona'),
        personaManager.activatePersona('complex-persona'),
        personaManager.activatePersona('valid-persona', { toolsetName: 'testing' })
      ]);

      // At least one should succeed
      const successes = results.filter(r =>
        r.status === 'fulfilled' && r.value.success
      ).length;
      expect(successes).toBeGreaterThan(0);

      // Verify only one persona is active
      const activeState = personaManager.getActivePersona();
      expect(activeState).toBeDefined();
      expect(['valid-persona', 'complex-persona']).toContain(
        activeState?.persona.config.name
      );
    });
  });

  describe('Performance and Resource Management', () => {
    it('should handle activation/deactivation cycles efficiently', async () => {
      await personaManager.initialize();

      const startTime = Date.now();

      // Perform multiple activation/deactivation cycles
      for (let i = 0; i < 5; i++) {
        await personaManager.activatePersona('valid-persona');
        await personaManager.deactivatePersona();
      }

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Should complete reasonably quickly (less than 5 seconds)
      expect(duration).toBeLessThan(5000);
    });

    it('should clean up resources properly after multiple operations', async () => {
      await personaManager.initialize();

      // Perform various operations
      await personaManager.activatePersona('valid-persona');
      await personaManager.activatePersona('complex-persona');
      await personaManager.activatePersona('valid-persona', { toolsetName: 'testing' });
      await personaManager.deactivatePersona();

      // Get stats before disposal
      const statsBefore = personaManager.getStats();
      expect(statsBefore.activePersona).toBeNull();

      // Dispose and verify cleanup
      await personaManager.dispose();

      // Verify manager is properly cleaned up
      expect(() => personaManager.getActivePersona()).not.toThrow();
      expect(personaManager.getActivePersona()).toBeNull();
    });
  });

  /**
   * Setup test personas in the filesystem
   */
  async function setupTestPersonas(): Promise<void> {
    const personasDir = join(tempDir, 'personas');

    // Valid persona
    await env.createAppStructure('personas', {
      'valid-persona/persona.yaml': `
name: valid-persona
description: A complete valid persona for testing
version: "1.0"
toolsets:
  - name: development
    toolIds:
      - git.status
      - git.add
      - docker.ps
      - filesystem.read
  - name: testing
    toolIds:
      - jest.run
      - coverage.check
defaultToolset: development
metadata:
  author: Test Suite
  tags:
    - development
    - testing
  created: "2024-01-01T00:00:00Z"
  lastModified: "2024-01-01T12:00:00Z"
      `.trim(),
      'valid-persona/assets/README.md': 'Valid persona for testing'
    });

    // Complex persona
    await env.createAppStructure('personas', {
      'complex-persona/persona.yaml': `
name: complex-persona
description: Complex persona with multiple toolsets
version: "2.0"
toolsets:
  - name: full-stack
    toolIds:
      - git.status
      - git.add
      - docker.ps
      - filesystem.read
      - jest.run
      - coverage.check
defaultToolset: full-stack
metadata:
  author: Test Suite
  tags:
    - complex
    - full-stack
  created: "2024-01-01T00:00:00Z"
  lastModified: "2024-01-01T12:00:00Z"
      `.trim(),
      'complex-persona/assets/config.json': '{"complex": true}',
      'complex-persona/mcp.json': JSON.stringify({
        mcpServers: {
          'git': {
            command: 'mcp-server-git',
            args: ['--repository', '.']
          }
        }
      })
    });

    // Minimal persona
    await env.createAppStructure('personas', {
      'minimal-persona/persona.yaml': `
name: minimal-persona
description: Minimal persona for testing
version: "1.0"
      `.trim(),
      'minimal-persona/assets/README.md': 'Minimal persona'
    });
  }
});
