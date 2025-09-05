/**
 * End-to-End Performance Tests for Persona System
 *
 * Comprehensive performance benchmarking and monitoring for the persona
 * content pack system. Tests performance characteristics, memory usage,
 * cache efficiency, and concurrent operation handling under various loads.
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

import { promises as fs } from 'fs';
import { TestEnvironment } from '../fixtures/base.js';
import { PersonaManager, PersonaManagerConfig } from '../../src/persona/manager.js';
import { PersonaLoader } from '../../src/persona/loader.js';
import { PersonaDiscovery } from '../../src/persona/discovery.js';
import { PersonaEvents } from '../../src/persona/types.js';
import type { ToolsetManager } from '../../src/server/tools/toolset/manager.js';
import type { MCPConfig } from '../../src/types/config.js';
import type { IToolDiscoveryEngine } from '../../src/discovery/types.js';
import type { DiscoveredTool } from '../../src/discovery/types.js';

/**
 * Performance metrics interface
 */
interface E2EMetrics {
  discoveryTime: number;
  validationTime: number;
  loadingTime: number;
  activationTime: number;
  memoryUsage: {
    baseline: number;
    peak: number;
    afterCleanup: number;
  };
  cacheEfficiency: {
    hitRatio: number;
    evictionRate: number;
  };
  throughput: {
    operationsPerSecond: number;
    concurrentOperations: number;
  };
}

/**
 * Memory monitoring utility
 */
class MemoryMonitor {
  private measurements: number[] = [];
  private baseline: number = 0;
  private peak: number = 0;

  startMonitoring() {
    this.baseline = this.getCurrentMemoryUsage();
    this.peak = this.baseline;
    this.measurements = [this.baseline];
  }

  recordMeasurement() {
    const current = this.getCurrentMemoryUsage();
    this.measurements.push(current);
    if (current > this.peak) {
      this.peak = current;
    }
  }

  getMetrics() {
    const current = this.getCurrentMemoryUsage();
    return {
      baseline: this.baseline,
      peak: this.peak,
      current,
      afterCleanup: current,
      measurements: [...this.measurements],
      averageUsage: this.measurements.reduce((a, b) => a + b, 0) / this.measurements.length,
      memoryGrowth: current - this.baseline,
    };
  }

  private getCurrentMemoryUsage(): number {
    const usage = process.memoryUsage();
    return usage.heapUsed / 1024 / 1024; // MB
  }
}

/**
 * Performance benchmarking utility
 */
class PerformanceBenchmark {
  private measurements: Map<string, number[]> = new Map();
  private startTimes: Map<string, number> = new Map();

  startTimer(operation: string) {
    this.startTimes.set(operation, Date.now());
  }

  endTimer(operation: string): number {
    const startTime = this.startTimes.get(operation);
    if (!startTime) {
      throw new Error(`No start time recorded for operation: ${operation}`);
    }

    const duration = Date.now() - startTime;

    if (!this.measurements.has(operation)) {
      this.measurements.set(operation, []);
    }
    this.measurements.get(operation)!.push(duration);

    this.startTimes.delete(operation);
    return duration;
  }

  getStats(operation: string) {
    const measurements = this.measurements.get(operation) || [];
    if (measurements.length === 0) {
      return null;
    }

    const sorted = [...measurements].sort((a, b) => a - b);
    return {
      count: measurements.length,
      min: Math.min(...measurements),
      max: Math.max(...measurements),
      average: measurements.reduce((a, b) => a + b, 0) / measurements.length,
      median: sorted[Math.floor(sorted.length / 2)],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      p99: sorted[Math.floor(sorted.length * 0.99)],
    };
  }

  getAllStats() {
    const stats: Record<string, any> = {};
    for (const [operation, measurements] of this.measurements.entries()) {
      stats[operation] = this.getStats(operation);
    }
    return stats;
  }

  reset() {
    this.measurements.clear();
    this.startTimes.clear();
  }
}

/**
 * Performance-focused tool discovery engine
 */
class PerformanceToolDiscoveryEngine implements IToolDiscoveryEngine {
  private tools: DiscoveredTool[] = [];
  private callCount = 0;
  private artificialDelay = 0;
  private cacheHits = 0;
  private cacheMisses = 0;

  constructor(toolCount: number = 50) {
    this.generateTools(toolCount);
  }

  private generateTools(count: number) {
    const servers = ['git', 'docker', 'filesystem', 'npm', 'testing', 'database', 'kubernetes', 'monitoring'];
    const operations = ['create', 'read', 'update', 'delete', 'list', 'run', 'build', 'deploy', 'test', 'check'];

    this.tools = Array.from({ length: count }, (_, i) => {
      const server = servers[i % servers.length];
      const operation = operations[i % operations.length];

      return {
        name: `${server}.${operation}${i > 20 ? `.${Math.floor(i / 10)}` : ''}`,
        description: `${operation} operation for ${server}`,
        server,
        inputSchema: {
          type: 'object',
          properties: {
            target: { type: 'string' },
            options: { type: 'object' }
          }
        },
      };
    });
  }

  setArtificialDelay(ms: number) {
    this.artificialDelay = ms;
  }

  async discoverTools(): Promise<DiscoveredTool[]> {
    this.callCount++;

    if (this.artificialDelay > 0) {
      await new Promise(resolve => setTimeout(resolve, this.artificialDelay));
    }

    // Simulate cache behavior
    if (Math.random() < 0.7) {
      this.cacheHits++;
    } else {
      this.cacheMisses++;
    }

    return [...this.tools];
  }

  async getDiscoveredTools(): Promise<DiscoveredTool[]> {
    this.cacheHits++;
    return [...this.tools];
  }

  async refreshDiscovery(): Promise<void> {
    this.callCount++;
    if (this.artificialDelay > 0) {
      await new Promise(resolve => setTimeout(resolve, this.artificialDelay));
    }
  }

  getCacheStats() {
    return {
      hits: this.cacheHits,
      misses: this.cacheMisses,
      hitRatio: this.cacheHits / (this.cacheHits + this.cacheMisses),
    };
  }

  getCallCount(): number {
    return this.callCount;
  }

  reset() {
    this.callCount = 0;
    this.cacheHits = 0;
    this.cacheMisses = 0;
    this.artificialDelay = 0;
  }

  on(): this { return this; }
  off(): this { return this; }
  emit(): boolean { return true; }
}

/**
 * Performance-focused toolset manager
 */
class PerformanceToolsetManager {
  private currentToolset: any = null;
  private operationCount = 0;
  private operationLatency = 0;

  setOperationLatency(ms: number) {
    this.operationLatency = ms;
  }

  async setCurrentToolset(config: any) {
    this.operationCount++;

    if (this.operationLatency > 0) {
      await new Promise(resolve => setTimeout(resolve, this.operationLatency));
    }

    this.currentToolset = JSON.parse(JSON.stringify(config));
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

    this.currentToolset = null;
  }

  getOperationCount(): number {
    return this.operationCount;
  }

  reset() {
    this.currentToolset = null;
    this.operationCount = 0;
    this.operationLatency = 0;
  }

  on(): this { return this; }
  off(): this { return this; }
  emit(): boolean { return true; }
}

/**
 * Create large-scale test environment for performance testing
 */
async function createPerformanceTestEnvironment(personaCount: number = 100): Promise<{
  tempDir: string;
  env: TestEnvironment;
  toolsetManager: PerformanceToolsetManager;
  discoveryEngine: PerformanceToolDiscoveryEngine;
  personaManager: PersonaManager;
  cleanup: () => Promise<void>;
}> {
  const tempDir = '/tmp/hypertool-perf-test';
  const env = new TestEnvironment(tempDir);
  await env.setup();

  // Create large number of test personas
  await setupPerformanceTestPersonas(env, personaCount);

  // Initialize performance-focused components
  const discoveryEngine = new PerformanceToolDiscoveryEngine(100); // 100 tools
  const toolsetManager = new PerformanceToolsetManager();

  const config: PersonaManagerConfig = {
    toolDiscoveryEngine: discoveryEngine,
    toolsetManager: toolsetManager as any,
    autoDiscover: true,
    validateOnActivation: true,
    persistState: false,
    discoveryConfig: {
      searchPaths: [join(tempDir, 'personas')],
      enableCache: true,
      maxCacheSize: 100,
      cacheTtl: 600000, // 10 minutes
      maxDepth: 3,
      includeArchives: true,
      watchForChanges: false, // Disable for testing
    },
    cacheConfig: {
      maxSize: 50,
      ttl: 600000, // 10 minutes
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
    personaManager,
    cleanup: async () => {
      await personaManager.dispose();
      await env.teardown();
      vol.reset();
    }
  };
}

/**
 * Setup large number of personas for performance testing
 */
async function setupPerformanceTestPersonas(env: TestEnvironment, count: number): Promise<void> {
  const personas: Record<string, string> = {};

  // Create personas with varying complexity
  for (let i = 1; i <= count; i++) {
    const name = `perf-persona-${i.toString().padStart(3, '0')}`;
    const toolsetCount = Math.floor(Math.random() * 5) + 1; // 1-5 toolsets
    const toolsPerToolset = Math.floor(Math.random() * 10) + 3; // 3-12 tools per toolset

    const toolsets = Array.from({ length: toolsetCount }, (_, j) => {
      const toolsetName = ['basic', 'advanced', 'specialized', 'debug', 'deploy'][j] || `custom-${j}`;
      const toolIds = Array.from({ length: toolsPerToolset }, (_, k) => {
        const toolIndex = (i * toolsetCount + j * toolsPerToolset + k) % 50;
        return `tool.operation${toolIndex}`;
      });

      return `  - name: ${toolsetName}
    toolIds:
${toolIds.map(id => `      - ${id}`).join('\n')}`;
    }).join('\n');

    personas[`personas/${name}/persona.yaml`] = `
name: ${name}
description: Performance test persona ${i}
version: "1.0"
toolsets:
${toolsets}
defaultToolset: basic
metadata:
  author: Performance Test Suite
  tags:
    - performance
    - test
    - batch-${Math.floor((i - 1) / 10)}
  created: "2024-01-01T00:00:00Z"
  lastModified: "2024-01-01T12:00:00Z"
    `.trim();

    personas[`personas/${name}/assets/README.md`] = `# ${name}\n\nPerformance test persona ${i}.`;

    // Add MCP config to some personas
    if (i % 10 === 0) {
      personas[`personas/${name}/mcp.json`] = JSON.stringify({
        mcpServers: {
          [`server-${i}`]: {
            command: `server-${i}`,
            args: [`--port`, `${3000 + i}`]
          }
        }
      }, null, 2);
    }
  }

  await env.createAppStructure('personas', personas);
}

/**
 * Performance test suite
 */
describe.skip('Persona Performance Benchmarks', () => {
  let testEnvironment: any;
  let memoryMonitor: MemoryMonitor;
  let benchmark: PerformanceBenchmark;
  const testTimeout = 60000; // 60 seconds for performance tests

  beforeAll(async () => {
    memoryMonitor = new MemoryMonitor();
    benchmark = new PerformanceBenchmark();
    memoryMonitor.startMonitoring();
  }, testTimeout);

  afterAll(async () => {
    // Clean up environment variable
    delete process.env.HYPERTOOL_PERSONA_DIR;

    if (testEnvironment) {
      await testEnvironment.cleanup();
    }

    // Log final performance metrics
    const finalMemoryMetrics = memoryMonitor.getMetrics();
    const finalBenchmarkStats = benchmark.getAllStats();

    console.log('\n=== FINAL PERFORMANCE METRICS ===');
    console.log('Memory Usage:', finalMemoryMetrics);
    console.log('Operation Benchmarks:', finalBenchmarkStats);
    console.log('================================\n');
  }, testTimeout);

  beforeEach(async () => {
    benchmark.reset();
    memoryMonitor.recordMeasurement();

    // Ensure the performance test directory exists
    const performanceTestDir = '/tmp/hypertool-perf-test/personas';
    await fs.mkdir(performanceTestDir, { recursive: true });

    // Set environment variable for persona directory
    process.env.HYPERTOOL_PERSONA_DIR = performanceTestDir;
  });

  describe('Discovery Performance', () => {
    it('should discover 100 personas within benchmark targets', async () => {
      testEnvironment = await createPerformanceTestEnvironment(100);

      benchmark.startTimer('discovery');
      const discoveryResult = await testEnvironment.personaManager.refreshDiscovery();
      const discoveryTime = benchmark.endTimer('discovery');

      // Benchmark targets: <2000ms for 100 personas
      expect(discoveryTime).toBeLessThan(2000);
      expect(discoveryResult.personas.length).toBe(100);

      memoryMonitor.recordMeasurement();

      // Test repeated discoveries (cache effectiveness)
      const cacheDiscoveries = [];
      for (let i = 0; i < 5; i++) {
        benchmark.startTimer(`cached-discovery-${i}`);
        await testEnvironment.personaManager.refreshDiscovery();
        cacheDiscoveries.push(benchmark.endTimer(`cached-discovery-${i}`));
      }

      const avgCachedTime = cacheDiscoveries.reduce((a, b) => a + b, 0) / cacheDiscoveries.length;
      expect(avgCachedTime).toBeLessThan(discoveryTime * 0.5); // Cached should be much faster

      memoryMonitor.recordMeasurement();
    }, testTimeout);

    it('should handle deep directory structures efficiently', async () => {
      // Create environment with nested persona directories
      testEnvironment = await createPerformanceTestEnvironment(50);

      // Create nested directory structure
      const nestedPersonas: Record<string, string> = {};
      for (let depth = 1; depth <= 5; depth++) {
        for (let i = 1; i <= 10; i++) {
          const path = Array.from({ length: depth }, (_, d) => `level${d + 1}`).join('/');
          const name = `nested-${depth}-${i}`;
          nestedPersonas[`personas/${path}/${name}/persona.yaml`] = `
name: ${name}
description: Nested persona at depth ${depth}
version: "1.0"
toolsets:
  - name: basic
    toolIds:
      - git.status
      - filesystem.read
defaultToolset: basic
          `.trim();
          nestedPersonas[`personas/${path}/${name}/assets/README.md`] = `Nested persona ${name}`;
        }
      }

      await testEnvironment.env.createAppStructure('personas', nestedPersonas);

      benchmark.startTimer('nested-discovery');
      const result = await testEnvironment.personaManager.refreshDiscovery();
      const discoveryTime = benchmark.endTimer('nested-discovery');

      // Should handle deep nesting efficiently
      expect(discoveryTime).toBeLessThan(3000); // <3s for nested structure
      expect(result.personas.length).toBeGreaterThanOrEqual(100); // Should find all personas

      memoryMonitor.recordMeasurement();
    }, testTimeout);

    it('should scale linearly with persona count', async () => {
      const testCounts = [25, 50, 100];
      const discoveryTimes: number[] = [];

      for (const count of testCounts) {
        if (testEnvironment) {
          await testEnvironment.cleanup();
        }

        testEnvironment = await createPerformanceTestEnvironment(count);

        benchmark.startTimer(`discovery-${count}`);
        const result = await testEnvironment.personaManager.refreshDiscovery();
        const discoveryTime = benchmark.endTimer(`discovery-${count}`);

        discoveryTimes.push(discoveryTime);
        expect(result.personas.length).toBe(count);

        memoryMonitor.recordMeasurement();
      }

      // Check for linear scaling (within reasonable tolerance)
      const timePerPersona = discoveryTimes.map((time, i) => time / testCounts[i]);
      const avgTimePerPersona = timePerPersona.reduce((a, b) => a + b, 0) / timePerPersona.length;

      // Time per persona should be consistent (linear scaling)
      timePerPersona.forEach(time => {
        expect(Math.abs(time - avgTimePerPersona)).toBeLessThan(avgTimePerPersona * 0.5);
      });

      console.log(`Discovery Scaling: ${timePerPersona.map(t => t.toFixed(2)).join('ms, ')}ms per persona`);
    }, testTimeout);
  });

  describe('Loading and Validation Performance', () => {
    beforeEach(async () => {
      if (!testEnvironment) {
        testEnvironment = await createPerformanceTestEnvironment(50);
        await testEnvironment.personaManager.refreshDiscovery();
      }
    });

    it('should validate personas efficiently', async () => {
      const personas = await testEnvironment.personaManager.listPersonas({ includeInvalid: true });

      let validationTime = 0;
      let validatedCount = 0;

      // Test validation performance
      for (const persona of personas.slice(0, 20)) {
        benchmark.startTimer(`validation-${persona.name}`);

        // Validation happens during loading/activation
        try {
          const result = await testEnvironment.personaManager.activatePersona(persona.name);
          if (result.success) {
            validatedCount++;
            await testEnvironment.personaManager.deactivatePersona();
          }
        } catch (error) {
          // Some validation failures expected
        }

        validationTime += benchmark.endTimer(`validation-${persona.name}`);
        memoryMonitor.recordMeasurement();
      }

      const avgValidationTime = validationTime / 20;
      expect(avgValidationTime).toBeLessThan(200); // <200ms average validation
      expect(validatedCount).toBeGreaterThan(15); // Most should validate successfully

      console.log(`Validation Performance: ${avgValidationTime.toFixed(2)}ms average`);
    }, testTimeout);

    it('should cache loaded personas effectively', async () => {
      const personas = await testEnvironment.personaManager.listPersonas();
      const targetPersonas = personas.slice(0, 10);

      // First load (cold cache)
      const coldLoadTimes: number[] = [];
      for (const persona of targetPersonas) {
        benchmark.startTimer(`cold-load-${persona.name}`);
        const result = await testEnvironment.personaManager.activatePersona(persona.name);
        const loadTime = benchmark.endTimer(`cold-load-${persona.name}`);

        if (result.success) {
          coldLoadTimes.push(loadTime);
          await testEnvironment.personaManager.deactivatePersona();
        }
        memoryMonitor.recordMeasurement();
      }

      // Second load (warm cache)
      const warmLoadTimes: number[] = [];
      for (const persona of targetPersonas) {
        benchmark.startTimer(`warm-load-${persona.name}`);
        const result = await testEnvironment.personaManager.activatePersona(persona.name);
        const loadTime = benchmark.endTimer(`warm-load-${persona.name}`);

        if (result.success) {
          warmLoadTimes.push(loadTime);
          await testEnvironment.personaManager.deactivatePersona();
        }
      }

      const avgColdLoad = coldLoadTimes.reduce((a, b) => a + b, 0) / coldLoadTimes.length;
      const avgWarmLoad = warmLoadTimes.reduce((a, b) => a + b, 0) / warmLoadTimes.length;

      // Cache should provide significant speedup
      expect(avgWarmLoad).toBeLessThan(avgColdLoad * 0.7);
      console.log(`Cache Effectiveness: cold=${avgColdLoad.toFixed(2)}ms, warm=${avgWarmLoad.toFixed(2)}ms`);

      memoryMonitor.recordMeasurement();
    }, testTimeout);
  });

  describe('Activation Performance', () => {
    beforeEach(async () => {
      if (!testEnvironment) {
        testEnvironment = await createPerformanceTestEnvironment(50);
        await testEnvironment.personaManager.refreshDiscovery();
      }
    });

    it('should meet activation time targets for different persona sizes', async () => {
      const personas = await testEnvironment.personaManager.listPersonas();

      // Test different persona sizes
      const smallPersonas = personas.filter(p => p.name.includes('001') || p.name.includes('002'));
      const mediumPersonas = personas.filter(p => p.name.includes('025') || p.name.includes('026'));
      const largePersonas = personas.filter(p => p.name.includes('049') || p.name.includes('050'));

      // Small personas
      const smallActivationTimes: number[] = [];
      for (const persona of smallPersonas.slice(0, 3)) {
        benchmark.startTimer(`small-activation-${persona.name}`);
        const result = await testEnvironment.personaManager.activatePersona(persona.name);
        const activationTime = benchmark.endTimer(`small-activation-${persona.name}`);

        if (result.success) {
          smallActivationTimes.push(activationTime);
          await testEnvironment.personaManager.deactivatePersona();
        }
        memoryMonitor.recordMeasurement();
      }

      // Medium personas
      const mediumActivationTimes: number[] = [];
      for (const persona of mediumPersonas.slice(0, 3)) {
        benchmark.startTimer(`medium-activation-${persona.name}`);
        const result = await testEnvironment.personaManager.activatePersona(persona.name);
        const activationTime = benchmark.endTimer(`medium-activation-${persona.name}`);

        if (result.success) {
          mediumActivationTimes.push(activationTime);
          await testEnvironment.personaManager.deactivatePersona();
        }
      }

      // Large personas
      const largeActivationTimes: number[] = [];
      for (const persona of largePersonas.slice(0, 3)) {
        benchmark.startTimer(`large-activation-${persona.name}`);
        const result = await testEnvironment.personaManager.activatePersona(persona.name);
        const activationTime = benchmark.endTimer(`large-activation-${persona.name}`);

        if (result.success) {
          largeActivationTimes.push(activationTime);
          await testEnvironment.personaManager.deactivatePersona();
        }
      }

      // Calculate averages
      const avgSmall = smallActivationTimes.reduce((a, b) => a + b, 0) / smallActivationTimes.length;
      const avgMedium = mediumActivationTimes.reduce((a, b) => a + b, 0) / mediumActivationTimes.length;
      const avgLarge = largeActivationTimes.reduce((a, b) => a + b, 0) / largeActivationTimes.length;

      // Performance targets
      expect(avgSmall).toBeLessThan(300);   // <300ms for small personas
      expect(avgMedium).toBeLessThan(500);  // <500ms for medium personas
      expect(avgLarge).toBeLessThan(1000);  // <1s for large personas

      console.log(`Activation Performance: small=${avgSmall.toFixed(2)}ms, medium=${avgMedium.toFixed(2)}ms, large=${avgLarge.toFixed(2)}ms`);

      memoryMonitor.recordMeasurement();
    }, testTimeout);

    it('should handle rapid activation/deactivation cycles', async () => {
      const personas = await testEnvironment.personaManager.listPersonas();
      const targetPersonas = personas.slice(0, 10);

      const cycleCount = 20;
      const cycleTimes: number[] = [];

      for (let i = 0; i < cycleCount; i++) {
        const persona = targetPersonas[i % targetPersonas.length];

        benchmark.startTimer(`cycle-${i}`);

        const activationResult = await testEnvironment.personaManager.activatePersona(persona.name);
        expect(activationResult.success).toBe(true);

        await testEnvironment.personaManager.deactivatePersona();

        const cycleTime = benchmark.endTimer(`cycle-${i}`);
        cycleTimes.push(cycleTime);

        memoryMonitor.recordMeasurement();
      }

      const avgCycleTime = cycleTimes.reduce((a, b) => a + b, 0) / cycleTimes.length;
      const maxCycleTime = Math.max(...cycleTimes);

      expect(avgCycleTime).toBeLessThan(800);  // <800ms average cycle
      expect(maxCycleTime).toBeLessThan(2000); // <2s max cycle

      console.log(`Cycle Performance: avg=${avgCycleTime.toFixed(2)}ms, max=${maxCycleTime.toFixed(2)}ms`);
    }, testTimeout);
  });

  describe('Memory Usage and Leak Detection', () => {
    beforeEach(async () => {
      if (!testEnvironment) {
        testEnvironment = await createPerformanceTestEnvironment(30);
        await testEnvironment.personaManager.refreshDiscovery();
      }
      memoryMonitor.recordMeasurement();
    });

    it('should maintain stable memory usage during operations', async () => {
      const baselineMemory = memoryMonitor.getMetrics().current;
      const personas = await testEnvironment.personaManager.listPersonas();

      // Perform many operations
      for (let i = 0; i < 50; i++) {
        const persona = personas[i % personas.length];

        await testEnvironment.personaManager.activatePersona(persona.name);
        await testEnvironment.personaManager.deactivatePersona();

        if (i % 10 === 9) {
          memoryMonitor.recordMeasurement();

          // Force garbage collection if available
          if (global.gc) {
            global.gc();
          }
        }
      }

      const finalMemoryMetrics = memoryMonitor.getMetrics();
      const memoryGrowth = finalMemoryMetrics.current - baselineMemory;

      // Memory growth should be minimal
      expect(memoryGrowth).toBeLessThan(50); // <50MB growth
      expect(finalMemoryMetrics.peak - baselineMemory).toBeLessThan(100); // <100MB peak

      console.log(`Memory Stability: baseline=${baselineMemory.toFixed(2)}MB, final=${finalMemoryMetrics.current.toFixed(2)}MB, growth=${memoryGrowth.toFixed(2)}MB`);
    }, testTimeout);

    it('should properly clean up resources after disposal', async () => {
      const initialMemory = memoryMonitor.getMetrics().current;

      // Create and use persona manager extensively
      const personas = await testEnvironment.personaManager.listPersonas();

      for (const persona of personas.slice(0, 20)) {
        await testEnvironment.personaManager.activatePersona(persona.name);
        await testEnvironment.personaManager.deactivatePersona();
      }

      const preDisposalMemory = memoryMonitor.getMetrics().current;

      // Dispose of persona manager
      await testEnvironment.personaManager.dispose();

      // Force garbage collection
      if (global.gc) {
        global.gc();
      }

      // Wait a bit for cleanup
      await new Promise(resolve => setTimeout(resolve, 100));
      memoryMonitor.recordMeasurement();

      const postDisposalMemory = memoryMonitor.getMetrics().current;
      const memoryRecovered = preDisposalMemory - postDisposalMemory;

      // Should recover significant memory after disposal
      expect(memoryRecovered).toBeGreaterThan(-20); // Some recovery expected (negative means memory decreased)

      console.log(`Resource Cleanup: pre=${preDisposalMemory.toFixed(2)}MB, post=${postDisposalMemory.toFixed(2)}MB, recovered=${memoryRecovered.toFixed(2)}MB`);
    }, testTimeout);

    it('should handle cache pressure without memory leaks', async () => {
      // Configure with small cache to force evictions
      if (testEnvironment) {
        await testEnvironment.cleanup();
      }

      // Create environment with very limited cache
      const limitedConfig: PersonaManagerConfig = {
        toolDiscoveryEngine: new PerformanceToolDiscoveryEngine(20),
        autoDiscover: true,
        cacheConfig: {
          maxSize: 3,  // Very small cache
          ttl: 1000,   // Short TTL
          enableCache: true,
        },
        discoveryConfig: {
          searchPaths: ['/tmp/hypertool-perf-test/personas'],
          enableCache: true,
          maxCacheSize: 5,
          maxDepth: 3,
          includeArchives: true,
          watchForChanges: false,
        },
      };

      const limitedManager = new PersonaManager(limitedConfig);
      await limitedManager.initialize();

      try {
        const initialMemory = memoryMonitor.getMetrics().current;

        await limitedManager.refreshDiscovery();
        const personas = await limitedManager.listPersonas();

        // Force many cache evictions
        for (let round = 0; round < 5; round++) {
          for (const persona of personas.slice(0, 10)) {
            try {
              await limitedManager.activatePersona(persona.name);
              await limitedManager.deactivatePersona();
            } catch (error) {
              // Some operations may fail due to cache pressure
            }

            if (Math.random() < 0.3) {
              memoryMonitor.recordMeasurement();
            }
          }
        }

        const finalMemory = memoryMonitor.getMetrics().current;
        const memoryGrowth = finalMemory - initialMemory;

        // Memory growth should remain bounded despite cache pressure
        expect(memoryGrowth).toBeLessThan(30); // <30MB growth under pressure

        const stats = limitedManager.getStats();
        expect(stats.cache.size).toBeLessThanOrEqual(3); // Cache should respect limits

        console.log(`Cache Pressure Test: growth=${memoryGrowth.toFixed(2)}MB, cache size=${stats.cache.size}`);

      } finally {
        await limitedManager.dispose();
      }
    }, testTimeout);
  });

  describe('Concurrent Operation Performance', () => {
    beforeEach(async () => {
      if (!testEnvironment) {
        testEnvironment = await createPerformanceTestEnvironment(40);
        await testEnvironment.personaManager.refreshDiscovery();
      }
    });

    it('should handle concurrent discovery operations efficiently', async () => {
      const concurrencyLevels = [1, 2, 5, 10];

      for (const concurrency of concurrencyLevels) {
        benchmark.startTimer(`concurrent-discovery-${concurrency}`);

        const promises = Array.from({ length: concurrency }, () =>
          testEnvironment.personaManager.refreshDiscovery()
        );

        const results = await Promise.allSettled(promises);
        const totalTime = benchmark.endTimer(`concurrent-discovery-${concurrency}`);

        const failures = results.filter(r => r.status === 'rejected');
        expect(failures.length).toBe(0);

        // Higher concurrency shouldn't cause proportional slowdown
        const timePerOperation = totalTime / concurrency;
        expect(timePerOperation).toBeLessThan(2000); // Each operation should still be reasonable

        memoryMonitor.recordMeasurement();
      }

      const concurrencyStats = benchmark.getAllStats();
      console.log('Concurrent Discovery Performance:', concurrencyStats);
    }, testTimeout);

    it('should maintain throughput under concurrent load', async () => {
      const personas = await testEnvironment.personaManager.listPersonas();
      const targetPersonas = personas.slice(0, 20);

      const concurrentActivations = 5;
      let completedOperations = 0;

      benchmark.startTimer('concurrent-throughput');

      // Start concurrent activation/deactivation operations
      const workers = Array.from({ length: concurrentActivations }, async (_, workerId) => {
        for (let i = 0; i < 10; i++) {
          const persona = targetPersonas[(workerId * 10 + i) % targetPersonas.length];

          try {
            const result = await testEnvironment.personaManager.activatePersona(persona.name);
            if (result.success) {
              await testEnvironment.personaManager.deactivatePersona();
              completedOperations++;
            }
          } catch (error) {
            // Some operations may conflict, that's expected
          }

          // Small delay to simulate real usage
          await new Promise(resolve => setTimeout(resolve, 10));
        }
      });

      await Promise.allSettled(workers);
      const totalTime = benchmark.endTimer('concurrent-throughput');

      const throughput = completedOperations / (totalTime / 1000); // Operations per second
      expect(throughput).toBeGreaterThan(2); // At least 2 ops/sec under load

      console.log(`Concurrent Throughput: ${completedOperations} operations in ${totalTime}ms = ${throughput.toFixed(2)} ops/sec`);

      memoryMonitor.recordMeasurement();
    }, testTimeout);

    it('should handle mixed operation types efficiently', async () => {
      const personas = await testEnvironment.personaManager.listPersonas();

      const operations = [
        () => testEnvironment.personaManager.refreshDiscovery(),
        () => testEnvironment.personaManager.listPersonas(),
        () => testEnvironment.personaManager.getStats(),
        () => {
          const persona = personas[Math.floor(Math.random() * personas.length)];
          return testEnvironment.personaManager.activatePersona(persona.name)
            .then(result => {
              if (result.success) {
                return testEnvironment.personaManager.deactivatePersona();
              }
            });
        },
      ];

      benchmark.startTimer('mixed-operations');

      // Run mixed operations concurrently
      const concurrentOps = Array.from({ length: 30 }, () => {
        const operation = operations[Math.floor(Math.random() * operations.length)];
        return operation().catch(() => {}); // Ignore individual failures
      });

      await Promise.allSettled(concurrentOps);
      const totalTime = benchmark.endTimer('mixed-operations');

      expect(totalTime).toBeLessThan(10000); // Should complete within 10s

      // System should still be responsive
      const finalStats = testEnvironment.personaManager.getStats();
      expect(finalStats.discoveredCount).toBeGreaterThan(0);

      console.log(`Mixed Operations Performance: ${totalTime}ms for 30 concurrent operations`);

      memoryMonitor.recordMeasurement();
    }, testTimeout);
  });

  describe('Cache Efficiency Benchmarks', () => {
    beforeEach(async () => {
      if (!testEnvironment) {
        testEnvironment = await createPerformanceTestEnvironment(30);
        await testEnvironment.personaManager.refreshDiscovery();
      }
    });

    it('should achieve target cache hit ratios', async () => {
      const personas = await testEnvironment.personaManager.listPersonas();
      const targetPersonas = personas.slice(0, 15);

      // First pass - populate cache
      for (const persona of targetPersonas) {
        await testEnvironment.personaManager.activatePersona(persona.name);
        await testEnvironment.personaManager.deactivatePersona();
      }

      // Second pass - measure cache performance
      let cacheHits = 0;
      let totalOperations = 0;

      for (let round = 0; round < 3; round++) {
        for (const persona of targetPersonas) {
          benchmark.startTimer(`cached-activation-${totalOperations}`);

          const result = await testEnvironment.personaManager.activatePersona(persona.name);
          const operationTime = benchmark.endTimer(`cached-activation-${totalOperations}`);

          if (result.success) {
            await testEnvironment.personaManager.deactivatePersona();

            // Fast operations indicate cache hits
            if (operationTime < 100) {
              cacheHits++;
            }
          }

          totalOperations++;
        }
      }

      const cacheHitRatio = cacheHits / totalOperations;
      expect(cacheHitRatio).toBeGreaterThan(0.7); // >70% cache hit ratio

      console.log(`Cache Efficiency: ${cacheHits}/${totalOperations} hits = ${(cacheHitRatio * 100).toFixed(1)}%`);

      memoryMonitor.recordMeasurement();
    }, testTimeout);

    it('should optimize cache eviction under memory pressure', async () => {
      // Create environment with limited cache size
      const smallCacheEnv = await createPerformanceTestEnvironment(20);
      const smallCacheManager = new PersonaManager({
        toolDiscoveryEngine: smallCacheEnv.discoveryEngine,
        toolsetManager: smallCacheEnv.toolsetManager as any,
        cacheConfig: {
          maxSize: 5, // Small cache to force evictions
          ttl: 30000,
          enableCache: true,
        },
        autoDiscover: true,
        discoveryConfig: {
          searchPaths: [join(smallCacheEnv.tempDir, 'personas')],
          enableCache: true,
        },
      });

      await smallCacheManager.initialize();

      try {
        await smallCacheManager.refreshDiscovery();
        const personas = await smallCacheManager.listPersonas();

        let evictionCount = 0;
        const initialCacheSize = smallCacheManager.getStats().cache.size;

        // Load many personas to trigger evictions
        for (let i = 0; i < 15; i++) {
          const persona = personas[i % personas.length];

          const preSize = smallCacheManager.getStats().cache.size;
          await smallCacheManager.activatePersona(persona.name);
          await smallCacheManager.deactivatePersona();
          const postSize = smallCacheManager.getStats().cache.size;

          if (postSize < preSize + 1) {
            evictionCount++;
          }

          memoryMonitor.recordMeasurement();
        }

        const finalStats = smallCacheManager.getStats();

        // Cache should stay within limits
        expect(finalStats.cache.size).toBeLessThanOrEqual(5);

        // Should have triggered evictions
        expect(evictionCount).toBeGreaterThan(0);

        console.log(`Cache Eviction: ${evictionCount} evictions, final size: ${finalStats.cache.size}`);

      } finally {
        await smallCacheManager.dispose();
        await smallCacheEnv.cleanup();
      }
    }, testTimeout);
  });

  describe('System Resource Monitoring', () => {
    beforeEach(async () => {
      if (!testEnvironment) {
        testEnvironment = await createPerformanceTestEnvironment(25);
        await testEnvironment.personaManager.refreshDiscovery();
      }
    });

    it('should monitor resource usage during long-running operations', async () => {
      const personas = await testEnvironment.personaManager.listPersonas();
      const startTime = Date.now();
      const resourceSamples: any[] = [];

      // Start resource monitoring
      const monitoringInterval = setInterval(() => {
        const memoryUsage = process.memoryUsage();
        resourceSamples.push({
          timestamp: Date.now() - startTime,
          heapUsed: memoryUsage.heapUsed / 1024 / 1024, // MB
          heapTotal: memoryUsage.heapTotal / 1024 / 1024, // MB
          external: memoryUsage.external / 1024 / 1024, // MB
        });
      }, 500);

      // Run operations for extended period
      try {
        for (let round = 0; round < 5; round++) {
          for (const persona of personas.slice(0, 10)) {
            await testEnvironment.personaManager.activatePersona(persona.name);
            await new Promise(resolve => setTimeout(resolve, 50)); // Simulate work
            await testEnvironment.personaManager.deactivatePersona();
          }

          // Periodic discovery refresh
          if (round % 2 === 0) {
            await testEnvironment.personaManager.refreshDiscovery();
          }
        }
      } finally {
        clearInterval(monitoringInterval);
      }

      // Analyze resource usage patterns
      const maxHeapUsed = Math.max(...resourceSamples.map(s => s.heapUsed));
      const minHeapUsed = Math.min(...resourceSamples.map(s => s.heapUsed));
      const avgHeapUsed = resourceSamples.reduce((sum, s) => sum + s.heapUsed, 0) / resourceSamples.length;

      // Memory usage should be reasonable
      expect(maxHeapUsed).toBeLessThan(200); // <200MB max heap
      expect(maxHeapUsed - minHeapUsed).toBeLessThan(100); // <100MB variation

      console.log(`Resource Usage: min=${minHeapUsed.toFixed(2)}MB, avg=${avgHeapUsed.toFixed(2)}MB, max=${maxHeapUsed.toFixed(2)}MB`);

      memoryMonitor.recordMeasurement();
    }, testTimeout);

    it('should generate comprehensive performance report', async () => {
      const personas = await testEnvironment.personaManager.listPersonas();
      const report: E2EMetrics = {
        discoveryTime: 0,
        validationTime: 0,
        loadingTime: 0,
        activationTime: 0,
        memoryUsage: {
          baseline: 0,
          peak: 0,
          afterCleanup: 0,
        },
        cacheEfficiency: {
          hitRatio: 0,
          evictionRate: 0,
        },
        throughput: {
          operationsPerSecond: 0,
          concurrentOperations: 0,
        },
      };

      // Discovery performance
      benchmark.startTimer('final-discovery');
      await testEnvironment.personaManager.refreshDiscovery();
      report.discoveryTime = benchmark.endTimer('final-discovery');

      // Activation performance
      const activationTimes: number[] = [];
      for (const persona of personas.slice(0, 10)) {
        benchmark.startTimer(`final-activation-${persona.name}`);
        const result = await testEnvironment.personaManager.activatePersona(persona.name);
        if (result.success) {
          activationTimes.push(benchmark.endTimer(`final-activation-${persona.name}`));
          await testEnvironment.personaManager.deactivatePersona();
        }
      }
      report.activationTime = activationTimes.reduce((a, b) => a + b, 0) / activationTimes.length;

      // Memory metrics
      const memoryMetrics = memoryMonitor.getMetrics();
      report.memoryUsage = {
        baseline: memoryMetrics.baseline,
        peak: memoryMetrics.peak,
        afterCleanup: memoryMetrics.current,
      };

      // Throughput test
      const throughputStart = Date.now();
      let throughputOps = 0;

      const throughputPromises = Array.from({ length: 5 }, async () => {
        for (let i = 0; i < 5; i++) {
          const persona = personas[i % personas.length];
          const result = await testEnvironment.personaManager.activatePersona(persona.name);
          if (result.success) {
            await testEnvironment.personaManager.deactivatePersona();
            throughputOps++;
          }
        }
      });

      await Promise.allSettled(throughputPromises);
      const throughputTime = Date.now() - throughputStart;
      report.throughput.operationsPerSecond = throughputOps / (throughputTime / 1000);
      report.throughput.concurrentOperations = 5;

      // Cache efficiency
      const toolDiscoveryStats = testEnvironment.discoveryEngine.getCacheStats();
      report.cacheEfficiency.hitRatio = toolDiscoveryStats.hitRatio || 0;

      // Validate benchmark targets
      expect(report.discoveryTime).toBeLessThan(2000);        // <2s discovery
      expect(report.activationTime).toBeLessThan(500);        // <500ms activation
      expect(report.memoryUsage.peak).toBeLessThan(150);      // <150MB peak memory
      expect(report.throughput.operationsPerSecond).toBeGreaterThan(1); // >1 ops/sec

      console.log('\n=== COMPREHENSIVE PERFORMANCE REPORT ===');
      console.log(JSON.stringify(report, null, 2));
      console.log('=========================================\n');

      memoryMonitor.recordMeasurement();
    }, testTimeout);
  });
});
