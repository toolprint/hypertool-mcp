import { defineConfig } from 'vitest/config';

// Environment detection for CI-aware configuration
const isCI = !!(process.env.CI || process.env.GITHUB_ACTIONS || process.env.CONTINUOUS_INTEGRATION);

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',

    // CI-aware timeouts (more lenient in CI environment)
    testTimeout: isCI ? 30000 : 10000,     // 30s in CI, 10s local
    hookTimeout: isCI ? 15000 : 5000,      // 15s in CI, 5s local
    teardownTimeout: isCI ? 10000 : 3000,  // 10s in CI, 3s local

    // Better parallelization settings (reduced in CI)
    isolate: true,
    pool: 'threads',         // Use threads for better performance
    poolOptions: {
      threads: {
        singleThread: false, // Allow parallel execution
        isolate: true,
        minThreads: 1,
        maxThreads: isCI ? 2 : 4        // Reduced concurrency in CI to prevent resource exhaustion
      }
    },

    // Enable parallel file execution for unit tests (reduced in CI)
    maxConcurrency: isCI ? 2 : 4,       // Reduced concurrency in CI
    fileParallelism: true,   // Run test files in parallel

    include: [
      'src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}',
      'test/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'
    ],

    setupFiles: ['./src/test-setup.ts', './test/setup/vitest-setup-optimized.ts'],

    // Reporter configuration
    reporters: process.env.CI ? ['json', 'junit'] : ['default'],
    outputFile: {
      json: './test-results/results.json',
      junit: './test-results/junit.xml'
    },

    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: [
        'node_modules/',
        'test/',
        'src/**/*.d.ts',
        'src/**/*.test.ts',
        'src/**/*.spec.ts',
        'src/test-utils/**',
        'src/test-setup.ts'
      ],
      all: false,
      skipFull: true,
      thresholds: {
        lines: 50,
        functions: 50,
        branches: 50,
        statements: 50
      }
    },

    // Performance optimizations
    cache: {
      dir: '.vitest-cache'
    }
  },

  resolve: {
    extensions: ['.js', '.ts', '.json'],
    alias: {
      '@': '/src',
      '@test-utils': '/src/test-utils'
    }
  },

  // Build optimizations for test mode
  esbuild: {
    target: 'node18',
    format: 'esm'
  }
});
