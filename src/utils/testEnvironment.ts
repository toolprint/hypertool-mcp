/**
 * Test environment detection and process control utilities
 * Centralized utility to prevent process.exit calls during tests
 */

/**
 * Detect if we're running in a test environment
 */
export function isTestEnvironment(): boolean {
  // Check multiple indicators for test environment
  return (
    // Vitest environment
    process.env.NODE_ENV === 'test' ||
    process.env.NODE_ENV?.includes('test') ||
    // Vitest process detection
    process.env.VITEST === 'true' ||
    // Jest environment (fallback)
    process.env.JEST_WORKER_ID !== undefined ||
    // CLI test indicators
    process.argv.some(arg => arg.includes('vitest') || arg.includes('jest') || arg.includes('test'))
  );
}

/**
 * Safe process exit that respects test environment
 * Only exits in production, throws in tests
 */
export function safeProcessExit(code: number = 0, message?: string): never {
  if (isTestEnvironment()) {
    // In test environment, throw an error instead of exiting
    const error = new TestEnvironmentExitError(code, message);
    throw error;
  } else {
    // In production, actually exit
    if (message) {
      if (code === 0) {
        console.log(message);
      } else {
        console.error(message);
      }
    }
    process.exit(code);
  }
}

/**
 * Exception thrown when code attempts to exit in test environment
 */
export class TestEnvironmentExitError extends Error {
  public readonly exitCode: number;
  public readonly originalMessage?: string;

  constructor(exitCode: number = 0, originalMessage?: string) {
    const message = `Process exit attempted in test environment (code: ${exitCode})${
      originalMessage ? `: ${originalMessage}` : ''
    }`;
    super(message);
    this.name = 'TestEnvironmentExitError';
    this.exitCode = exitCode;
    this.originalMessage = originalMessage;
  }
}

/**
 * Safe wrapper for operations that might exit
 * Returns result or throws in test environment
 */
export async function safeOperationWrapper<T>(
  operation: () => Promise<T> | T,
  errorMessage?: string
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (isTestEnvironment()) {
      throw error; // Re-throw in test environment
    } else {
      // In production, log error and exit
      console.error(errorMessage || 'Operation failed:', error);
      process.exit(1);
    }
  }
}

/**
 * Check if we're in test mode for conditional behavior
 */
export function isInTestMode(): boolean {
  return isTestEnvironment();
}