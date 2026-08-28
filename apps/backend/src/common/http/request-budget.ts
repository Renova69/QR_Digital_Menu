import { HttpException } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';
import { setTimeout as delay } from 'node:timers/promises';

// Leave time to send our response before Cloud Run's 30-second request limit.
// This is server-owned; a caller cannot extend it through a request header.
export const REQUEST_BUDGET_MS = 25_000;

export class RequestBudgetError extends HttpException {
  constructor(readonly kind: 'deadline' | 'closed') {
    super(
      {
        statusCode: kind === 'deadline' ? 504 : 499,
        code:
          kind === 'deadline' ? 'REQUEST_DEADLINE_EXCEEDED' : 'REQUEST_CLOSED',
        message:
          kind === 'deadline'
            ? 'Request timed out. An operation may still complete; check its status before retrying.'
            : 'Request is no longer active.',
      },
      kind === 'deadline' ? 504 : 499,
    );
  }
}

/** One monotonic deadline, shared by every foreground call and retry. */
export class RequestBudget {
  private readonly controller = new AbortController();
  private readonly deadline: number;
  private readonly timer: NodeJS.Timeout;

  constructor(durationMs = REQUEST_BUDGET_MS) {
    if (!Number.isFinite(durationMs) || durationMs <= 0) {
      throw new Error('Request budget must be a positive finite duration');
    }
    this.deadline = performance.now() + durationMs;
    this.timer = setTimeout(() => this.expire(), durationMs);
    this.timer.unref();
  }

  get signal(): AbortSignal {
    // Also enforce the boundary when event-loop work delayed the timer.
    if (performance.now() >= this.deadline) this.expire();
    return this.controller.signal;
  }

  remainingMs(): number {
    return this.signal.aborted
      ? 0
      : Math.max(1, Math.ceil(this.deadline - performance.now()));
  }

  close(): void {
    clearTimeout(this.timer);
    // Late continuations must not start new provider calls after a response.
    this.controller.abort(new RequestBudgetError('closed'));
  }

  private expire(): void {
    clearTimeout(this.timer);
    this.controller.abort(new RequestBudgetError('deadline'));
  }
}

const budgets = new AsyncLocalStorage<RequestBudget>();

export function currentRequestBudget(): RequestBudget | undefined {
  return budgets.getStore();
}

export function withRequestBudget<T>(budget: RequestBudget, work: () => T): T {
  return budgets.run(budget, work);
}

/** Only for work already owned by a queue/background lifecycle, not a timeout escape hatch. */
export function withoutRequestBudget<T>(work: () => T): T {
  return budgets.exit(work);
}

/** Preserve a provider's shorter timeout or explicit caller cancellation. */
export function requestBudgetSignal(
  existing?: AbortSignal | null,
): AbortSignal | undefined {
  const signal = currentRequestBudget()?.signal;
  if (!signal) return existing ?? undefined;
  return existing && existing !== signal
    ? AbortSignal.any([signal, existing])
    : signal;
}

export function assertRequestBudget(): void {
  currentRequestBudget()?.signal.throwIfAborted();
}

/** Retry waits consume the same budget as network work; cron waits are unchanged. */
export async function requestBudgetDelay(durationMs: number): Promise<void> {
  await delay(durationMs, undefined, { signal: requestBudgetSignal() });
}
