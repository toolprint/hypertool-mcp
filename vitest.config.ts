import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    
    // Optimized timeouts
    testTimeout: 10000,      // 10s for most tests
    hookTimeout: 5000,       // 5s for setup/teardown
    teardownTimeout: 3000,   // 3s for cleanup
    
    // Better parallelization settings
    isolate: true,
    pool: 'threads',         // Use threads for better performance
    poolOptions: {
      threads: {
        singleThread: false, // Allow parallel execution
        isolate: true,
        minThreads: 1,
        maxThreads: 4        // Limit to prevent resource exhaustion
      }
    },
    
    // Enable parallel file execution for unit tests
    maxConcurrency: 4,       // Run up to 4 tests concurrently
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