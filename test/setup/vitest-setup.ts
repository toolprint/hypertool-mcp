/**
 * Global test setup for Vitest
 * Enhanced setup with resource cleanup and process monitoring
 */

import { beforeEach, afterEach, vi } from 'vitest';
import { vol } from 'memfs';

// Set test environment
process.env.NODE_ENV = 'test';

// Track active timers and intervals for cleanup
const activeTimers = new Set<NodeJS.Timeout>();
const activeIntervals = new Set<NodeJS.Timeout>();

// Override setTimeout and setInterval to track them
const originalSetTimeout = global.setTimeout;
const originalSetInterval = global.setInterval;
const originalClearTimeout = global.clearTimeout;
const originalClearInterval = global.clearInterval;

global.setTimeout = ((fn: any, delay: number, ...args: any[]) => {
  const timer = originalSetTimeout(fn, delay, ...args);
  activeTimers.add(timer);
  return timer;
}) as any;

global.setInterval = ((fn: any, delay: number, ...args: any[]) => {
  const interval = originalSetInterval(fn, delay, ...args);
  activeIntervals.add(interval);
  return interval;
}) as any;

global.clearTimeout = (timer: NodeJS.Timeout) => {
  activeTimers.delete(timer);
  return originalClearTimeout(timer);
};

global.clearInterval = (interval: NodeJS.Timeout) => {
  activeIntervals.delete(interval);
  return originalClearInterval(interval);
};

// Cleanup function for all active timers
function cleanupTimers() {
  for (const timer of activeTimers) {
    originalClearTimeout(timer);
  }
  for (const interval of activeIntervals) {
    originalClearInterval(interval);
  }
  activeTimers.clear();
  activeIntervals.clear();
}

// Ensure clean state before each test
beforeEach(() => {
  // Fast memfs reset
  vol.reset();

  // Clear any lingering timers
  if (typeof vi !== 'undefined' && vi.isFakeTimers && vi.isFakeTimers()) {
    vi.clearAllTimers();
  }

  // Clean up any real timers
  cleanupTimers();
});

// Clean up after each test
afterEach(async () => {
  // Fast cleanup
  vol.reset();

  // Reset any global test state
  if ((global as any).__TEST_PLATFORM__) {
    delete (global as any).__TEST_PLATFORM__;
  }

  // Clear any test timers
  if (typeof vi !== 'undefined' && vi.isFakeTimers && vi.isFakeTimers()) {
    vi.clearAllTimers();
  }

  // Clean up any real timers
  cleanupTimers();

  // Force garbage collection if available (for cleanup)
  if (global.gc) {
    global.gc();
  }

  // Add a small delay to ensure cleanup completes
  await new Promise(resolve => originalSetTimeout(resolve, 10));
});

// Make vol available globally for tests that need direct access
(global as any).__memfs_vol__ = vol;
