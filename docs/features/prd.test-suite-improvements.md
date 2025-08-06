# Test Suite Improvement Implementation Plan

## Overview
This document provides a detailed, actionable implementation plan for improving the hypertool-mcp test suite. Each phase includes specific tasks, code examples, and success criteria.

## Phase 1: Fix Critical Hanging Tests (Priority: P0)
**Timeline: 2-3 days**

### Task 1.1: Fix AppRegistry Timeout Issues
**File**: `/Users/brian/Workspace/toolprint/hypertool-mcp/src/db/nedb/AppRegistry.test.ts`

#### Implementation:
```typescript
// src/test-utils/lightweight-test-env.ts
export class LightweightTestEnv {
  private cleanup: Array<() => Promise<void>> = [];

  async setup(): Promise<void> {
    // Minimal setup - no heavy initialization
  }

  async teardown(): Promise<void> {
    // Execute all cleanup functions
    await Promise.all(this.cleanup.map(fn => fn()));
    this.cleanup = [];
  }

  registerCleanup(fn: () => Promise<void>): void {
    this.cleanup.push(fn);
  }
}

// Updated AppRegistry.test.ts
import { LightweightTestEnv } from '../test-utils/lightweight-test-env';

describe('AppRegistry', () => {
  let env: LightweightTestEnv;
  let registry: AppRegistry;

  beforeEach(async () => {
    env = new LightweightTestEnv();
    await env.setup();

    // Direct initialization without TestEnvironment
    const db = new NeDBDatabaseService({
      configDir: '/tmp/test-' + Date.now(),
      inMemory: true
    });

    registry = new AppRegistry(db);

    // Register cleanup
    env.registerCleanup(async () => {
      await db.close();
    });
  });

  afterEach(async () => {
    await env.teardown();
  });

  // Add explicit timeouts to async operations
  it('should handle operations with timeout', async () => {
    const result = await Promise.race([
      registry.someOperation(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Operation timeout')), 5000)
      )
    ]);
    expect(result).toBeDefined();
  }, 10000); // Explicit test timeout
});
```

**Success Criteria**:
- All AppRegistry tests complete within 10 seconds
- No test hangs or times out
- Resource cleanup is verified

### Task 1.2: Replace TestEnvironment with Lightweight Utilities
**Files**: All test files using TestEnvironment

#### Implementation:
```typescript
// src/test-utils/test-factory.ts
export class TestFactory {
  private static instances = new Map<string, any>();

  static createDatabase(options: Partial<DatabaseOptions> = {}): NeDBDatabaseService {
    const id = `db-${Date.now()}-${Math.random()}`;
    const db = new NeDBDatabaseService({
      configDir: `/tmp/test-${id}`,
      inMemory: true,
      ...options
    });

    this.instances.set(id, db);
    return db;
  }

  static async cleanupAll(): Promise<void> {
    const cleanupPromises = Array.from(this.instances.values()).map(
      instance => instance.close?.() || Promise.resolve()
    );
    await Promise.all(cleanupPromises);
    this.instances.clear();
  }
}

// Example usage in test
beforeEach(() => {
  db = TestFactory.createDatabase();
});

afterEach(async () => {
  await TestFactory.cleanupAll();
});
```

**Success Criteria**:
- TestEnvironment removed from all test files
- Tests run 50% faster
- Memory usage reduced by 30%

### Task 1.3: Implement Proper Async Test Patterns
**Files**: All test files with async operations

#### Implementation:
```typescript
// src/test-utils/async-helpers.ts
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  errorMessage?: string
): Promise<T> {
  const timeout = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(new Error(errorMessage || `Operation timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  return Promise.race([promise, timeout]);
}

export async function waitForCondition(
  condition: () => boolean | Promise<boolean>,
  options: {
    timeout?: number;
    interval?: number;
    errorMessage?: string;
  } = {}
): Promise<void> {
  const { timeout = 5000, interval = 100, errorMessage } = options;
  const start = Date.now();

  while (Date.now() - start < timeout) {
    if (await condition()) {
      return;
    }
    await new Promise(resolve => setTimeout(resolve, interval));
  }

  throw new Error(errorMessage || 'Condition not met within timeout');
}

// Usage in tests
it('should complete async operation', async () => {
  const result = await withTimeout(
    someAsyncOperation(),
    5000,
    'Operation failed to complete'
  );
  expect(result).toBeDefined();
});
```

**Success Criteria**:
- No tests hang indefinitely
- Clear timeout errors when operations exceed limits
- Consistent async patterns across all tests

## Phase 2: Optimize Test Configuration (Priority: P0)
**Timeline: 1-2 days**

### Task 2.1: Update Vitest Configuration
**File**: `/Users/brian/Workspace/toolprint/hypertool-mcp/vitest.config.ts`

#### Implementation:
```typescript
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    // Enable test categorization
    include: [
      'src/**/*.{test,spec}.ts',
      'test/**/*.{test,spec}.ts'
    ],
    exclude: [
      'node_modules',
      'dist',
      '.git',
      'coverage',
      'test/integration/**' // Separate integration tests
    ],

    // Parallel execution settings
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: false,
        isolate: true,
        minThreads: 1,
        maxThreads: 4
      }
    },

    // Timeout configuration
    testTimeout: 10000, // 10 seconds default
    hookTimeout: 10000,
    teardownTimeout: 5000,

    // Reporter configuration
    reporters: ['default', 'junit', 'json'],
    outputFile: {
      junit: './test-results/junit.xml',
      json: './test-results/results.json'
    },

    // Performance monitoring
    benchmark: {
      include: ['**/*.bench.ts'],
      reporters: ['default', 'json'],
      outputFile: './test-results/benchmark.json'
    },

    // Coverage settings
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      exclude: [
        'node_modules/',
        'test/',
        '**/*.d.ts',
        '**/*.config.*',
        '**/mockData.ts',
        '**/*.mock.ts'
      ],
      thresholds: {
        global: {
          branches: 80,
          functions: 80,
          lines: 80,
          statements: 80
        }
      }
    },

    // Global setup/teardown
    globalSetup: './test/setup/global-setup.ts',
    globalTeardown: './test/setup/global-teardown.ts',

    // Environment
    environment: 'node',

    // Retry configuration
    retry: process.env.CI ? 2 : 0,

    // Resource limits
    maxConcurrency: 20,
    dangerouslyIgnoreDynamicImports: false
  },

  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@test-utils': path.resolve(__dirname, './src/test-utils')
    }
  }
});
```

### Task 2.2: Implement Test Categorization
**Files**: New test organization structure

#### Implementation:
```typescript
// test/setup/test-categories.ts
export enum TestCategory {
  UNIT = 'unit',
  INTEGRATION = 'integration',
  E2E = 'e2e',
  PERFORMANCE = 'performance'
}

export interface TestMetadata {
  category: TestCategory;
  timeout?: number;
  retries?: number;
  tags?: string[];
}

// Custom test runner wrapper
export function describeTest(
  name: string,
  metadata: TestMetadata,
  fn: () => void
): void {
  const { category, timeout, retries } = metadata;

  describe(`[${category}] ${name}`, () => {
    if (timeout) {
      vi.setConfig({ testTimeout: timeout });
    }

    if (retries && process.env.CI) {
      vi.setConfig({ retry: retries });
    }

    fn();
  });
}

// Usage example
describeTest('Database Operations', {
  category: TestCategory.INTEGRATION,
  timeout: 20000,
  retries: 2,
  tags: ['database', 'critical']
}, () => {
  // Test implementation
});
```

### Task 2.3: Create Test Scripts
**File**: `/Users/brian/Workspace/toolprint/hypertool-mcp/package.json`

#### Implementation:
```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest watch",
    "test:unit": "vitest run --testNamePattern='\\[unit\\]'",
    "test:integration": "vitest run --testNamePattern='\\[integration\\]'",
    "test:e2e": "vitest run --testNamePattern='\\[e2e\\]'",
    "test:coverage": "vitest run --coverage",
    "test:ui": "vitest --ui",
    "test:benchmark": "vitest bench",
    "test:debug": "vitest --inspect-brk --single-thread",
    "test:ci": "vitest run --reporter=junit --coverage --no-threads"
  }
}
```

**Success Criteria**:
- Tests categorized and can be run separately
- Parallel execution improves test speed by 40%
- Clear test reports generated

## Phase 3: Enhance Test Utilities (Priority: P1)
**Timeline: 3-4 days**

### Task 3.1: Implement TestObjectFactory
**File**: `/Users/brian/Workspace/toolprint/hypertool-mcp/src/test-utils/TestObjectFactory.ts`

#### Implementation:
```typescript
import { faker } from '@faker-js/faker';
import { Tool, ServerConfig, Toolset, ConnectionOptions } from '@/types';

export class TestObjectFactory {
  private static idCounter = 0;

  static reset(): void {
    this.idCounter = 0;
    faker.seed(12345); // Consistent seed for reproducible tests
  }

  static createTool(overrides: Partial<Tool> = {}): Tool {
    const id = `tool-${++this.idCounter}`;
    return {
      id,
      name: faker.hacker.verb() + faker.hacker.noun(),
      description: faker.lorem.sentence(),
      inputSchema: {
        type: 'object',
        properties: {
          input: { type: 'string' }
        }
      },
      serverId: `server-${faker.number.int({ min: 1, max: 5 })}`,
      ...overrides
    };
  }

  static createServerConfig(overrides: Partial<ServerConfig> = {}): ServerConfig {
    const id = `server-${++this.idCounter}`;
    return {
      id,
      name: faker.company.name() + ' Server',
      command: faker.system.filePath(),
      args: [faker.system.commonFileName()],
      env: {
        NODE_ENV: 'test',
        PORT: faker.internet.port().toString()
      },
      enabled: true,
      ...overrides
    };
  }

  static createToolset(overrides: Partial<Toolset> = {}): Toolset {
    const id = `toolset-${++this.idCounter}`;
    const toolCount = faker.number.int({ min: 2, max: 5 });

    return {
      id,
      name: faker.hacker.adjective() + ' Toolset',
      description: faker.lorem.paragraph(),
      tools: Array.from({ length: toolCount }, () => this.createTool()),
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
      ...overrides
    };
  }

  static createBulk<T>(
    factory: () => T,
    count: number,
    transform?: (item: T, index: number) => T
  ): T[] {
    return Array.from({ length: count }, (_, index) => {
      const item = factory();
      return transform ? transform(item, index) : item;
    });
  }
}

// Usage example
const tools = TestObjectFactory.createBulk(
  () => TestObjectFactory.createTool(),
  10,
  (tool, index) => ({ ...tool, name: `Tool ${index + 1}` })
);
```

### Task 3.2: Implement MockConnectionFactory
**File**: `/Users/brian/Workspace/toolprint/hypertool-mcp/src/test-utils/MockConnectionFactory.ts`

#### Implementation:
```typescript
import { EventEmitter } from 'events';
import {
  Connection,
  Message,
  Request,
  Response,
  ConnectionTransport
} from '@/types';

export class MockConnection extends EventEmitter implements Connection {
  private isOpen = true;
  private messageQueue: Message[] = [];
  private responseHandlers = new Map<string, (response: Response) => void>();

  constructor(
    private readonly options: {
      autoRespond?: boolean;
      latency?: number;
      errorRate?: number;
    } = {}
  ) {
    super();
  }

  async send(message: Message): Promise<void> {
    if (!this.isOpen) {
      throw new Error('Connection is closed');
    }

    // Simulate network latency
    if (this.options.latency) {
      await new Promise(resolve => setTimeout(resolve, this.options.latency));
    }

    // Simulate errors
    if (this.options.errorRate && Math.random() < this.options.errorRate) {
      throw new Error('Mock connection error');
    }

    this.messageQueue.push(message);
    this.emit('message', message);

    // Auto-respond to requests
    if (this.options.autoRespond && message.type === 'request') {
      this.simulateResponse(message as Request);
    }
  }

  async request(request: Request): Promise<Response> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Request timeout'));
      }, 5000);

      this.responseHandlers.set(request.id, (response) => {
        clearTimeout(timeout);
        resolve(response);
      });

      this.send(request).catch(reject);
    });
  }

  private simulateResponse(request: Request): void {
    setTimeout(() => {
      const response: Response = {
        id: request.id,
        type: 'response',
        result: { success: true, data: 'Mock response' }
      };

      const handler = this.responseHandlers.get(request.id);
      if (handler) {
        handler(response);
        this.responseHandlers.delete(request.id);
      }

      this.emit('response', response);
    }, 50);
  }

  close(): void {
    this.isOpen = false;
    this.emit('close');
  }

  isConnected(): boolean {
    return this.isOpen;
  }

  getMessages(): Message[] {
    return [...this.messageQueue];
  }

  clearMessages(): void {
    this.messageQueue = [];
  }
}

export class MockConnectionFactory {
  static createConnection(options?: any): MockConnection {
    return new MockConnection(options);
  }

  static createFailingConnection(): MockConnection {
    return new MockConnection({ errorRate: 1 });
  }

  static createSlowConnection(latency: number): MockConnection {
    return new MockConnection({ latency });
  }

  static createMultipleConnections(count: number): MockConnection[] {
    return Array.from({ length: count }, () => this.createConnection());
  }
}
```

### Task 3.3: Implement DatabaseTestHelper
**File**: `/Users/brian/Workspace/toolprint/hypertool-mcp/src/test-utils/DatabaseTestHelper.ts`

#### Implementation:
```typescript
import { NeDBDatabaseService } from '@/db/nedb/NeDBDatabaseService';
import fs from 'fs-extra';
import path from 'path';

export class DatabaseTestHelper {
  private static databases: Map<string, NeDBDatabaseService> = new Map();
  private static baseTestDir = '/tmp/hypertool-test';

  static async createTestDatabase(
    name: string = `test-${Date.now()}`,
    options: Partial<DatabaseOptions> = {}
  ): Promise<NeDBDatabaseService> {
    const configDir = path.join(this.baseTestDir, name);

    // Ensure clean directory
    await fs.ensureDir(configDir);
    await fs.emptyDir(configDir);

    const db = new NeDBDatabaseService({
      configDir,
      inMemory: true,
      ...options
    });

    await db.initialize();
    this.databases.set(name, db);

    return db;
  }

  static async seedDatabase(
    db: NeDBDatabaseService,
    data: {
      servers?: any[];
      tools?: any[];
      toolsets?: any[];
    }
  ): Promise<void> {
    if (data.servers) {
      for (const server of data.servers) {
        await db.getServerRepository().create(server);
      }
    }

    if (data.tools) {
      for (const tool of data.tools) {
        await db.getToolRepository().create(tool);
      }
    }

    if (data.toolsets) {
      for (const toolset of data.toolsets) {
        await db.getToolsetRepository().create(toolset);
      }
    }
  }

  static async cleanupDatabase(name: string): Promise<void> {
    const db = this.databases.get(name);
    if (db) {
      await db.close();
      this.databases.delete(name);
    }

    const configDir = path.join(this.baseTestDir, name);
    await fs.remove(configDir);
  }

  static async cleanupAllDatabases(): Promise<void> {
    const cleanupPromises = Array.from(this.databases.keys()).map(
      name => this.cleanupDatabase(name)
    );
    await Promise.all(cleanupPromises);

    // Clean base directory
    await fs.remove(this.baseTestDir);
  }

  static async snapshotDatabase(db: NeDBDatabaseService): Promise<DatabaseSnapshot> {
    const [servers, tools, toolsets] = await Promise.all([
      db.getServerRepository().findAll(),
      db.getToolRepository().findAll(),
      db.getToolsetRepository().findAll()
    ]);

    return { servers, tools, toolsets, timestamp: new Date() };
  }

  static async restoreSnapshot(
    db: NeDBDatabaseService,
    snapshot: DatabaseSnapshot
  ): Promise<void> {
    // Clear existing data
    await db.clear();

    // Restore snapshot
    await this.seedDatabase(db, snapshot);
  }
}

interface DatabaseSnapshot {
  servers: any[];
  tools: any[];
  toolsets: any[];
  timestamp: Date;
}
```

### Task 3.4: Implement ResourceTracker
**File**: `/Users/brian/Workspace/toolprint/hypertool-mcp/src/test-utils/ResourceTracker.ts`

#### Implementation:
```typescript
import { performance } from 'perf_hooks';

export interface ResourceMetrics {
  memoryUsage: NodeJS.MemoryUsage;
  cpuUsage: NodeJS.CpuUsage;
  duration: number;
  timestamp: Date;
}

export class ResourceTracker {
  private startTime: number = 0;
  private startCpuUsage: NodeJS.CpuUsage | null = null;
  private startMemory: NodeJS.MemoryUsage | null = null;
  private intervals: Map<string, NodeJS.Timer> = new Map();
  private metrics: ResourceMetrics[] = [];

  start(): void {
    this.startTime = performance.now();
    this.startCpuUsage = process.cpuUsage();
    this.startMemory = process.memoryUsage();
  }

  stop(): ResourceMetrics {
    const duration = performance.now() - this.startTime;
    const currentCpuUsage = process.cpuUsage(this.startCpuUsage!);
    const currentMemory = process.memoryUsage();

    const metrics: ResourceMetrics = {
      memoryUsage: currentMemory,
      cpuUsage: currentCpuUsage,
      duration,
      timestamp: new Date()
    };

    this.metrics.push(metrics);
    return metrics;
  }

  startMonitoring(name: string, intervalMs: number = 100): void {
    const interval = setInterval(() => {
      const metrics = this.captureMetrics();
      this.metrics.push(metrics);
    }, intervalMs);

    this.intervals.set(name, interval);
  }

  stopMonitoring(name: string): void {
    const interval = this.intervals.get(name);
    if (interval) {
      clearInterval(interval);
      this.intervals.delete(name);
    }
  }

  private captureMetrics(): ResourceMetrics {
    return {
      memoryUsage: process.memoryUsage(),
      cpuUsage: process.cpuUsage(),
      duration: performance.now() - this.startTime,
      timestamp: new Date()
    };
  }

  getReport(): ResourceReport {
    const avgMemory = this.calculateAverageMemory();
    const peakMemory = this.findPeakMemory();
    const totalDuration = this.metrics.length > 0
      ? this.metrics[this.metrics.length - 1].duration
      : 0;

    return {
      averageMemory: avgMemory,
      peakMemory: peakMemory,
      totalDuration,
      sampleCount: this.metrics.length,
      metrics: this.metrics
    };
  }

  private calculateAverageMemory(): NodeJS.MemoryUsage {
    if (this.metrics.length === 0) {
      return process.memoryUsage();
    }

    const sum = this.metrics.reduce((acc, metric) => ({
      rss: acc.rss + metric.memoryUsage.rss,
      heapTotal: acc.heapTotal + metric.memoryUsage.heapTotal,
      heapUsed: acc.heapUsed + metric.memoryUsage.heapUsed,
      external: acc.external + metric.memoryUsage.external,
      arrayBuffers: acc.arrayBuffers + metric.memoryUsage.arrayBuffers
    }), {
      rss: 0,
      heapTotal: 0,
      heapUsed: 0,
      external: 0,
      arrayBuffers: 0
    });

    const count = this.metrics.length;
    return {
      rss: sum.rss / count,
      heapTotal: sum.heapTotal / count,
      heapUsed: sum.heapUsed / count,
      external: sum.external / count,
      arrayBuffers: sum.arrayBuffers / count
    };
  }

  private findPeakMemory(): NodeJS.MemoryUsage {
    if (this.metrics.length === 0) {
      return process.memoryUsage();
    }

    return this.metrics.reduce((peak, metric) => ({
      rss: Math.max(peak.rss, metric.memoryUsage.rss),
      heapTotal: Math.max(peak.heapTotal, metric.memoryUsage.heapTotal),
      heapUsed: Math.max(peak.heapUsed, metric.memoryUsage.heapUsed),
      external: Math.max(peak.external, metric.memoryUsage.external),
      arrayBuffers: Math.max(peak.arrayBuffers, metric.memoryUsage.arrayBuffers)
    }), this.metrics[0].memoryUsage);
  }

  static formatMemory(bytes: number): string {
    const mb = bytes / 1024 / 1024;
    return `${mb.toFixed(2)} MB`;
  }

  static assertMemoryUsage(
    metrics: ResourceMetrics,
    maxHeapMB: number
  ): void {
    const heapMB = metrics.memoryUsage.heapUsed / 1024 / 1024;
    if (heapMB > maxHeapMB) {
      throw new Error(
        `Memory usage exceeded limit: ${heapMB.toFixed(2)} MB > ${maxHeapMB} MB`
      );
    }
  }
}

interface ResourceReport {
  averageMemory: NodeJS.MemoryUsage;
  peakMemory: NodeJS.MemoryUsage;
  totalDuration: number;
  sampleCount: number;
  metrics: ResourceMetrics[];
}

// Usage example
const tracker = new ResourceTracker();
tracker.start();
tracker.startMonitoring('test-operation');

// Run test operations...

tracker.stopMonitoring('test-operation');
const metrics = tracker.stop();
const report = tracker.getReport();

console.log('Peak memory:', ResourceTracker.formatMemory(report.peakMemory.heapUsed));
ResourceTracker.assertMemoryUsage(metrics, 100); // Assert < 100MB
```

**Success Criteria**:
- All test utilities implemented with full TypeScript support
- Utilities integrated into existing tests
- Test code reduced by 30% through utility reuse

## Phase 4: Improve Test Reliability (Priority: P1)
**Timeline: 2-3 days**

### Task 4.1: Implement Resource Cleanup Patterns
**File**: `/Users/brian/Workspace/toolprint/hypertool-mcp/src/test-utils/cleanup-patterns.ts`

#### Implementation:
```typescript
// src/test-utils/cleanup-patterns.ts
export class CleanupManager {
  private cleanupTasks: Array<{
    name: string;
    priority: number;
    fn: () => Promise<void>;
  }> = [];

  register(
    name: string,
    fn: () => Promise<void>,
    priority: number = 0
  ): void {
    this.cleanupTasks.push({ name, fn, priority });
  }

  async executeAll(): Promise<CleanupReport> {
    // Sort by priority (higher priority first)
    const sortedTasks = [...this.cleanupTasks].sort(
      (a, b) => b.priority - a.priority
    );

    const report: CleanupReport = {
      total: sortedTasks.length,
      successful: 0,
      failed: 0,
      errors: []
    };

    for (const task of sortedTasks) {
      try {
        await task.fn();
        report.successful++;
      } catch (error) {
        report.failed++;
        report.errors.push({
          task: task.name,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    this.cleanupTasks = [];
    return report;
  }
}

interface CleanupReport {
  total: number;
  successful: number;
  failed: number;
  errors: Array<{ task: string; error: string }>;
}

// Global cleanup hooks
export const globalCleanup = new CleanupManager();

// Setup global handlers
process.on('exit', () => {
  globalCleanup.executeAll().catch(console.error);
});

process.on('SIGINT', async () => {
  await globalCleanup.executeAll();
  process.exit(0);
});

// Test-specific cleanup helper
export function withCleanup<T>(
  fn: () => Promise<T>,
  cleanup: () => Promise<void>
): Promise<T> {
  return fn().finally(cleanup);
}

// Resource-specific cleanup utilities
export class ResourceCleanup {
  static async cleanupFile(path: string): Promise<void> {
    try {
      await fs.remove(path);
    } catch (error) {
      // Ignore if file doesn't exist
      if ((error as any).code !== 'ENOENT') {
        throw error;
      }
    }
  }

  static async cleanupDirectory(dir: string): Promise<void> {
    try {
      await fs.emptyDir(dir);
      await fs.remove(dir);
    } catch (error) {
      console.warn(`Failed to cleanup directory ${dir}:`, error);
    }
  }

  static async cleanupProcess(proc: ChildProcess): Promise<void> {
    if (!proc.killed) {
      proc.kill('SIGTERM');

      // Give process time to cleanup
      await new Promise(resolve => setTimeout(resolve, 100));

      // Force kill if still running
      if (!proc.killed) {
        proc.kill('SIGKILL');
      }
    }
  }

  static async cleanupPort(port: number): Promise<void> {
    // Find and kill process using port
    try {
      const { stdout } = await exec(`lsof -ti:${port}`);
      const pid = stdout.trim();
      if (pid) {
        await exec(`kill -9 ${pid}`);
      }
    } catch {
      // Port not in use
    }
  }
}
```

### Task 4.2: Implement Test Retry Logic
**File**: `/Users/brian/Workspace/toolprint/hypertool-mcp/src/test-utils/retry-helpers.ts`

#### Implementation:
```typescript
export interface RetryOptions {
  retries: number;
  delay?: number;
  backoff?: 'linear' | 'exponential';
  onRetry?: (error: Error, attempt: number) => void;
  shouldRetry?: (error: Error) => boolean;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions
): Promise<T> {
  const {
    retries,
    delay = 100,
    backoff = 'exponential',
    onRetry,
    shouldRetry = () => true
  } = options;

  let lastError: Error;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      if (attempt === retries || !shouldRetry(lastError)) {
        throw lastError;
      }

      if (onRetry) {
        onRetry(lastError, attempt + 1);
      }

      const waitTime = backoff === 'exponential'
        ? delay * Math.pow(2, attempt)
        : delay * (attempt + 1);

      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }

  throw lastError!;
}

// Flaky test wrapper
export function flakyTest(
  name: string,
  fn: () => Promise<void>,
  options: Partial<RetryOptions> = {}
): void {
  it(name, async () => {
    await withRetry(fn, {
      retries: 3,
      delay: 500,
      backoff: 'exponential',
      onRetry: (error, attempt) => {
        console.warn(`Test "${name}" failed on attempt ${attempt}:`, error.message);
      },
      shouldRetry: (error) => {
        // Don't retry assertion errors
        return !error.message.includes('expect');
      },
      ...options
    });
  });
}

// Network-specific retry helper
export async function retryNetwork<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3
): Promise<T> {
  return withRetry(fn, {
    retries: maxRetries,
    delay: 1000,
    backoff: 'exponential',
    shouldRetry: (error) => {
      const message = error.message.toLowerCase();
      return message.includes('timeout') ||
             message.includes('econnrefused') ||
             message.includes('network');
    }
  });
}
```

### Task 4.3: Implement Test Monitoring
**File**: `/Users/brian/Workspace/toolprint/hypertool-mcp/src/test-utils/test-monitor.ts`

#### Implementation:
```typescript
import { performance } from 'perf_hooks';

export interface TestMetrics {
  name: string;
  duration: number;
  memory: NodeJS.MemoryUsage;
  status: 'passed' | 'failed' | 'skipped';
  retries?: number;
  error?: string;
}

export class TestMonitor {
  private static instance: TestMonitor;
  private metrics: TestMetrics[] = [];
  private currentTest: {
    name: string;
    startTime: number;
    startMemory: NodeJS.MemoryUsage;
    retries: number;
  } | null = null;

  static getInstance(): TestMonitor {
    if (!this.instance) {
      this.instance = new TestMonitor();
    }
    return this.instance;
  }

  startTest(name: string): void {
    this.currentTest = {
      name,
      startTime: performance.now(),
      startMemory: process.memoryUsage(),
      retries: 0
    };
  }

  endTest(status: 'passed' | 'failed' | 'skipped', error?: Error): void {
    if (!this.currentTest) return;

    const duration = performance.now() - this.currentTest.startTime;
    const memory = process.memoryUsage();

    this.metrics.push({
      name: this.currentTest.name,
      duration,
      memory,
      status,
      retries: this.currentTest.retries,
      error: error?.message
    });

    this.currentTest = null;
  }

  recordRetry(): void {
    if (this.currentTest) {
      this.currentTest.retries++;
    }
  }

  generateReport(): TestReport {
    const totalTests = this.metrics.length;
    const passed = this.metrics.filter(m => m.status === 'passed').length;
    const failed = this.metrics.filter(m => m.status === 'failed').length;
    const skipped = this.metrics.filter(m => m.status === 'skipped').length;

    const totalDuration = this.metrics.reduce((sum, m) => sum + m.duration, 0);
    const avgDuration = totalDuration / totalTests;

    const slowTests = this.metrics
      .filter(m => m.duration > 5000)
      .sort((a, b) => b.duration - a.duration)
      .slice(0, 10);

    const memoryIntensiveTests = this.metrics
      .sort((a, b) => b.memory.heapUsed - a.memory.heapUsed)
      .slice(0, 10);

    const flakyTests = this.metrics
      .filter(m => m.retries > 0)
      .sort((a, b) => b.retries - a.retries);

    return {
      summary: {
        total: totalTests,
        passed,
        failed,
        skipped,
        duration: totalDuration,
        avgDuration
      },
      slowTests,
      memoryIntensiveTests,
      flakyTests,
      failures: this.metrics.filter(m => m.status === 'failed')
    };
  }

  saveReport(filePath: string): void {
    const report = this.generateReport();
    fs.writeFileSync(filePath, JSON.stringify(report, null, 2));
  }

  printSummary(): void {
    const report = this.generateReport();
    console.log('\n=== Test Summary ===');
    console.log(`Total: ${report.summary.total}`);
    console.log(`Passed: ${report.summary.passed}`);
    console.log(`Failed: ${report.summary.failed}`);
    console.log(`Duration: ${(report.summary.duration / 1000).toFixed(2)}s`);

    if (report.slowTests.length > 0) {
      console.log('\n=== Slow Tests ===');
      report.slowTests.forEach(test => {
        console.log(`- ${test.name}: ${(test.duration / 1000).toFixed(2)}s`);
      });
    }

    if (report.flakyTests.length > 0) {
      console.log('\n=== Flaky Tests ===');
      report.flakyTests.forEach(test => {
        console.log(`- ${test.name}: ${test.retries} retries`);
      });
    }
  }
}

interface TestReport {
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    duration: number;
    avgDuration: number;
  };
  slowTests: TestMetrics[];
  memoryIntensiveTests: TestMetrics[];
  flakyTests: TestMetrics[];
  failures: TestMetrics[];
}

// Vitest plugin integration
export const testMonitorPlugin = {
  name: 'test-monitor',

  setup(ctx: any) {
    const monitor = TestMonitor.getInstance();

    ctx.onTestStart((test: any) => {
      monitor.startTest(test.name);
    });

    ctx.onTestFinished((test: any) => {
      monitor.endTest(
        test.result?.state || 'skipped',
        test.result?.error
      );
    });

    ctx.onTestRetry(() => {
      monitor.recordRetry();
    });

    ctx.onFinished(() => {
      monitor.printSummary();
      monitor.saveReport('./test-results/monitor-report.json');
    });
  }
};
```

**Success Criteria**:
- All tests have proper cleanup
- Flaky tests automatically retry
- Test performance monitored and reported
- Resource leaks detected and prevented

## Global Setup Files

### Global Setup
**File**: `/Users/brian/Workspace/toolprint/hypertool-mcp/test/setup/global-setup.ts`

```typescript
import { DatabaseTestHelper } from '@/test-utils/DatabaseTestHelper';
import { globalCleanup } from '@/test-utils/cleanup-patterns';
import { TestMonitor } from '@/test-utils/test-monitor';
import { TestObjectFactory } from '@/test-utils/TestObjectFactory';

export default async function globalSetup() {
  console.log('🚀 Starting global test setup...');

  // Reset test factories
  TestObjectFactory.reset();

  // Initialize test monitor
  const monitor = TestMonitor.getInstance();

  // Register global cleanup
  globalCleanup.register(
    'databases',
    () => DatabaseTestHelper.cleanupAllDatabases(),
    100 // High priority
  );

  // Set test environment variables
  process.env.NODE_ENV = 'test';
  process.env.TEST_TIMEOUT = '10000';

  console.log('✅ Global test setup complete');
}
```

### Global Teardown
**File**: `/Users/brian/Workspace/toolprint/hypertool-mcp/test/setup/global-teardown.ts`

```typescript
import { globalCleanup } from '@/test-utils/cleanup-patterns';
import { TestMonitor } from '@/test-utils/test-monitor';

export default async function globalTeardown() {
  console.log('🧹 Starting global test teardown...');

  try {
    // Execute all registered cleanup tasks
    const report = await globalCleanup.executeAll();

    if (report.failed > 0) {
      console.error('⚠️ Some cleanup tasks failed:', report.errors);
    }

    // Generate final test report
    const monitor = TestMonitor.getInstance();
    monitor.saveReport('./test-results/final-report.json');

    console.log('✅ Global test teardown complete');
  } catch (error) {
    console.error('❌ Global teardown failed:', error);
    process.exit(1);
  }
}
```

## Implementation Order and Dependencies

### Dependency Graph
```
Phase 1 (Critical - Do First)
├── Task 1.1: Fix AppRegistry timeouts
├── Task 1.2: Replace TestEnvironment
└── Task 1.3: Async test patterns

Phase 2 (Configuration - Do Second)
├── Task 2.1: Update vitest.config.ts
├── Task 2.2: Test categorization
└── Task 2.3: Create test scripts

Phase 3 (Utilities - Do Third)
├── Task 3.1: TestObjectFactory
├── Task 3.2: MockConnectionFactory
├── Task 3.3: DatabaseTestHelper
└── Task 3.4: ResourceTracker

Phase 4 (Reliability - Do Last)
├── Task 4.1: Cleanup patterns
├── Task 4.2: Retry logic
└── Task 4.3: Test monitoring
```

### Time Estimates
- **Phase 1**: 2-3 days (critical path)
- **Phase 2**: 1-2 days (can partially overlap with Phase 1)
- **Phase 3**: 3-4 days (can start after Phase 1)
- **Phase 4**: 2-3 days (requires Phase 3)
- **Total**: 8-12 days with some parallel work

## Success Metrics

### Performance Metrics
- Test execution time: <5 minutes for full suite
- Memory usage: <500MB peak during tests
- Parallel execution: 4x speed improvement
- Zero hanging tests

### Reliability Metrics
- Flaky test rate: <1%
- Test success rate: >99% in CI
- Resource leak detection: 100%
- Cleanup success rate: 100%

### Code Quality Metrics
- Test code duplication: <10%
- Test coverage: >80%
- Type coverage: 100%
- Documentation: All utilities documented

## Migration Checklist

For each test file:
- [ ] Remove TestEnvironment import
- [ ] Replace with lightweight utilities
- [ ] Add proper cleanup using CleanupManager
- [ ] Add resource tracking for memory-intensive tests
- [ ] Add retry logic for network operations
- [ ] Update test categories
- [ ] Verify no resource leaks
- [ ] Run tests in isolation and verify pass
