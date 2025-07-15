/**
 * Error recovery and graceful degradation mechanisms
 */

import { EventEmitter } from "events";
import { Logger, getLogger } from "../logging/index.js";
import { MetaMCPError, isRetryableError, ConnectionError, ServerUnavailableError } from "./index.js";

/**
 * Retry configuration
 */
export interface RetryConfig {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  jitter: boolean;
}

/**
 * Default retry configuration
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  jitter: true,
};

/**
 * Circuit breaker states
 */
export enum CircuitBreakerState {
  CLOSED = "closed",
  OPEN = "open", 
  HALF_OPEN = "half_open",
}

/**
 * Circuit breaker configuration
 */
export interface CircuitBreakerConfig {
  failureThreshold: number;
  recoveryTimeoutMs: number;
  monitoringPeriodMs: number;
  successThreshold: number;
}

/**
 * Default circuit breaker configuration
 */
export const DEFAULT_CIRCUIT_BREAKER_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  recoveryTimeoutMs: 60000, // 1 minute
  monitoringPeriodMs: 10000, // 10 seconds
  successThreshold: 3,
};

/**
 * Fallback strategy interface
 */
export interface FallbackStrategy<T = any> {
  execute(context: FallbackContext): Promise<T>;
  canHandle(error: Error): boolean;
}

/**
 * Fallback context
 */
export interface FallbackContext {
  originalError: Error;
  attemptNumber: number;
  operation: string;
  context?: Record<string, any>;
}

/**
 * Retry utility with exponential backoff
 */
export class RetryManager {
  private config: RetryConfig;
  private logger: Logger;

  constructor(config: Partial<RetryConfig> = {}) {
    this.config = { ...DEFAULT_RETRY_CONFIG, ...config };
    this.logger = getLogger().child("RetryManager");
  }

  /**
   * Execute operation with retry logic
   */
  async execute<T>(
    operation: () => Promise<T>,
    operationName: string,
    context?: Record<string, any>
  ): Promise<T> {
    let lastError: Error;

    for (let attempt = 1; attempt <= this.config.maxAttempts; attempt++) {
      try {
        this.logger.debug(`Executing ${operationName}`, {
          attempt,
          maxAttempts: this.config.maxAttempts,
          ...context,
        });

        const result = await operation();
        
        if (attempt > 1) {
          this.logger.info(`${operationName} succeeded after retry`, {
            attempt,
            ...context,
          });
        }

        return result;
      } catch (error) {
        lastError = error as Error;

        this.logger.warn(`${operationName} failed`, {
          attempt,
          maxAttempts: this.config.maxAttempts,
          error: lastError.message,
          isRetryable: isRetryableError(lastError),
          ...context,
        });

        // Don't retry if error is not retryable or we've reached max attempts
        if (!isRetryableError(lastError) || attempt === this.config.maxAttempts) {
          break;
        }

        // Calculate delay for next attempt
        const delay = this.calculateDelay(attempt);
        this.logger.debug(`Retrying ${operationName} in ${delay}ms`, {
          attempt: attempt + 1,
          delay,
          ...context,
        });

        await this.sleep(delay);
      }
    }

    this.logger.error(`${operationName} failed after all retries`, {
      maxAttempts: this.config.maxAttempts,
      finalError: lastError!.message,
      ...context,
    });

    throw lastError!;
  }

  /**
   * Calculate retry delay with exponential backoff
   */
  private calculateDelay(attempt: number): number {
    let delay = this.config.baseDelayMs * Math.pow(this.config.backoffMultiplier, attempt - 1);
    
    // Apply maximum delay limit
    delay = Math.min(delay, this.config.maxDelayMs);
    
    // Add jitter to prevent thundering herd
    if (this.config.jitter) {
      delay = delay * (0.5 + Math.random() * 0.5);
    }
    
    return Math.floor(delay);
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Circuit breaker for preventing cascading failures
 */
export class CircuitBreaker extends EventEmitter {
  private state: CircuitBreakerState = CircuitBreakerState.CLOSED;
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime?: Date;
  private config: CircuitBreakerConfig;
  private logger: Logger;
  private monitoringTimer?: NodeJS.Timeout;

  constructor(
    private name: string,
    config: Partial<CircuitBreakerConfig> = {}
  ) {
    super();
    this.config = { ...DEFAULT_CIRCUIT_BREAKER_CONFIG, ...config };
    this.logger = getLogger().child("CircuitBreaker");
    this.startMonitoring();
  }

  /**
   * Execute operation through circuit breaker
   */
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === CircuitBreakerState.OPEN) {
      const timeSinceFailure = this.lastFailureTime
        ? Date.now() - this.lastFailureTime.getTime()
        : 0;

      if (timeSinceFailure < this.config.recoveryTimeoutMs) {
        throw new Error(`Circuit breaker '${this.name}' is OPEN`);
      }

      // Transition to half-open for testing
      this.setState(CircuitBreakerState.HALF_OPEN);
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error as Error);
      throw error;
    }
  }

  /**
   * Get current circuit breaker state
   */
  getState(): CircuitBreakerState {
    return this.state;
  }

  /**
   * Get circuit breaker metrics
   */
  getMetrics() {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
    };
  }

  /**
   * Reset circuit breaker
   */
  reset(): void {
    this.setState(CircuitBreakerState.CLOSED);
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = undefined;
  }

  /**
   * Handle successful operation
   */
  private onSuccess(): void {
    this.successCount++;

    if (this.state === CircuitBreakerState.HALF_OPEN) {
      if (this.successCount >= this.config.successThreshold) {
        this.setState(CircuitBreakerState.CLOSED);
        this.failureCount = 0;
        this.successCount = 0;
      }
    } else if (this.state === CircuitBreakerState.CLOSED) {
      this.failureCount = 0;
    }
  }

  /**
   * Handle failed operation
   */
  private onFailure(error: Error): void {
    this.failureCount++;
    this.lastFailureTime = new Date();

    this.logger.warn(`Circuit breaker '${this.name}' recorded failure`, {
      failureCount: this.failureCount,
      threshold: this.config.failureThreshold,
      error: error.message,
    });

    if (this.state === CircuitBreakerState.HALF_OPEN) {
      this.setState(CircuitBreakerState.OPEN);
      this.successCount = 0;
    } else if (
      this.state === CircuitBreakerState.CLOSED &&
      this.failureCount >= this.config.failureThreshold
    ) {
      this.setState(CircuitBreakerState.OPEN);
    }
  }

  /**
   * Set circuit breaker state
   */
  private setState(newState: CircuitBreakerState): void {
    const oldState = this.state;
    this.state = newState;

    this.logger.info(`Circuit breaker '${this.name}' state changed`, {
      from: oldState,
      to: newState,
      failureCount: this.failureCount,
    });

    this.emit("stateChanged", { from: oldState, to: newState });
  }

  /**
   * Start monitoring for automatic state transitions
   */
  private startMonitoring(): void {
    this.monitoringTimer = setInterval(() => {
      if (this.state === CircuitBreakerState.OPEN && this.lastFailureTime) {
        const timeSinceFailure = Date.now() - this.lastFailureTime.getTime();
        if (timeSinceFailure >= this.config.recoveryTimeoutMs) {
          this.logger.debug(`Circuit breaker '${this.name}' ready for testing`);
        }
      }
    }, this.config.monitoringPeriodMs);
  }

  /**
   * Stop monitoring
   */
  destroy(): void {
    if (this.monitoringTimer) {
      clearInterval(this.monitoringTimer);
      this.monitoringTimer = undefined;
    }
  }
}

/**
 * Fallback manager for graceful degradation
 */
export class FallbackManager {
  private strategies: FallbackStrategy[] = [];
  private logger: Logger;

  constructor() {
    this.logger = getLogger().child("FallbackManager");
  }

  /**
   * Register a fallback strategy
   */
  registerStrategy(strategy: FallbackStrategy): void {
    this.strategies.push(strategy);
  }

  /**
   * Execute operation with fallback strategies
   */
  async executeWithFallback<T>(
    operation: () => Promise<T>,
    operationName: string,
    context?: Record<string, any>
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      this.logger.warn(`Primary operation '${operationName}' failed`, {
        error: (error as Error).message,
        ...context,
      });

      return await this.executeFallback(error as Error, operationName, context);
    }
  }

  /**
   * Execute fallback strategies
   */
  private async executeFallback<T>(
    error: Error,
    operationName: string,
    context?: Record<string, any>
  ): Promise<T> {
    for (let i = 0; i < this.strategies.length; i++) {
      const strategy = this.strategies[i];

      if (strategy.canHandle(error)) {
        try {
          this.logger.info(`Executing fallback strategy ${i + 1}`, {
            operation: operationName,
            error: error.message,
            ...context,
          });

          const fallbackContext: FallbackContext = {
            originalError: error,
            attemptNumber: i + 1,
            operation: operationName,
            context,
          };

          return await strategy.execute(fallbackContext);
        } catch (fallbackError) {
          this.logger.warn(`Fallback strategy ${i + 1} failed`, {
            operation: operationName,
            error: (fallbackError as Error).message,
            ...context,
          });
          continue;
        }
      }
    }

    // No fallback strategies worked
    this.logger.error(`All fallback strategies failed for '${operationName}'`, {
      originalError: error.message,
      strategiesAttempted: this.strategies.length,
      ...context,
    });

    throw error;
  }
}

/**
 * Default fallback strategy for server unavailable errors
 */
export class ServerUnavailableFallback implements FallbackStrategy {
  constructor(private fallbackMessage: string = "Service temporarily unavailable") {}

  canHandle(error: Error): boolean {
    return error instanceof ServerUnavailableError || error instanceof ConnectionError;
  }

  async execute(context: FallbackContext): Promise<any> {
    return {
      content: [
        {
          type: "text",
          text: `${this.fallbackMessage}. The requested operation could not be completed due to server connectivity issues. Please try again later.`,
        },
      ],
      isError: true,
      fallback: true,
    };
  }
}

/**
 * Recovery coordinator that manages retry, circuit breakers, and fallbacks
 */
export class RecoveryCoordinator {
  private retryManager: RetryManager;
  private circuitBreakers: Map<string, CircuitBreaker> = new Map();
  private fallbackManager: FallbackManager;
  private logger: Logger;

  constructor(
    retryConfig?: Partial<RetryConfig>,
    circuitBreakerConfig?: Partial<CircuitBreakerConfig>
  ) {
    this.retryManager = new RetryManager(retryConfig);
    this.fallbackManager = new FallbackManager();
    this.logger = getLogger().child("RecoveryCoordinator");

    // Register default fallback strategies
    this.fallbackManager.registerStrategy(new ServerUnavailableFallback());
  }

  /**
   * Execute operation with full recovery mechanisms
   */
  async executeWithRecovery<T>(
    operation: () => Promise<T>,
    operationName: string,
    circuitBreakerName?: string,
    context?: Record<string, any>
  ): Promise<T> {
    const wrappedOperation = circuitBreakerName
      ? () => this.executeWithCircuitBreaker(operation, circuitBreakerName)
      : operation;

    return await this.fallbackManager.executeWithFallback(
      () => this.retryManager.execute(wrappedOperation, operationName, context),
      operationName,
      context
    );
  }

  /**
   * Execute operation with circuit breaker
   */
  private async executeWithCircuitBreaker<T>(
    operation: () => Promise<T>,
    circuitBreakerName: string
  ): Promise<T> {
    let circuitBreaker = this.circuitBreakers.get(circuitBreakerName);
    
    if (!circuitBreaker) {
      circuitBreaker = new CircuitBreaker(circuitBreakerName);
      this.circuitBreakers.set(circuitBreakerName, circuitBreaker);
    }

    return await circuitBreaker.execute(operation);
  }

  /**
   * Get circuit breaker metrics
   */
  getCircuitBreakerMetrics(): Record<string, any> {
    const metrics: Record<string, any> = {};
    
    for (const [name, breaker] of this.circuitBreakers) {
      metrics[name] = breaker.getMetrics();
    }
    
    return metrics;
  }

  /**
   * Register custom fallback strategy
   */
  registerFallbackStrategy(strategy: FallbackStrategy): void {
    this.fallbackManager.registerStrategy(strategy);
  }

  /**
   * Reset all circuit breakers
   */
  resetCircuitBreakers(): void {
    for (const breaker of this.circuitBreakers.values()) {
      breaker.reset();
    }
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    for (const breaker of this.circuitBreakers.values()) {
      breaker.destroy();
    }
    this.circuitBreakers.clear();
  }
}