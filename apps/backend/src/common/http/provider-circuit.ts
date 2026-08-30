import * as Sentry from '@sentry/nestjs';
import { CircuitBreaker, type FailureVerdict } from './circuit-breaker';
import { RequestBudgetError } from './request-budget';

/** No URLs, payloads, tenant ids or credentials enter circuit telemetry. */
export function createProviderCircuit(
  dependency: 'translation' | 'stripe' | 'r2',
) {
  return new CircuitBreaker({
    dependency,
    onTransition(state) {
      Sentry.addBreadcrumb({
        category: 'dependency-circuit',
        message: `${dependency}:${state}`,
        level: 'info',
      });
      if (state === 'open') {
        Sentry.captureMessage('Dependency circuit opened', {
          level: 'warning',
          tags: { subsystem: 'dependency-circuit', dependency },
          fingerprint: ['dependency-circuit', dependency],
        });
      }
    },
  });
}

export function classifyProviderError(error: unknown): FailureVerdict {
  if (error instanceof RequestBudgetError) return 'ignored';
  if (!error || typeof error !== 'object') return 'failure';
  const value = error as {
    name?: string;
    status?: number;
    statusCode?: number;
    response?: { status?: number };
    $metadata?: { httpStatusCode?: number };
  };
  if (value.name === 'AbortError') return 'ignored';
  const status =
    value.$metadata?.httpStatusCode ??
    value.response?.status ??
    value.statusCode ??
    value.status;
  // Authentication, invalid parameters and card declines demonstrate a reachable
  // provider. They must not deny service to other restaurants.
  return typeof status === 'number' &&
    status >= 400 &&
    status < 500 &&
    status !== 429
    ? 'healthy'
    : 'failure';
}
