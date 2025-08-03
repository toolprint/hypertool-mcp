/**
 * Lightweight test utilities for HyperTool MCP tests
 * Replaces heavyweight TestEnvironment with focused utilities
 */

import { vol } from 'memfs';
import { join } from 'path';
import type { ApplicationRegistry } from '../config-manager/types/index.js';

/**
 * Minimal filesystem setup for tests
 * Only creates directories that are actually needed
 */
export interface MinimalFsOptions {
  baseDir?: string;
  createRegistry?: boolean;
  createConfig?: boolean;
}

/**
 * Creates minimal filesystem structure for tests
 * Much lighter than TestEnvironment - only creates what's needed
 */
export function createMinimalFs(options: MinimalFsOptions = {}): {
  baseDir: string;
  configRoot: string;
  cleanup: () => void;
} {
  const baseDir = options.baseDir || '/tmp/hypertool-test';
  const configRoot = join(baseDir, '.hypertool');

  // Reset memfs for clean state
  vol.reset();

  // Create only the essential directories
  vol.mkdirSync(configRoot, { recursive: true });
  
  if (options.createRegistry) {
    const appsDir = join(configRoot, 'apps');
    vol.mkdirSync(appsDir, { recursive: true });
    
    // Create minimal registry
    const registry: ApplicationRegistry = {
      version: '1.0.0',
      applications: {
        'cursor': {
          name: 'Cursor IDE',
          enabled: true,
          platforms: {
            all: {
              configPath: '~/.cursor/mcp.json',
              format: 'standard'
            }
          },
          detection: {
            type: 'directory',
            path: '~/.cursor'
          }
        }
      }
    };
    
    vol.writeFileSync(
      join(appsDir, 'registry.json'),
      JSON.stringify(registry, null, 2)
    );
  }

  if (options.createConfig) {
    vol.writeFileSync(
      join(configRoot, 'config.json'),
      JSON.stringify({ version: '1.0.0', applications: {} }, null, 2)
    );
  }

  return {
    baseDir,
    configRoot,
    cleanup: () => vol.reset()
  };
}

/**
 * Creates a mock application structure
 * Lightweight alternative to TestEnvironment.createMockApp
 */
export function createMockApp(appId: string, files: Record<string, string>): void {
  for (const [path, content] of Object.entries(files)) {
    const dir = path.substring(0, path.lastIndexOf('/'));
    if (dir) {
      vol.mkdirSync(dir, { recursive: true });
    }
    vol.writeFileSync(path, content);
  }
}

/**
 * Quick file operations for tests
 */
export const testFs = {
  write: (path: string, content: string) => {
    const dir = path.substring(0, path.lastIndexOf('/'));
    if (dir) vol.mkdirSync(dir, { recursive: true });
    vol.writeFileSync(path, content);
  },
  
  read: (path: string): string => {
    return vol.readFileSync(path, 'utf-8') as string;
  },
  
  exists: (path: string): boolean => {
    try {
      vol.statSync(path);
      return true;
    } catch {
      return false;
    }
  },
  
  mkdir: (path: string) => {
    vol.mkdirSync(path, { recursive: true });
  },
  
  reset: () => vol.reset()
};

/**
 * Mock environment config for tests
 * Avoids the heavyweight EnvironmentManager singleton
 */
export function createMockEnvConfig(baseDir: string = '/tmp/hypertool-test') {
  return {
    mode: 'test' as const,
    baseDir,
    configRoot: join(baseDir, '.hypertool'),
    registryPath: join(baseDir, '.hypertool/apps/registry.json'),
    backupRoot: join(baseDir, '.hypertool/backups'),
    cacheRoot: join(baseDir, '.hypertool/cache'),
    setupScriptsRoot: join(baseDir, '.hypertool/setup'),
    logsRoot: join(baseDir, '.hypertool/logs')
  };
}

/**
 * Platform mock utilities
 */
export const platformMock = {
  current: process.platform,
  
  set: (platform: NodeJS.Platform) => {
    Object.defineProperty(process, 'platform', {
      value: platform,
      writable: true,
      configurable: true
    });
  },
  
  reset: () => {
    Object.defineProperty(process, 'platform', {
      value: platformMock.current,
      writable: true,
      configurable: true
    });
  }
};

/**
 * Async test wrapper with timeout
 * Prevents hanging tests by enforcing timeouts
 */
export function withTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number = 5000
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Test timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    fn()
      .then(result => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch(error => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

/**
 * Test scenario helper
 * Lightweight alternative to TestEnvironment scenarios
 */
export interface LightweightScenario {
  name: string;
  setup: () => void | Promise<void>;
  teardown?: () => void | Promise<void>;
}

export async function runScenario(scenario: LightweightScenario): Promise<{
  cleanup: () => Promise<void>;
}> {
  await scenario.setup();
  
  return {
    cleanup: async () => {
      if (scenario.teardown) {
        await scenario.teardown();
      }
      vol.reset();
    }
  };
}