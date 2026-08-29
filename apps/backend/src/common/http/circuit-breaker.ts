export type CircuitState = 'closed' | 'open' | 'half-open';
export type FailureVerdict = 'failure' | 'healthy' | 'ignored';

export class CircuitOpenError extends Error {
  readonly code = 'DEPENDENCY_CIRCUIT_OPEN';

  constructor(
    readonly dependency: string,
    readonly retryAfterMs: number,
  ) {
    super(`${dependency} circuit open; retry after cooldown`);
    this.name = 'CircuitOpenError';
  }
}

/** Per-process protection, not a distributed lock or a payment outcome.
 * Existing request budgets bound the operation itself. This module never retries.
 */
export class CircuitBreaker {
  private state: CircuitState = 'closed';
  private failures = 0;
  private openUntil = 0;
  private generation = 0;

  constructor(
    private readonly options: {
      dependency: string;
      failureThreshold?: number;
      cooldownMs?: number;
      now?: () => number;
      onTransition?: (state: CircuitState) => void;
    },
  ) {
    if (
      !Number.isInteger(this.threshold) ||
      this.threshold < 1 ||
      !Number.isFinite(this.cooldown) ||
      this.cooldown <= 0
    )
      throw new Error('Circuit threshold and cooldown must be positive');
  }

  private get threshold() {
    return this.options.failureThreshold ?? 5;
  }
  private get cooldown() {
    return this.options.cooldownMs ?? 60_000;
  }
  private now() {
    return (this.options.now ?? (() => performance.now()))();
  }

  async execute<T>(
    operation: () => Promise<T>,
    classification: {
      error?: (error: unknown) => FailureVerdict;
      failedResponse?: (result: T) => boolean;
    } = {},
  ): Promise<T> {
    if (
      this.state === 'half-open' ||
      (this.state === 'open' && this.now() < this.openUntil)
    ) {
      throw new CircuitOpenError(
        this.options.dependency,
        Math.max(1, Math.ceil(this.openUntil - this.now())),
      );
    }
    const probe = this.state === 'open';
    if (probe) this.transition('half-open'); // Exactly one probe, claimed before the first await.
    const generation = this.generation;
    try {
      const result = await operation();
      this.settle(
        generation,
        probe,
        classification.failedResponse?.(result) ? 'failure' : 'healthy',
      );
      return result; // Preserve the provider response, including 429/5xx, for its SDK.
    } catch (error) {
      this.settle(
        generation,
        probe,
        classification.error?.(error) ?? 'failure',
      );
      throw error;
    }
  }

  private settle(generation: number, probe: boolean, verdict: FailureVerdict) {
    // An old in-flight success/failure cannot close or extend a newer circuit.
    if (generation !== this.generation) return;
    if (verdict === 'ignored') {
      if (probe) {
        this.openUntil = this.now();
        this.transition('open'); // Cancellation releases the probe; the next caller may try.
      }
      return;
    }
    if (verdict === 'healthy') {
      this.failures = 0;
      if (probe) this.transition('closed');
      return;
    }
    this.failures++;
    if (probe || this.failures >= this.threshold) {
      this.openUntil = this.now() + this.cooldown;
      this.transition('open');
    }
  }

  private transition(state: CircuitState) {
    this.state = state;
    this.generation++;
    // Telemetry is not allowed to break the dependency operation.
    try {
      this.options.onTransition?.(state);
    } catch {
      /* best effort */
    }
  }
}
