/**
 * Async test helpers for preventing hanging tests
 * Provides utilities for timeouts, retries, and cleanup
 */

import { vi } from 'vitest';

/**
 * Timeout configuration for different test types
 */
export const TEST_TIMEOUTS = {
  unit: 3000,        // 3 seconds for unit tests
  integration: 10000, // 10 seconds for integration tests
  e2e: 30000,        // 30 seconds for e2e tests
  default: 5000      // 5 seconds default
} as const;

/**
 * Promise with timeout utility
 * Prevents tests from hanging indefinitely
 */
export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number = TEST_TIMEOUTS.default,
  errorMessage?: string
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(errorMessage || `Operation timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    promise
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
 * Retry utility for flaky operations
 * Useful for tests that occasionally fail due to timing issues
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number;
    delay?: number;
    backoff?: boolean;
    timeout?: number;
  } = {}
): Promise<T> {
  const {
    maxRetries = 3,
    delay = 100,
    backoff = true,
    timeout = TEST_TIMEOUTS.default
  } = options;

  let lastError: Error;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await withTimeout(fn(), timeout);
    } catch (error) {
      lastError = error as Error;
      
      if (attempt < maxRetries - 1) {
        const waitTime = backoff ? delay * Math.pow(2, attempt) : delay;
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
  }
  
  throw lastError!;
}

/**
 * Wait for a condition to be true
 * Useful for waiting for async state changes
 */
export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  options: {
    timeout?: number;
    interval?: number;
    errorMessage?: string;
  } = {}
): Promise<void> {
  const {
    timeout = TEST_TIMEOUTS.default,
    interval = 50,
    errorMessage = 'Condition not met within timeout'
  } = options;

  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    const result = await condition();
    if (result) {
      return;
    }
    await new Promise(resolve => setTimeout(resolve, interval));
  }
  
  throw new Error(errorMessage);
}

/**
 * Create a deferred promise for testing async flows
 */
export function createDeferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
} {
  let resolve: (value: T) => void;
  let reject: (error: Error) => void;
  
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  
  return { promise, resolve: resolve!, reject: reject! };
}

/**
 * Test fixture for managing async resources
 * Ensures cleanup even if test fails
 */
export class AsyncTestFixture {
  private cleanupFns: Array<() => void | Promise<void>> = [];
  private activeTimers = new Set<NodeJS.Timeout>();
  private activeIntervals = new Set<NodeJS.Timeout>();

  /**
   * Register a cleanup function
   */
  addCleanup(fn: () => void | Promise<void>): void {
    this.cleanupFns.push(fn);
  }

  /**
   * Create a timer that will be automatically cleaned up
   */
  setTimeout(fn: () => void, delay: number): NodeJS.Timeout {
    const timer = setTimeout(() => {
      this.activeTimers.delete(timer);
      fn();
    }, delay);
    this.activeTimers.add(timer);
    return timer;
  }

  /**
   * Create an interval that will be automatically cleaned up
   */
  setInterval(fn: () => void, delay: number): NodeJS.Timeout {
    const interval = setInterval(fn, delay);
    this.activeIntervals.add(interval);
    return interval;
  }

  /**
   * Clear a timer
   */
  clearTimeout(timer: NodeJS.Timeout): void {
    clearTimeout(timer);
    this.activeTimers.delete(timer);
  }

  /**
   * Clear an interval
   */
  clearInterval(interval: NodeJS.Timeout): void {
    clearInterval(interval);
    this.activeIntervals.delete(interval);
  }

  /**
   * Run all cleanup functions
   */
  async cleanup(): Promise<void> {
    // Clear all timers
    for (const timer of this.activeTimers) {
      clearTimeout(timer);
    }
    for (const interval of this.activeIntervals) {
      clearInterval(interval);
    }
    this.activeTimers.clear();
    this.activeIntervals.clear();

    // Run cleanup functions in reverse order
    const fns = [...this.cleanupFns].reverse();
    this.cleanupFns = [];
    
    for (const fn of fns) {
      try {
        await fn();
      } catch (error) {
        console.error('Cleanup error:', error);
      }
    }
  }
}

/**
 * Mock timer utilities for deterministic async tests
 */
export const mockTimers = {
  /**
   * Use fake timers and return cleanup function
   */
  useFakeTimers(): () => void {
    vi.useFakeTimers();
    return () => {
      vi.clearAllTimers();
      vi.useRealTimers();
    };
  },

  /**
   * Advance timers by time and flush promises
   */
  async advanceTimersByTime(ms: number): Promise<void> {
    vi.advanceTimersByTime(ms);
    await flushPromises();
  },

  /**
   * Run all pending timers and flush promises
   */
  async runAllTimers(): Promise<void> {
    vi.runAllTimers();
    await flushPromises();
  },

  /**
   * Run only pending timers (not recursive) and flush promises
   */
  async runOnlyPendingTimers(): Promise<void> {
    vi.runOnlyPendingTimers();
    await flushPromises();
  }
};

/**
 * Flush all pending promises
 * Useful for ensuring async operations complete
 */
export function flushPromises(): Promise<void> {
  return new Promise(resolve => {
    setImmediate(resolve);
  });
}

/**
 * Create a test timeout guard
 * Automatically fails test if it takes too long
 */
export function createTimeoutGuard(
  timeoutMs: number = TEST_TIMEOUTS.default
): { cancel: () => void } {
  const timer = setTimeout(() => {
    throw new Error(`Test exceeded timeout of ${timeoutMs}ms`);
  }, timeoutMs);

  return {
    cancel: () => clearTimeout(timer)
  };
}

/**
 * Wrap an async test with automatic timeout
 */
export function withTestTimeout<T>(
  testFn: () => Promise<T>,
  timeoutMs: number = TEST_TIMEOUTS.default
): () => Promise<T> {
  return async () => {
    const guard = createTimeoutGuard(timeoutMs);
    try {
      return await testFn();
    } finally {
      guard.cancel();
    }
  };
}