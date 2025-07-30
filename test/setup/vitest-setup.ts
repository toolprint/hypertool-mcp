/**
 * Global test setup for Vitest
 * Minimal setup - only clean up test state, no global mocking
 */

import { beforeEach, afterEach } from 'vitest';
import { vol } from 'memfs';

// Ensure clean state before each test
beforeEach(() => {
  vol.reset();
});

// Clean up after each test
afterEach(() => {
  vol.reset();
  // Reset any global test state
  if ((global as any).__TEST_PLATFORM__) {
    delete (global as any).__TEST_PLATFORM__;
  }
});

// Make vol available globally for tests that need direct access
(global as any).__memfs_vol__ = vol;