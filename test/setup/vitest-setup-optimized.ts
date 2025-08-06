/**
 * Optimized global test setup for Vitest
 * Lightweight setup focused on performance
 */

import { beforeEach, afterEach, vi } from 'vitest';
import { vol } from 'memfs';
import { EnvironmentManager } from '../../src/config/environment.js';

// Set test environment early
process.env.NODE_ENV = 'test';
process.env.VITEST = 'true';

// Increase max listeners to prevent warnings in tests that create many loggers
// Tests run in parallel and each may create loggers with transports that add exit listeners
process.setMaxListeners(100);

// Lightweight timer tracking
const timers = {
  timeouts: new Set<NodeJS.Timeout>(),
  intervals: new Set<NodeJS.Timeout>()
};

// Override global timer functions for tracking
const originalSetTimeout = global.setTimeout;
const originalSetInterval = global.setInterval;

global.setTimeout = ((fn: any, delay?: number, ...args: any[]) => {
  const timer = originalSetTimeout(() => {
    timers.timeouts.delete(timer);
    fn(...args);
  }, delay);
  timers.timeouts.add(timer);
  return timer;
}) as any;

global.setInterval = ((fn: any, delay?: number, ...args: any[]) => {
  const timer = originalSetInterval(fn, delay, ...args);
  timers.intervals.add(timer);
  return timer;
}) as any;

// Fast timer cleanup
function cleanupTimers() {
  timers.timeouts.forEach(t => clearTimeout(t));
  timers.intervals.forEach(t => clearInterval(t));
  timers.timeouts.clear();
  timers.intervals.clear();
}

// Minimal setup before each test
beforeEach(() => {
  // Reset memfs quickly
  vol.reset();

  // Clear vitest timers if fake
  if (vi.isFakeTimers && vi.isFakeTimers()) {
    vi.clearAllTimers();
  }
});

// Fast cleanup after each test
afterEach(() => {
  // Reset filesystem
  vol.reset();

  // Clean timers
  cleanupTimers();

  // Reset environment if it was used
  if (EnvironmentManager.hasInstance?.()) {
    EnvironmentManager.getInstance().reset();
  }

  // Clear test-specific globals
  const globals = global as any;
  if (globals.__TEST_PLATFORM__) {
    delete globals.__TEST_PLATFORM__;
  }
  if (globals.__memfs_vol__) {
    delete globals.__memfs_vol__;
  }
});

// Make vol available for direct access
(global as any).__memfs_vol__ = vol;

// Performance monitoring for slow tests
if (process.env.TEST_PERF_MONITOR) {
  let testStartTime: number;

  beforeEach(() => {
    testStartTime = Date.now();
  });

  afterEach((context) => {
    const duration = Date.now() - testStartTime;
    if (duration > 1000) {
      console.warn(`Slow test detected: ${context.task.name} took ${duration}ms`);
    }
  });
}
