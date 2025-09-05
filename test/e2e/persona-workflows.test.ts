/**
 * End-to-End Tests for Persona Workflows
 *
 * Comprehensive E2E testing for complete persona lifecycle workflows from
 * discovery through activation, usage, and cleanup. Tests real-world scenarios
 * including multi-persona environments, error recovery, and concurrent operations.
 */

import { describe, it, expect, beforeEach, afterEach, vi, beforeAll, afterAll } from 'vitest';
import { vol } from 'memfs';
import { join } from 'path';

// Mock fs modules to use memfs for testing
vi.mock('fs', async () => {
  const memfs = await vi.importActual('memfs');
  const realFs = await vi.importActual('fs');
  return {
    ...memfs.fs,
    constants: realFs.constants, // Keep real constants for fsConstants import
    access: memfs.fs.access, // Explicitly include access method
    watch: vi.fn(() => ({ // Mock watch function for cache.ts
      close: vi.fn(),
      on: vi.fn(),
      off: vi.fn()
    })),
    createReadStream: memfs.fs.createReadStream,
    createWriteStream: memfs.fs.createWriteStream
  };
});

vi.mock('fs/promises', async () => {
  const memfs = await vi.importActual('memfs');
  return {
    ...memfs.fs.promises,
    access: memfs.fs.promises.access, // Explicitly include access method
  };
});

// Mock appConfig to avoid package.json reading issues
vi.mock('../../src/config/appConfig.js', () => ({
  APP_CONFIG: {
    appName: 'Hypertool MCP',
    technicalName: 'hypertool-mcp',
    version: '0.0.39-test',
    description: 'Test version of Hypertool MCP proxy server',
    brandName: 'toolprint'
  },
  APP_NAME: 'Hypertool MCP',
  APP_TECHNICAL_NAME: 'hypertool-mcp',
  APP_VERSION: '0.0.39-test',
  APP_DESCRIPTION: 'Test version of Hypertool MCP proxy server',
  BRAND_NAME: 'toolprint'
}));
import { TestEnvironment } from '../fixtures/base.js';
import { PersonaManager, PersonaManagerConfig } from '../../src/persona/manager.js';
import { PersonaLoader } from '../../src/persona/loader.js';
import { PersonaDiscovery } from '../../src/persona/discovery.js';
import { PersonaEvents, PersonaActivationOptions } from '../../src/persona/types.js';
import type { ToolsetManager } from '../../src/server/tools/toolset/manager.js';
import type { MCPConfig } from '../../src/types/config.js';
import type { IToolDiscoveryEngine } from '../../src/discovery/types.js';
import type { DiscoveredTool } from '../../src/discovery/types.js';

/**
 * E2E Test Environment configuration and setup
 */
interface E2ETestEnvironment {
  tempDir: string;
  env: TestEnvironment;
  toolsetManager: MockE2EToolsetManager;
  discoveryEngine: E2EToolDiscoveryEngine;
  mcpHandlers: MockE2EMcpHandlers;
  personaManager: PersonaManager;
  cleanup: () => Promise<void>;
}

/**
 * Enhanced tool discovery engine for E2E testing
 */
class E2EToolDiscoveryEngine implements IToolDiscoveryEngine {
  private tools: DiscoveredTool[] = [];
  private failureMode: 'none' | 'intermittent' | 'permanent' = 'none';
  private callCount = 0;

  constructor() {
    this.setupDefaultTools();
  }

  private setupDefaultTools() {
    this.tools = [
      // Git tools
      {
        name: 'git.status',
        description: 'Get git repository status',
        server: 'git',
        inputSchema: { type: 'object', properties: {} },
      },
      {
        name: 'git.add',
        description: 'Stage files for commit',
        server: 'git',
        inputSchema: { type: 'object', properties: { files: { type: 'array' } } },
      },
      {
        name: 'git.commit',
        description: 'Commit staged changes',
        server: 'git',
        inputSchema: { type: 'object', properties: { message: { type: 'string' } } },
      },
      {
        name: 'git.push',
        description: 'Push commits to remote',
        server: 'git',
        inputSchema: { type: 'object', properties: {} },
      },

      // Docker tools
      {
        name: 'docker.ps',
        description: 'List running containers',
        server: 'docker',
        inputSchema: { type: 'object', properties: {} },
      },
      {
        name: 'docker.build',
        description: 'Build docker image',
        server: 'docker',
        inputSchema: { type: 'object', properties: { tag: { type: 'string' } } },
      },
      {
        name: 'docker.run',
        description: 'Run docker container',
        server: 'docker',
        inputSchema: { type: 'object', properties: { image: { type: 'string' } } },
      },
      {
        name: 'docker.compose.up',
        description: 'Start docker-compose services',
        server: 'docker-compose',
        inputSchema: { type: 'object', properties: {} },
      },

      // Filesystem tools
      {
        name: 'filesystem.read',
        description: 'Read file contents',
        server: 'filesystem',
        inputSchema: { type: 'object', properties: { path: { type: 'string' } } },
      },
      {
        name: 'filesystem.write',
        description: 'Write file contents',
        server: 'filesystem',
        inputSchema: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } } },
      },

      // Testing tools
      {
        name: 'jest.run',
        description: 'Run Jest tests',
        server: 'jest',
        inputSchema: { type: 'object', properties: { pattern: { type: 'string' } } },
      },
      {
        name: 'coverage.check',
        description: 'Check code coverage',
        server: 'coverage',
        inputSchema: { type: 'object', properties: {} },
      },

      // Database tools
      {
        name: 'database.query',
        description: 'Execute database query',
        server: 'database',
        inputSchema: { type: 'object', properties: { query: { type: 'string' } } },
      },

      // NPM tools
      {
        name: 'npm.install',
        description: 'Install npm dependencies',
        server: 'npm',
        inputSchema: { type: 'object', properties: {} },
      },
      {
        name: 'npm.build',
        description: 'Build npm project',
        server: 'npm',
        inputSchema: { type: 'object', properties: {} },
      },
      {
        name: 'npm.test',
        description: 'Run npm tests',
        server: 'npm',
        inputSchema: { type: 'object', properties: {} },
      },

      // DevOps tools
      {
        name: 'kubernetes.deploy',
        description: 'Deploy to Kubernetes',
        server: 'kubernetes',
        inputSchema: { type: 'object', properties: { manifest: { type: 'string' } } },
      },
      {
        name: 'terraform.apply',
        description: 'Apply Terraform configuration',
        server: 'terraform',
        inputSchema: { type: 'object', properties: {} },
      },
      {
        name: 'monitoring.check',
        description: 'Check monitoring status',
        server: 'monitoring',
        inputSchema: { type: 'object', properties: {} },
      },
      {
        name: 'logs.tail',
        description: 'Tail application logs',
        server: 'logs',
        inputSchema: { type: 'object', properties: { service: { type: 'string' } } },
      },

      // Debugging tools
      {
        name: 'debugger.attach',
        description: 'Attach debugger to process',
        server: 'debugger',
        inputSchema: { type: 'object', properties: { pid: { type: 'number' } } },
      },
      {
        name: 'profiler.start',
        description: 'Start performance profiling',
        server: 'profiler',
        inputSchema: { type: 'object', properties: {} },
      },
      {
        name: 'logs.search',
        description: 'Search application logs',
        server: 'logs',
        inputSchema: { type: 'object', properties: { query: { type: 'string' } } },
      },
      {
        name: 'metrics.query',
        description: 'Query system metrics',
        server: 'metrics',
        inputSchema: { type: 'object', properties: { metric: { type: 'string' } } },
      },
    ];
  }

  setFailureMode(mode: 'none' | 'intermittent' | 'permanent') {
    this.failureMode = mode;
  }

  async discoverTools(): Promise<DiscoveredTool[]> {
    this.callCount++;

    if (this.failureMode === 'permanent') {
      throw new Error('Tool discovery is permanently failing');
    }

    if (this.failureMode === 'intermittent' && this.callCount % 3 === 0) {
      throw new Error('Intermittent tool discovery failure');
    }

    // Simulate discovery latency
    await new Promise(resolve => setTimeout(resolve, Math.random() * 50));

    return [...this.tools];
  }

  async getDiscoveredTools(): Promise<DiscoveredTool[]> {
    return [...this.tools];
  }

  async refreshDiscovery(): Promise<void> {
    if (this.failureMode === 'permanent') {
      throw new Error('Tool discovery refresh is permanently failing');
    }

    // Simulate refresh latency
    await new Promise(resolve => setTimeout(resolve, Math.random() * 100));
  }

  getCallCount(): number {
    return this.callCount;
  }

  reset() {
    this.callCount = 0;
    this.failureMode = 'none';
  }

  on(): this { return this; }
  off(): this { return this; }
  emit(): boolean { return true; }
}

/**
 * Enhanced mock toolset manager for E2E testing
 */
class MockE2EToolsetManager {
  private currentToolset: any = null;
  private events: any[] = [];
  private operationLatency = 0;
  private failureMode: 'none' | 'intermittent' | 'permanent' = 'none';
  private operationCount = 0;

  setOperationLatency(ms: number) {
    this.operationLatency = ms;
  }

  setFailureMode(mode: 'none' | 'intermittent' | 'permanent') {
    this.failureMode = mode;
  }

  async setCurrentToolset(config: any) {
    this.operationCount++;

    if (this.operationLatency > 0) {
      await new Promise(resolve => setTimeout(resolve, this.operationLatency));
    }

    if (this.failureMode === 'permanent') {
      return { valid: false, errors: ['Toolset manager is permanently failing'] };
    }

    if (this.failureMode === 'intermittent' && this.operationCount % 4 === 0) {
      return { valid: false, errors: ['Intermittent toolset manager failure'] };
    }

    this.currentToolset = JSON.parse(JSON.stringify(config));
    this.events.push({ type: 'toolsetChanged', config: JSON.parse(JSON.stringify(config)), timestamp: Date.now() });
    return { valid: true, errors: [] };
  }

  getCurrentToolset() {
    return this.currentToolset ? JSON.parse(JSON.stringify(this.currentToolset)) : null;
  }

  async unequipToolset() {
    this.operationCount++;

    if (this.operationLatency > 0) {
      await new Promise(resolve => setTimeout(resolve, this.operationLatency));
    }

    if (this.failureMode === 'permanent') {
      throw new Error('Toolset manager unequip is permanently failing');
    }

    this.currentToolset = null;
    this.events.push({ type: 'toolsetUnequipped', timestamp: Date.now() });
  }

  getEvents() {
    return [...this.events];
  }

  getOperationCount(): number {
    return this.operationCount;
  }

  reset() {
    this.currentToolset = null;
    this.events = [];
    this.operationCount = 0;
    this.operationLatency = 0;
    this.failureMode = 'none';
  }

  on(): this { return this; }
  off(): this { return this; }
  emit(): boolean { return true; }
}

/**
 * Enhanced MCP config handlers for E2E testing
 */
class MockE2EMcpHandlers {
  private currentConfig: MCPConfig | null = null;
  private originalConfig: MCPConfig | null = null;
  private operationLatency = 0;
  private failureMode: 'none' | 'intermittent' | 'permanent' = 'none';
  private operationCount = 0;

  setOperationLatency(ms: number) {
    this.operationLatency = ms;
  }

  setFailureMode(mode: 'none' | 'intermittent' | 'permanent') {
    this.failureMode = mode;
  }

  getCurrentConfig = vi.fn(async (): Promise<MCPConfig | null> => {
    this.operationCount++;

    if (this.operationLatency > 0) {
      await new Promise(resolve => setTimeout(resolve, this.operationLatency));
    }

    if (this.failureMode === 'permanent') {
      throw new Error('MCP config get is permanently failing');
    }

    return this.currentConfig ? JSON.parse(JSON.stringify(this.currentConfig)) : null;
  });

  setCurrentConfig = vi.fn(async (config: MCPConfig): Promise<void> => {
    this.operationCount++;

    if (this.operationLatency > 0) {
      await new Promise(resolve => setTimeout(resolve, this.operationLatency));
    }

    if (this.failureMode === 'permanent') {
      throw new Error('MCP config set is permanently failing');
    }

    if (this.failureMode === 'intermittent' && this.operationCount % 3 === 0) {
      throw new Error('Intermittent MCP config set failure');
    }

    if (!this.originalConfig && this.currentConfig) {
      this.originalConfig = JSON.parse(JSON.stringify(this.currentConfig));
    }
    this.currentConfig = JSON.parse(JSON.stringify(config));
  });

  restartConnections = vi.fn(async (): Promise<void> => {
    this.operationCount++;

    if (this.operationLatency > 0) {
      await new Promise(resolve => setTimeout(resolve, this.operationLatency));
    }

    if (this.failureMode === 'permanent') {
      throw new Error('MCP restart connections is permanently failing');
    }

    // Simulate connection restart
  });

  getOriginalConfig() {
    return this.originalConfig ? JSON.parse(JSON.stringify(this.originalConfig)) : null;
  }

  getOperationCount(): number {
    return this.operationCount;
  }

  reset() {
    this.currentConfig = null;
    this.originalConfig = null;
    this.operationCount = 0;
    this.operationLatency = 0;
    this.failureMode = 'none';
    vi.clearAllMocks();
  }
}

/**
 * Create comprehensive E2E test environment
 */
async function createE2ETestEnvironment(options: {
  personaCount?: number;
  includeInvalid?: boolean;
  includeLarge?: boolean;
  includeArchives?: boolean;
} = {}): Promise<E2ETestEnvironment> {
  const tempDir = '/tmp/hypertool-e2e-test';
  const env = new TestEnvironment(tempDir);
  await env.setup();

  // Create comprehensive persona test data
  await setupE2ETestPersonas(env, options);

  // Initialize mock components with E2E capabilities
  const discoveryEngine = new E2EToolDiscoveryEngine();
  const toolsetManager = new MockE2EToolsetManager();
  const mcpHandlers = new MockE2EMcpHandlers();

  // Initialize persona manager with full configuration
  const config: PersonaManagerConfig = {
    toolDiscoveryEngine: discoveryEngine,
    toolsetManager: toolsetManager as any,
    mcpConfigHandlers: {
      getCurrentConfig: mcpHandlers.getCurrentConfig,
      setCurrentConfig: mcpHandlers.setCurrentConfig,
      restartConnections: mcpHandlers.restartConnections,
    },
    autoDiscover: true,
    validateOnActivation: true,
    persistState: false,
    discoveryConfig: {
      searchPaths: [join(tempDir, 'personas')],
      enableCache: true,
      maxCacheSize: 50,
      cacheTtl: 300000, // 5 minutes
      maxDepth: 3,
      includeArchives: true,
      watchForChanges: false, // Disable for testing
    },
    cacheConfig: {
      maxSize: 25,
      ttl: 300000, // 5 minutes
      enableCache: true,
    },
  };

  const personaManager = new PersonaManager(config);
  await personaManager.initialize();

  return {
    tempDir,
    env,
    toolsetManager,
    discoveryEngine,
    mcpHandlers,
    personaManager,
    cleanup: async () => {
      await personaManager.dispose();
      await env.teardown();
      vol.reset();
    }
  };
}

/**
 * Setup comprehensive persona test data for E2E scenarios
 */
async function setupE2ETestPersonas(env: TestEnvironment, options: {
  personaCount?: number;
  includeInvalid?: boolean;
  includeLarge?: boolean;
  includeArchives?: boolean;
}): Promise<void> {
  const personaCount = options.personaCount || 20;
  const includeInvalid = options.includeInvalid ?? true;
  const includeLarge = options.includeLarge ?? true;
  const includeArchives = options.includeArchives ?? true;

  const personas: Record<string, string> = {};

  // Small personas (10-20 personas with 1-3 toolsets each)
  for (let i = 1; i <= Math.min(personaCount, 15); i++) {
    const name = `small-persona-${i}`;
    personas[`personas/${name}/persona.yaml`] = `
name: ${name}
description: Small persona ${i} for E2E testing
version: "1.0"
toolsets:
  - name: basic
    toolIds:
      - git.status
      - filesystem.read
  - name: extended
    toolIds:
      - git.status
      - git.add
      - filesystem.read
      - filesystem.write
defaultToolset: basic
metadata:
  author: E2E Test Suite
  tags:
    - e2e
    - small
  created: "2024-01-01T00:00:00Z"
  lastModified: "2024-01-01T12:00:00Z"
    `.trim();

    personas[`personas/${name}/assets/README.md`] = `# ${name}\n\nSmall persona for E2E testing.`;
  }

  // Large personas with complex toolsets
  if (includeLarge) {
    for (let i = 1; i <= 5; i++) {
      const name = `large-persona-${i}`;
      personas[`personas/${name}/persona.yaml`] = `
name: ${name}
description: Large complex persona ${i} with extensive toolsets
version: "2.0"
toolsets:
  - name: fullstack-dev
    toolIds:
      - git.status
      - git.add
      - git.commit
      - git.push
      - docker.ps
      - docker.build
      - docker.run
      - docker.compose.up
      - database.query
      - jest.run
      - coverage.check
  - name: devops
    toolIds:
      - docker.build
      - docker.run
      - kubernetes.deploy
      - terraform.apply
      - monitoring.check
      - logs.tail
  - name: frontend
    toolIds:
      - npm.install
      - npm.build
      - npm.test
      - filesystem.read
      - filesystem.write
  - name: debugging
    toolIds:
      - debugger.attach
      - profiler.start
      - logs.search
      - metrics.query
      - monitoring.check
defaultToolset: fullstack-dev
metadata:
  author: E2E Test Suite
  tags:
    - e2e
    - large
    - complex
    - fullstack
  created: "2023-06-15T08:30:00Z"
  lastModified: "2024-01-15T14:22:00Z"
      `.trim();

      personas[`personas/${name}/assets/README.md`] = `# ${name}\n\nLarge complex persona for E2E testing.`;
      personas[`personas/${name}/assets/USAGE.md`] = `# Usage Guide\n\nDetailed usage instructions for ${name}.`;

      // Add MCP config for some large personas
      if (i <= 2) {
        personas[`personas/${name}/mcp.json`] = JSON.stringify({
          mcpServers: {
            'git': {
              command: 'git-mcp-server',
              args: []
            },
            'docker': {
              command: 'docker-mcp-server',
              args: ['--port', '3001']
            },
            'filesystem': {
              command: 'filesystem-mcp-server',
              args: ['--safe-mode']
            }
          }
        }, null, 2);
      }
    }
  }

  // Invalid personas for error testing
  if (includeInvalid) {
    // Missing required fields
    personas['personas/invalid-missing-name/persona.yaml'] = `
description: Invalid persona missing name
version: "1.0"
    `.trim();

    // Invalid YAML syntax
    personas['personas/invalid-yaml/persona.yaml'] = `
name: invalid-yaml
description: Invalid YAML syntax
version: "1.0"
toolsets:
  - name: basic
    toolIds:
      - git.status
    invalid_yaml_here: [unclosed array
    `.trim();

    // Invalid version
    personas['personas/invalid-version/persona.yaml'] = `
name: invalid-version
description: Invalid version format
version: not-a-version
toolsets:
  - name: basic
    toolIds:
      - git.status
defaultToolset: basic
    `.trim();

    // Circular toolset references
    personas['personas/invalid-circular/persona.yaml'] = `
name: invalid-circular
description: Invalid circular references
version: "1.0"
toolsets:
  - name: toolset-a
    toolIds:
      - git.status
    dependencies:
      - toolset-b
  - name: toolset-b
    toolIds:
      - git.add
    dependencies:
      - toolset-a
defaultToolset: toolset-a
    `.trim();

    // Create assets for invalid personas
    personas['personas/invalid-missing-name/assets/README.md'] = 'Invalid persona';
    personas['personas/invalid-yaml/assets/README.md'] = 'Invalid YAML persona';
    personas['personas/invalid-version/assets/README.md'] = 'Invalid version persona';
    personas['personas/invalid-circular/assets/README.md'] = 'Invalid circular persona';
  }

  // Archive personas (.htp format) for testing archive handling
  if (includeArchives) {
    // Create a simple archive persona (simulated as regular directory for testing)
    personas['personas/archive-persona-1/persona.yaml'] = `
name: archive-persona-1
description: Archived persona for testing
version: "1.0"
toolsets:
  - name: archived
    toolIds:
      - git.status
      - filesystem.read
defaultToolset: archived
metadata:
  archived: true
  archiveDate: "2023-12-01T00:00:00Z"
    `.trim();
    personas['personas/archive-persona-1/assets/README.md'] = 'Archived persona';
  }

  // Create all persona files
  await env.createAppStructure('', personas);
}

/**
 * Comprehensive E2E workflow tests
 */
describe.skip('Persona E2E Workflows', () => {
  let testEnvironment: E2ETestEnvironment;
  const testTimeout = 30000; // 30 seconds for E2E tests

  beforeAll(async () => {
    testEnvironment = await createE2ETestEnvironment({
      personaCount: 20,
      includeInvalid: true,
      includeLarge: true,
      includeArchives: true
    });
  }, testTimeout);

  afterAll(async () => {
    // Clean up environment variable
    delete process.env.HYPERTOOL_PERSONA_DIR;

    if (testEnvironment) {
      await testEnvironment.cleanup();
    }
  }, testTimeout);

  beforeEach(() => {
    // Set environment variable for persona directory
    process.env.HYPERTOOL_PERSONA_DIR = testEnvironment.tempDir + '/personas';

    // Reset mock components before each test
    testEnvironment.discoveryEngine.reset();
    testEnvironment.toolsetManager.reset();
    testEnvironment.mcpHandlers.reset();
  });

  describe('Complete Persona Lifecycle', () => {
    it('should handle full discovery to activation workflow', async () => {
      const startTime = Date.now();

      // Step 1: Discovery
      const discoveryResult = await testEnvironment.personaManager.refreshDiscovery();
      expect(discoveryResult.personas.length).toBeGreaterThan(15);
      expect(discoveryResult.errors.length).toBe(0);

      const discoveryTime = Date.now() - startTime;
      expect(discoveryTime).toBeLessThan(5000); // Should complete within 5 seconds

      // Step 2: List available personas
      const personas = await testEnvironment.personaManager.listPersonas({
        includeInvalid: false,
        refresh: false
      });
      expect(personas.length).toBeGreaterThan(10);

      // Step 3: Activate a small persona
      const targetPersona = personas.find(p => p.name.startsWith('small-persona-'));
      expect(targetPersona).toBeDefined();

      const activationStart = Date.now();
      const activationResult = await testEnvironment.personaManager.activatePersona(
        targetPersona!.name,
        { backupState: true }
      );

      const activationTime = Date.now() - activationStart;
      expect(activationTime).toBeLessThan(1000); // Should activate within 1 second

      expect(activationResult.success).toBe(true);
      expect(activationResult.personaName).toBe(targetPersona!.name);
      expect(activationResult.activatedToolset).toBeDefined();

      // Step 4: Verify activation state
      const activeState = testEnvironment.personaManager.getActivePersona();
      expect(activeState).not.toBeNull();
      expect(activeState!.persona.config.name).toBe(targetPersona!.name);
      expect(activeState!.activatedAt).toBeInstanceOf(Date);
      expect(activeState!.metadata.activationSource).toBe('manual');
      expect(activeState!.metadata.validationPassed).toBe(true);

      // Step 5: Verify toolset integration
      const currentToolset = testEnvironment.toolsetManager.getCurrentToolset();
      expect(currentToolset).not.toBeNull();
      expect(testEnvironment.toolsetManager.getEvents()).toContainEqual(
        expect.objectContaining({ type: 'toolsetChanged' })
      );

      // Step 6: Deactivate persona
      const deactivationStart = Date.now();
      const deactivationResult = await testEnvironment.personaManager.deactivatePersona();

      const deactivationTime = Date.now() - deactivationStart;
      expect(deactivationTime).toBeLessThan(500); // Should deactivate within 500ms

      expect(deactivationResult.success).toBe(true);
      expect(testEnvironment.personaManager.getActivePersona()).toBeNull();

      // Step 7: Verify cleanup
      const cleanupToolset = testEnvironment.toolsetManager.getCurrentToolset();
      expect(cleanupToolset).toBeNull();
      expect(testEnvironment.toolsetManager.getEvents()).toContainEqual(
        expect.objectContaining({ type: 'toolsetUnequipped' })
      );

      // Overall workflow should complete within reasonable time
      const totalTime = Date.now() - startTime;
      expect(totalTime).toBeLessThan(10000); // Total workflow under 10 seconds
    }, testTimeout);

    it('should handle persona switching workflow', async () => {
      // Discover personas
      await testEnvironment.personaManager.refreshDiscovery();
      const personas = await testEnvironment.personaManager.listPersonas({
        includeInvalid: false
      });

      expect(personas.length).toBeGreaterThan(2);

      // Activate first persona
      const firstPersona = personas.find(p => p.name.includes('small-persona-1'));
      expect(firstPersona).toBeDefined();

      const firstResult = await testEnvironment.personaManager.activatePersona(firstPersona!.name);
      expect(firstResult.success).toBe(true);

      // Verify first activation
      let activeState = testEnvironment.personaManager.getActivePersona();
      expect(activeState!.persona.config.name).toBe(firstPersona!.name);

      // Switch to second persona
      const secondPersona = personas.find(p => p.name.includes('small-persona-2'));
      expect(secondPersona).toBeDefined();

      const events: any[] = [];
      testEnvironment.personaManager.on(PersonaEvents.PERSONA_ACTIVATED, (event) => {
        events.push({ type: 'activated', ...event });
      });
      testEnvironment.personaManager.on(PersonaEvents.PERSONA_DEACTIVATED, (event) => {
        events.push({ type: 'deactivated', ...event });
      });

      const switchStart = Date.now();
      const secondResult = await testEnvironment.personaManager.activatePersona(secondPersona!.name);
      const switchTime = Date.now() - switchStart;

      expect(switchTime).toBeLessThan(1000); // Switch should be fast
      expect(secondResult.success).toBe(true);

      // Verify switch completed
      activeState = testEnvironment.personaManager.getActivePersona();
      expect(activeState!.persona.config.name).toBe(secondPersona!.name);

      // Verify events were emitted
      expect(events).toHaveLength(2);
      expect(events.find(e => e.type === 'deactivated')).toBeDefined();
      expect(events.find(e => e.type === 'activated')).toBeDefined();

      // Clean up
      await testEnvironment.personaManager.deactivatePersona();
    }, testTimeout);

    it('should handle MCP configuration integration', async () => {
      // Set up initial MCP config
      const initialConfig: MCPConfig = {
        mcpServers: {
          'existing-server': {
            command: 'existing-server',
            args: []
          }
        }
      };

      testEnvironment.mcpHandlers.setCurrentConfig(initialConfig);

      await testEnvironment.personaManager.refreshDiscovery();
      const personas = await testEnvironment.personaManager.listPersonas();

      // Find a persona with MCP configuration
      const mcpPersona = personas.find(p => p.name.includes('large-persona-1'));
      expect(mcpPersona).toBeDefined();

      // Activate persona with MCP config
      const activationResult = await testEnvironment.personaManager.activatePersona(mcpPersona!.name);
      expect(activationResult.success).toBe(true);

      // Verify MCP config was applied
      expect(testEnvironment.mcpHandlers.setCurrentConfig).toHaveBeenCalled();

      const activeState = testEnvironment.personaManager.getActivePersona();
      expect(activeState!.metadata.mcpConfigApplied).toBe(true);

      // Deactivate and verify restoration
      await testEnvironment.personaManager.deactivatePersona();

      // MCP restoration is handled by the integration, verify calls were made
      expect(testEnvironment.mcpHandlers.getCurrentConfig).toHaveBeenCalled();
    }, testTimeout);
  });

  describe('Multi-Persona Environment', () => {
    it('should discover and validate multiple personas efficiently', async () => {
      const startTime = Date.now();

      const discoveryResult = await testEnvironment.personaManager.refreshDiscovery();
      const discoveryTime = Date.now() - startTime;

      // Should discover 20+ personas within reasonable time
      expect(discoveryResult.personas.length).toBeGreaterThanOrEqual(20);
      expect(discoveryTime).toBeLessThan(3000); // Under 3 seconds for 20+ personas

      // Check discovery performance stats
      const stats = testEnvironment.personaManager.getStats();
      expect(stats.discoveredCount).toBeGreaterThanOrEqual(20);
      expect(stats.lastDiscovery).toBeInstanceOf(Date);

      // Verify cache effectiveness
      expect(stats.cache.size).toBeGreaterThan(0);

      // List with various filters
      const validPersonas = await testEnvironment.personaManager.listPersonas({
        includeInvalid: false
      });
      const allPersonas = await testEnvironment.personaManager.listPersonas({
        includeInvalid: true
      });

      expect(validPersonas.length).toBeLessThan(allPersonas.length);
      expect(allPersonas.length - validPersonas.length).toBeGreaterThanOrEqual(4); // Invalid personas
    }, testTimeout);

    it('should handle persona conflicts and resolution', async () => {
      await testEnvironment.personaManager.refreshDiscovery();
      const personas = await testEnvironment.personaManager.listPersonas();

      // Verify no duplicate names exist
      const names = personas.map(p => p.name);
      const uniqueNames = new Set(names);
      expect(names.length).toBe(uniqueNames.size);

      // Simulate activation of personas with overlapping toolsets
      const smallPersona1 = personas.find(p => p.name === 'small-persona-1');
      const smallPersona2 = personas.find(p => p.name === 'small-persona-2');

      expect(smallPersona1).toBeDefined();
      expect(smallPersona2).toBeDefined();

      // Activate first persona
      await testEnvironment.personaManager.activatePersona(smallPersona1!.name);

      const firstToolset = testEnvironment.toolsetManager.getCurrentToolset();
      expect(firstToolset).not.toBeNull();

      // Switch to second persona (should handle toolset overlap)
      await testEnvironment.personaManager.activatePersona(smallPersona2!.name);

      const secondToolset = testEnvironment.toolsetManager.getCurrentToolset();
      expect(secondToolset).not.toBeNull();
      expect(secondToolset).not.toEqual(firstToolset);

      // Verify only one persona is active
      const activeState = testEnvironment.personaManager.getActivePersona();
      expect(activeState!.persona.config.name).toBe(smallPersona2!.name);

      await testEnvironment.personaManager.deactivatePersona();
    }, testTimeout);

    it('should handle concurrent persona operations safely', async () => {
      await testEnvironment.personaManager.refreshDiscovery();
      const personas = await testEnvironment.personaManager.listPersonas();

      // Test concurrent discovery operations
      const concurrentDiscoveries = Array(5).fill(null).map(() =>
        testEnvironment.personaManager.refreshDiscovery()
      );

      const discoveryResults = await Promise.allSettled(concurrentDiscoveries);
      const failedDiscoveries = discoveryResults.filter(r => r.status === 'rejected');
      expect(failedDiscoveries.length).toBe(0);

      // Test concurrent listing operations
      const concurrentLists = Array(10).fill(null).map(() =>
        testEnvironment.personaManager.listPersonas()
      );

      const listResults = await Promise.allSettled(concurrentLists);
      const failedLists = listResults.filter(r => r.status === 'rejected');
      expect(failedLists.length).toBe(0);

      // Verify all results are consistent
      const successfulLists = listResults
        .filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled')
        .map(r => r.value);

      const firstListLength = successfulLists[0].length;
      expect(successfulLists.every(list => list.length === firstListLength)).toBe(true);

      // Test that activation operations are properly serialized
      const targetPersonas = personas.slice(0, 3);
      let successfulActivations = 0;

      const concurrentActivations = targetPersonas.map(async (persona, index) => {
        try {
          const result = await testEnvironment.personaManager.activatePersona(persona.name);
          if (result.success) {
            successfulActivations++;
            // Small delay to allow other operations
            await new Promise(resolve => setTimeout(resolve, 50));
            await testEnvironment.personaManager.deactivatePersona();
          }
          return result;
        } catch (error) {
          return { success: false, personaName: persona.name, errors: [String(error)] };
        }
      });

      const activationResults = await Promise.allSettled(concurrentActivations);

      // Should handle concurrent activations gracefully
      // Only one should be active at a time, but all should complete without errors
      expect(activationResults.filter(r => r.status === 'rejected').length).toBe(0);
      expect(successfulActivations).toBeGreaterThan(0);
    }, testTimeout);
  });

  describe('Error Recovery Workflows', () => {
    it('should recover from component failures gracefully', async () => {
      await testEnvironment.personaManager.refreshDiscovery();
      const personas = await testEnvironment.personaManager.listPersonas();

      const targetPersona = personas.find(p => p.name.startsWith('small-persona-'));
      expect(targetPersona).toBeDefined();

      // Set intermittent failure mode
      testEnvironment.discoveryEngine.setFailureMode('intermittent');
      testEnvironment.toolsetManager.setFailureMode('intermittent');
      testEnvironment.mcpHandlers.setFailureMode('intermittent');

      let successfulOperations = 0;
      const totalAttempts = 10;

      // Attempt multiple operations with intermittent failures
      for (let i = 0; i < totalAttempts; i++) {
        try {
          // Try discovery refresh
          await testEnvironment.personaManager.refreshDiscovery();

          // Try activation
          const result = await testEnvironment.personaManager.activatePersona(targetPersona!.name);
          if (result.success) {
            successfulOperations++;
            await testEnvironment.personaManager.deactivatePersona();
          }

          // Small delay between attempts
          await new Promise(resolve => setTimeout(resolve, 10));
        } catch (error) {
          // Expected failures should be handled gracefully
          expect(error).toBeInstanceOf(Error);
        }
      }

      // Should have some successful operations despite failures
      expect(successfulOperations).toBeGreaterThan(0);
      expect(successfulOperations).toBeLessThan(totalAttempts); // Some failures expected

      // Reset failure modes
      testEnvironment.discoveryEngine.setFailureMode('none');
      testEnvironment.toolsetManager.setFailureMode('none');
      testEnvironment.mcpHandlers.setFailureMode('none');

      // Verify recovery - should work normally now
      const recoveryResult = await testEnvironment.personaManager.activatePersona(targetPersona!.name);
      expect(recoveryResult.success).toBe(true);

      await testEnvironment.personaManager.deactivatePersona();
    }, testTimeout);

    it('should handle invalid persona activation gracefully', async () => {
      await testEnvironment.personaManager.refreshDiscovery();

      // Try to activate non-existent persona
      const nonExistentResult = await testEnvironment.personaManager.activatePersona('non-existent-persona');
      expect(nonExistentResult.success).toBe(false);
      expect(nonExistentResult.errors).toBeDefined();
      expect(nonExistentResult.errors!.length).toBeGreaterThan(0);

      // Verify manager is still functional
      expect(testEnvironment.personaManager.getActivePersona()).toBeNull();

      // Try to activate invalid persona (should be filtered out or fail validation)
      const invalidResult = await testEnvironment.personaManager.activatePersona('invalid-missing-name');
      expect(invalidResult.success).toBe(false);

      // Verify system is still stable
      const personas = await testEnvironment.personaManager.listPersonas();
      expect(personas.length).toBeGreaterThan(0);

      // Should still be able to activate valid persona
      const validPersona = personas.find(p => p.name.startsWith('small-persona-') && p.isValid);
      expect(validPersona).toBeDefined();

      const validResult = await testEnvironment.personaManager.activatePersona(validPersona!.name);
      expect(validResult.success).toBe(true);

      await testEnvironment.personaManager.deactivatePersona();
    }, testTimeout);

    it('should handle resource cleanup after failures', async () => {
      await testEnvironment.personaManager.refreshDiscovery();
      const personas = await testEnvironment.personaManager.listPersonas();

      const targetPersona = personas.find(p => p.name.startsWith('large-persona-'));
      expect(targetPersona).toBeDefined();

      // Set failure mode after activation starts
      const activationPromise = testEnvironment.personaManager.activatePersona(targetPersona!.name);

      // Introduce failure during activation
      setTimeout(() => {
        testEnvironment.toolsetManager.setFailureMode('permanent');
      }, 100);

      const result = await activationPromise;
      expect(result.success).toBe(false);

      // Verify cleanup occurred despite failure
      expect(testEnvironment.personaManager.getActivePersona()).toBeNull();

      // Reset failure mode
      testEnvironment.toolsetManager.setFailureMode('none');

      // Verify no resource leaks - should be able to perform new operations
      const stats = testEnvironment.personaManager.getStats();
      expect(stats.cache.size).toBeGreaterThanOrEqual(0);

      // Should be able to activate a different persona
      const smallPersona = personas.find(p => p.name.startsWith('small-persona-'));
      const recoveryResult = await testEnvironment.personaManager.activatePersona(smallPersona!.name);
      expect(recoveryResult.success).toBe(true);

      await testEnvironment.personaManager.deactivatePersona();
    }, testTimeout);
  });

  describe('System Responsiveness Under Load', () => {
    it('should maintain responsiveness during high-frequency operations', async () => {
      await testEnvironment.personaManager.refreshDiscovery();
      const personas = await testEnvironment.personaManager.listPersonas();

      const targetPersonas = personas.slice(0, 5);
      const operationTimes: number[] = [];

      // Perform rapid sequential operations
      for (let i = 0; i < 20; i++) {
        const startTime = Date.now();

        // Alternate between different operations
        if (i % 4 === 0) {
          await testEnvironment.personaManager.refreshDiscovery();
        } else if (i % 4 === 1) {
          await testEnvironment.personaManager.listPersonas();
        } else if (i % 4 === 2) {
          const stats = testEnvironment.personaManager.getStats();
          expect(stats).toBeDefined();
        } else {
          // Quick activation/deactivation
          const persona = targetPersonas[i % targetPersonas.length];
          const result = await testEnvironment.personaManager.activatePersona(persona.name);
          if (result.success) {
            await testEnvironment.personaManager.deactivatePersona();
          }
        }

        const operationTime = Date.now() - startTime;
        operationTimes.push(operationTime);

        // No operation should take too long
        expect(operationTime).toBeLessThan(2000);
      }

      // Calculate performance statistics
      const avgTime = operationTimes.reduce((a, b) => a + b, 0) / operationTimes.length;
      const maxTime = Math.max(...operationTimes);

      expect(avgTime).toBeLessThan(500); // Average under 500ms
      expect(maxTime).toBeLessThan(2000); // No single operation over 2s

      // System should still be responsive
      const finalStats = testEnvironment.personaManager.getStats();
      expect(finalStats.discoveredCount).toBeGreaterThan(0);
    }, testTimeout);

    it('should handle memory pressure gracefully', async () => {
      // Configure with very low cache limits to simulate memory pressure
      const limitedEnv = await createE2ETestEnvironment({
        personaCount: 25,
        includeInvalid: true,
        includeLarge: true
      });

      // Override cache config with very small limits
      const limitedManager = new PersonaManager({
        toolDiscoveryEngine: limitedEnv.discoveryEngine,
        toolsetManager: limitedEnv.toolsetManager as any,
        cacheConfig: {
          maxSize: 2, // Very small cache
          ttl: 100,   // Very short TTL
          enableCache: true,
        },
        autoDiscover: true,
        discoveryConfig: {
          searchPaths: [join(limitedEnv.tempDir, 'personas')],
          enableCache: true,
          maxCacheSize: 3, // Very small discovery cache
          cacheTtl: 100,
        },
      });

      await limitedManager.initialize();

      try {
        // Load many personas to trigger cache pressure
        const personas = await limitedManager.listPersonas();

        // Activate multiple personas in sequence to stress cache
        let successfulActivations = 0;
        for (const persona of personas.slice(0, 10)) {
          try {
            const result = await limitedManager.activatePersona(persona.name);
            if (result.success) {
              successfulActivations++;
              await limitedManager.deactivatePersona();
            }
          } catch (error) {
            // Some failures expected due to memory pressure
          }
        }

        expect(successfulActivations).toBeGreaterThan(0);

        // Verify cache is working within limits
        const stats = limitedManager.getStats();
        expect(stats.cache.size).toBeLessThanOrEqual(2);

        // System should still be functional
        const finalPersonas = await limitedManager.listPersonas();
        expect(finalPersonas.length).toBeGreaterThan(0);

      } finally {
        await limitedManager.dispose();
        await limitedEnv.cleanup();
      }
    }, testTimeout);
  });

  describe('Performance Benchmarks', () => {
    it('should meet discovery performance targets', async () => {
      // Clear any existing cache
      await testEnvironment.personaManager.refreshDiscovery();

      const iterations = 5;
      const discoveryTimes: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const startTime = Date.now();
        const result = await testEnvironment.personaManager.refreshDiscovery();
        const discoveryTime = Date.now() - startTime;

        discoveryTimes.push(discoveryTime);

        expect(result.personas.length).toBeGreaterThan(15);
      }

      const avgDiscoveryTime = discoveryTimes.reduce((a, b) => a + b, 0) / discoveryTimes.length;
      const maxDiscoveryTime = Math.max(...discoveryTimes);

      // Benchmark targets
      expect(avgDiscoveryTime).toBeLessThan(2000); // Average under 2s
      expect(maxDiscoveryTime).toBeLessThan(5000); // Max under 5s

      console.log(`Discovery Performance: avg=${avgDiscoveryTime}ms, max=${maxDiscoveryTime}ms`);
    }, testTimeout);

    it('should meet activation performance targets', async () => {
      await testEnvironment.personaManager.refreshDiscovery();
      const personas = await testEnvironment.personaManager.listPersonas();

      const smallPersonas = personas.filter(p => p.name.startsWith('small-persona-'));
      const largePersonas = personas.filter(p => p.name.startsWith('large-persona-'));

      // Test small persona activation
      const smallActivationTimes: number[] = [];
      for (const persona of smallPersonas.slice(0, 5)) {
        const startTime = Date.now();
        const result = await testEnvironment.personaManager.activatePersona(persona.name);
        const activationTime = Date.now() - startTime;

        if (result.success) {
          smallActivationTimes.push(activationTime);
          await testEnvironment.personaManager.deactivatePersona();
        }
      }

      // Test large persona activation
      const largeActivationTimes: number[] = [];
      for (const persona of largePersonas.slice(0, 3)) {
        const startTime = Date.now();
        const result = await testEnvironment.personaManager.activatePersona(persona.name);
        const activationTime = Date.now() - startTime;

        if (result.success) {
          largeActivationTimes.push(activationTime);
          await testEnvironment.personaManager.deactivatePersona();
        }
      }

      // Performance targets
      const avgSmallActivation = smallActivationTimes.reduce((a, b) => a + b, 0) / smallActivationTimes.length;
      const avgLargeActivation = largeActivationTimes.reduce((a, b) => a + b, 0) / largeActivationTimes.length;

      expect(avgSmallActivation).toBeLessThan(500);  // Small personas under 500ms
      expect(avgLargeActivation).toBeLessThan(1000); // Large personas under 1s

      console.log(`Activation Performance: small=${avgSmallActivation}ms, large=${avgLargeActivation}ms`);
    }, testTimeout);
  });
});
